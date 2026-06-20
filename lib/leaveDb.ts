// Leave Request data layer — stores everything in Databricks Delta tables via the
// SQL Statement Execution API. Named-column INSERTs are used throughout so column
// order never matters (safe across CREATE / ALTER).
import { hashPassword } from "./leaveAuth";

const clean = (v: string | undefined) =>
  (v || "").trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim();

const HOST = clean(process.env.DATABRICKS_HOST).replace(/\/+$/, "") || "https://dbc-927300a1-adc8.cloud.databricks.com";
const TOKEN = clean(process.env.DATABRICKS_TOKEN);
const WAREHOUSE = clean(process.env.DATABRICKS_WAREHOUSE_ID) || "638494b8211390ee";
const CATALOG = clean(process.env.LEAVE_CATALOG) || "edl_qa";
const SCHEMA = clean(process.env.LEAVE_SCHEMA) || "qa_agent";

const T = (name: string) => `\`${CATALOG}\`.\`${SCHEMA}\`.\`leave_${name}\``;

export { LEAVE_TYPES } from "./leaveShared";

export function leaveConfigured(): boolean { return Boolean(HOST && TOKEN && WAREHOUSE); }
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
      warehouse_id: WAREHOUSE, statement, wait_timeout: "30s", on_wait_timeout: "CONTINUE",
      format: "JSON_ARRAY", disposition: "INLINE", parameters,
    }),
  });
  let j: any = await post.json();
  if (!post.ok) throw new Error(`SQL request failed (${post.status}): ${JSON.stringify(j)}`);
  const id = j.statement_id;
  while (j.status && (j.status.state === "PENDING" || j.status.state === "RUNNING")) {
    await new Promise((r) => setTimeout(r, 800));
    const poll = await fetch(`${HOST}/api/2.0/sql/statements/${id}`, { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store" });
    j = await poll.json();
  }
  if (j.status?.state !== "SUCCEEDED") throw new Error(`SQL ${j.status?.state}: ${j.status?.error?.message || JSON.stringify(j.status)}`);
  const cols: string[] = (j.manifest?.schema?.columns || []).map((c: any) => c.name);
  const data: any[][] = j.result?.data_array || [];
  return data.map((row) => { const o: Row = {}; cols.forEach((c, i) => { o[c] = row[i]; }); return o; });
}

let ensured = false;
export async function ensureSchema(): Promise<void> {
  if (ensured) return;
  await runSql(`CREATE TABLE IF NOT EXISTS ${T("users")} (username STRING, password_hash STRING, role STRING, display_name STRING, email STRING, active STRING, created_at STRING, must_change STRING) USING DELTA`);
  await runSql(`CREATE TABLE IF NOT EXISTS ${T("requests")} (request_id STRING, username STRING, display_name STRING, leave_type STRING, start_date STRING, end_date STRING, day_part STRING, days STRING, reason STRING, status STRING, created_at STRING) USING DELTA`);
  await runSql(`CREATE TABLE IF NOT EXISTS ${T("config")} (config_key STRING, config_value STRING) USING DELTA`);
  await runSql(`CREATE TABLE IF NOT EXISTS ${T("holidays")} (holiday_date STRING, name STRING) USING DELTA`);
  await runSql(`CREATE TABLE IF NOT EXISTS ${T("audit")} (ts STRING, actor STRING, action STRING, target STRING, detail STRING) USING DELTA`);
  // add must_change to pre-existing users tables (ignore if already present)
  try { await runSql(`ALTER TABLE ${T("users")} ADD COLUMNS (must_change STRING)`); } catch {}

  const admins = await runSql(`SELECT username FROM ${T("users")} WHERE role = 'admin' LIMIT 1`);
  if (admins.length === 0) {
    const hash = await hashPassword(process.env.LEAVE_ADMIN_PASSWORD || "admin@123");
    await runSql(
      `INSERT INTO ${T("users")} (username, password_hash, role, display_name, email, active, created_at, must_change)
       VALUES (:u, :p, 'admin', 'Administrator', '', 'true', :t, 'false')`,
      { u: "admin", p: hash, t: new Date().toISOString() }
    );
  }
  ensured = true;
}

export interface User { username: string; role: string; display_name: string; email: string; active: string; created_at: string; must_change: string; }

export async function getUserWithHash(username: string): Promise<(User & { password_hash: string }) | null> {
  const rows = await runSql(`SELECT * FROM ${T("users")} WHERE username = :u LIMIT 1`, { u: username });
  return (rows[0] as any) || null;
}
export async function listUsers(): Promise<User[]> {
  return (await runSql(`SELECT username, role, display_name, email, active, created_at, must_change FROM ${T("users")} ORDER BY role DESC, created_at DESC`)) as any;
}
export async function userExists(username: string): Promise<boolean> {
  return (await runSql(`SELECT username FROM ${T("users")} WHERE username = :u LIMIT 1`, { u: username })).length > 0;
}
export async function countActiveAdmins(): Promise<number> {
  const r = await runSql(`SELECT COUNT(*) AS n FROM ${T("users")} WHERE role = 'admin' AND active <> 'false'`);
  return Number(r[0]?.n || 0);
}
export async function createUser(u: { username: string; display_name: string; email: string; passwordHash: string; role: string; must_change: boolean }): Promise<void> {
  await runSql(
    `INSERT INTO ${T("users")} (username, password_hash, role, display_name, email, active, created_at, must_change)
     VALUES (:u, :p, :r, :n, :e, 'true', :t, :mc)`,
    { u: u.username, p: u.passwordHash, r: u.role, n: u.display_name, e: u.email, t: new Date().toISOString(), mc: u.must_change ? "true" : "false" }
  );
}
export async function updateUserProfile(username: string, display_name: string, email: string): Promise<void> {
  await runSql(`UPDATE ${T("users")} SET display_name = :n, email = :e WHERE username = :u`, { u: username, n: display_name, e: email });
}
export async function setActive(username: string, active: boolean): Promise<void> {
  await runSql(`UPDATE ${T("users")} SET active = :a WHERE username = :u`, { u: username, a: active ? "true" : "false" });
}
export async function setRole(username: string, role: string): Promise<void> {
  await runSql(`UPDATE ${T("users")} SET role = :r WHERE username = :u`, { u: username, r: role });
}
export async function setPassword(username: string, passwordHash: string, mustChange = false): Promise<void> {
  await runSql(`UPDATE ${T("users")} SET password_hash = :p, must_change = :mc WHERE username = :u`, { u: username, p: passwordHash, mc: mustChange ? "true" : "false" });
}
export async function deleteUser(username: string): Promise<void> {
  await runSql(`DELETE FROM ${T("users")} WHERE username = :u`, { u: username });
}

export interface LeaveReq {
  request_id: string; username: string; display_name: string; leave_type: string;
  start_date: string; end_date: string; day_part: string; days: string; reason: string;
  status: string; created_at: string;
}
export async function insertLeave(r: LeaveReq): Promise<void> {
  await runSql(
    `INSERT INTO ${T("requests")} (request_id, username, display_name, leave_type, start_date, end_date, day_part, days, reason, status, created_at)
     VALUES (:id, :u, :n, :ty, :sd, :ed, :dp, :dy, :rs, :st, :ct)`,
    { id: r.request_id, u: r.username, n: r.display_name, ty: r.leave_type, sd: r.start_date, ed: r.end_date, dp: r.day_part, dy: r.days, rs: r.reason, st: r.status, ct: r.created_at }
  );
}
export async function getLeaveById(id: string): Promise<LeaveReq | null> {
  return ((await runSql(`SELECT * FROM ${T("requests")} WHERE request_id = :id LIMIT 1`, { id }))[0] as any) || null;
}
export async function leaveIdExists(id: string): Promise<boolean> {
  return (await runSql(`SELECT request_id FROM ${T("requests")} WHERE request_id = :id LIMIT 1`, { id })).length > 0;
}
export async function listLeavesByUser(username: string): Promise<LeaveReq[]> {
  return (await runSql(`SELECT * FROM ${T("requests")} WHERE username = :u ORDER BY start_date DESC`, { u: username })) as any;
}
export async function listLeavesByMonth(month: string): Promise<LeaveReq[]> {
  const start = `${month}-01`, end = `${month}-31`;
  return (await runSql(`SELECT * FROM ${T("requests")} WHERE start_date <= :end AND end_date >= :start ORDER BY start_date`, { start, end })) as any;
}
export async function listLeavesByRange(from: string, to: string): Promise<LeaveReq[]> {
  return (await runSql(
    `SELECT * FROM ${T("requests")} WHERE start_date <= :to AND end_date >= :from ORDER BY display_name, start_date`,
    { from, to }
  )) as any;
}
export async function ownLeavesOverlapping(username: string, start: string, end: string, excludeId = ""): Promise<LeaveReq[]> {
  return (await runSql(
    `SELECT * FROM ${T("requests")} WHERE username = :u AND start_date <= :end AND end_date >= :start AND request_id <> :ex`,
    { u: username, start, end, ex: excludeId }
  )) as any;
}
export async function deleteLeave(id: string): Promise<void> {
  await runSql(`DELETE FROM ${T("requests")} WHERE request_id = :id`, { id });
}
export async function updateLeave(id: string, f: { leave_type: string; start_date: string; end_date: string; day_part: string; days: string; reason: string }): Promise<void> {
  await runSql(
    `UPDATE ${T("requests")} SET leave_type = :ty, start_date = :sd, end_date = :ed, day_part = :dp, days = :dy, reason = :rs WHERE request_id = :id`,
    { id, ty: f.leave_type, sd: f.start_date, ed: f.end_date, dp: f.day_part, dy: f.days, rs: f.reason }
  );
}

export interface Holiday { holiday_date: string; name: string; }
export async function listHolidays(): Promise<Holiday[]> {
  return (await runSql(`SELECT holiday_date, name FROM ${T("holidays")} ORDER BY holiday_date`)) as any;
}
export async function addHoliday(date: string, name: string): Promise<void> {
  await runSql(`DELETE FROM ${T("holidays")} WHERE holiday_date = :d`, { d: date });
  await runSql(`INSERT INTO ${T("holidays")} (holiday_date, name) VALUES (:d, :n)`, { d: date, n: name });
}
export async function deleteHoliday(date: string): Promise<void> {
  await runSql(`DELETE FROM ${T("holidays")} WHERE holiday_date = :d`, { d: date });
}

export async function insertAudit(actor: string, action: string, target: string, detail: string): Promise<void> {
  try {
    await runSql(`INSERT INTO ${T("audit")} (ts, actor, action, target, detail) VALUES (:ts, :a, :ac, :t, :d)`,
      { ts: new Date().toISOString(), a: actor, ac: action, t: target, d: detail });
  } catch {/* audit is best-effort */}
}
export async function listAudit(limit = 100): Promise<Row[]> {
  return runSql(`SELECT ts, actor, action, target, detail FROM ${T("audit")} ORDER BY ts DESC LIMIT ${Number(limit)}`);
}

export async function getConfig(key: string): Promise<string> {
  const rows = await runSql(`SELECT config_value FROM ${T("config")} WHERE config_key = :k LIMIT 1`, { k: key });
  return rows[0]?.config_value || "";
}
export async function setConfig(key: string, value: string): Promise<void> {
  await runSql(`DELETE FROM ${T("config")} WHERE config_key = :k`, { k: key });
  await runSql(`INSERT INTO ${T("config")} (config_key, config_value) VALUES (:k, :v)`, { k: key, v: value });
}
