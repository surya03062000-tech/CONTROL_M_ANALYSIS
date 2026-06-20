// Leave Request data layer — stores everything in Databricks Delta tables via the
// SQL Statement Execution API (uses the same host/token as the rest of the app,
// plus a SQL Warehouse). Low-volume team tool, so the lakehouse is a fine store.
import { hashPassword } from "./leaveAuth";

const clean = (v: string | undefined) =>
  (v || "").trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim();

const HOST = clean(process.env.DATABRICKS_HOST).replace(/\/+$/, "") || "https://dbc-927300a1-adc8.cloud.databricks.com";
const TOKEN = clean(process.env.DATABRICKS_TOKEN);
// SQL Warehouse used to store leave data. Warehouse ID is a non-secret identifier,
// so we default to the team's warehouse; override via env if needed.
const WAREHOUSE = clean(process.env.DATABRICKS_WAREHOUSE_ID) || "638494b8211390ee";
const CATALOG = clean(process.env.LEAVE_CATALOG) || "edl_qa";
const SCHEMA = clean(process.env.LEAVE_SCHEMA) || "qa_agent";

const T = (name: string) => `\`${CATALOG}\`.\`${SCHEMA}\`.\`leave_${name}\``;

export const LEAVE_TYPES = ["Holiday", "Unplanned", "Sick", "Planned"] as const;

export function leaveConfigured(): boolean {
  return Boolean(HOST && TOKEN && WAREHOUSE);
}
export function leaveConfigError(): string {
  const miss: string[] = [];
  if (!HOST) miss.push("DATABRICKS_HOST");
  if (!TOKEN) miss.push("DATABRICKS_TOKEN");
  if (!WAREHOUSE) miss.push("DATABRICKS_WAREHOUSE_ID");
  return miss.length ? `Leave store not configured — missing ${miss.join(", ")}.` : "";
}

type Row = Record<string, string>;

async function runSql(statement: string, params?: Record<string, string>): Promise<Row[]> {
  if (!leaveConfigured()) throw new Error(leaveConfigError());
  const parameters = params
    ? Object.entries(params).map(([name, value]) => ({ name, value: value ?? "" }))
    : undefined;

  const post = await fetch(`${HOST}/api/2.0/sql/statements`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      warehouse_id: WAREHOUSE, statement,
      wait_timeout: "30s", on_wait_timeout: "CONTINUE",
      format: "JSON_ARRAY", disposition: "INLINE", parameters,
    }),
  });
  let j: any = await post.json();
  if (!post.ok) throw new Error(`SQL request failed (${post.status}): ${JSON.stringify(j)}`);

  const id = j.statement_id;
  while (j.status && (j.status.state === "PENDING" || j.status.state === "RUNNING")) {
    await new Promise((r) => setTimeout(r, 800));
    const poll = await fetch(`${HOST}/api/2.0/sql/statements/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store",
    });
    j = await poll.json();
  }
  if (j.status?.state !== "SUCCEEDED") {
    throw new Error(`SQL ${j.status?.state}: ${j.status?.error?.message || JSON.stringify(j.status)}`);
  }
  const cols: string[] = (j.manifest?.schema?.columns || []).map((c: any) => c.name);
  const data: any[][] = j.result?.data_array || [];
  return data.map((row) => {
    const o: Row = {};
    cols.forEach((c, i) => { o[c] = row[i]; });
    return o;
  });
}

let ensured = false;
export async function ensureSchema(): Promise<void> {
  if (ensured) return;
  await runSql(`CREATE TABLE IF NOT EXISTS ${T("users")} (username STRING, password_hash STRING, role STRING, display_name STRING, email STRING, active STRING, created_at STRING) USING DELTA`);
  await runSql(`CREATE TABLE IF NOT EXISTS ${T("requests")} (request_id STRING, username STRING, display_name STRING, leave_type STRING, start_date STRING, end_date STRING, day_part STRING, days STRING, reason STRING, status STRING, created_at STRING) USING DELTA`);
  await runSql(`CREATE TABLE IF NOT EXISTS ${T("config")} (config_key STRING, config_value STRING) USING DELTA`);

  const admins = await runSql(`SELECT username FROM ${T("users")} WHERE role = 'admin' LIMIT 1`);
  if (admins.length === 0) {
    const hash = await hashPassword(process.env.LEAVE_ADMIN_PASSWORD || "admin@123");
    await runSql(
      `INSERT INTO ${T("users")} VALUES (:u, :p, 'admin', 'Administrator', '', 'true', :t)`,
      { u: "admin", p: hash, t: new Date().toISOString() }
    );
  }
  ensured = true;
}

export interface User { username: string; role: string; display_name: string; email: string; active: string; created_at: string; }

export async function getUserWithHash(username: string): Promise<(User & { password_hash: string }) | null> {
  const rows = await runSql(`SELECT * FROM ${T("users")} WHERE username = :u LIMIT 1`, { u: username });
  return (rows[0] as any) || null;
}
export async function listEmployees(): Promise<User[]> {
  const rows = await runSql(`SELECT username, role, display_name, email, active, created_at FROM ${T("users")} WHERE role = 'employee' ORDER BY created_at DESC`);
  return rows as any;
}
export async function userExists(username: string): Promise<boolean> {
  const rows = await runSql(`SELECT username FROM ${T("users")} WHERE username = :u LIMIT 1`, { u: username });
  return rows.length > 0;
}
export async function createEmployee(u: { username: string; display_name: string; email: string; passwordHash: string }): Promise<void> {
  await runSql(
    `INSERT INTO ${T("users")} VALUES (:u, :p, 'employee', :n, :e, 'true', :t)`,
    { u: u.username, p: u.passwordHash, n: u.display_name, e: u.email, t: new Date().toISOString() }
  );
}
export async function deleteUser(username: string): Promise<void> {
  await runSql(`DELETE FROM ${T("users")} WHERE username = :u AND role <> 'admin'`, { u: username });
}
export async function setPassword(username: string, passwordHash: string): Promise<void> {
  await runSql(`UPDATE ${T("users")} SET password_hash = :p WHERE username = :u`, { u: username, p: passwordHash });
}

export interface LeaveReq {
  request_id: string; username: string; display_name: string; leave_type: string;
  start_date: string; end_date: string; day_part: string; days: string; reason: string;
  status: string; created_at: string;
}
export async function insertLeave(r: LeaveReq): Promise<void> {
  await runSql(
    `INSERT INTO ${T("requests")} VALUES (:id, :u, :n, :ty, :sd, :ed, :dp, :dy, :rs, :st, :ct)`,
    { id: r.request_id, u: r.username, n: r.display_name, ty: r.leave_type, sd: r.start_date,
      ed: r.end_date, dp: r.day_part, dy: r.days, rs: r.reason, st: r.status, ct: r.created_at }
  );
}
export async function listLeavesByUser(username: string): Promise<LeaveReq[]> {
  return (await runSql(`SELECT * FROM ${T("requests")} WHERE username = :u ORDER BY created_at DESC`, { u: username })) as any;
}
export async function listLeavesByMonth(month: string): Promise<LeaveReq[]> {
  // month = 'YYYY-MM'; overlap test on ISO string dates
  const start = `${month}-01`, end = `${month}-31`;
  return (await runSql(
    `SELECT * FROM ${T("requests")} WHERE start_date <= :end AND end_date >= :start ORDER BY start_date`,
    { start, end }
  )) as any;
}

export async function getConfig(key: string): Promise<string> {
  const rows = await runSql(`SELECT config_value FROM ${T("config")} WHERE config_key = :k LIMIT 1`, { k: key });
  return rows[0]?.config_value || "";
}
export async function setConfig(key: string, value: string): Promise<void> {
  await runSql(`DELETE FROM ${T("config")} WHERE config_key = :k`, { k: key });
  await runSql(`INSERT INTO ${T("config")} VALUES (:k, :v)`, { k: key, v: value });
}
