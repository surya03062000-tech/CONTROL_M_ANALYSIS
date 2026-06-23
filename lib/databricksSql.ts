// Generic Databricks SQL runner (SQL Statement Execution API on a SQL Warehouse).
// Shared by tools that need ad-hoc SQL (e.g. DG table creation, schema/table listing).
const clean = (v: string | undefined) =>
  (v || "").trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim();

const HOST = clean(process.env.DATABRICKS_HOST).replace(/\/+$/, "") || "https://dbc-927300a1-adc8.cloud.databricks.com";
const TOKEN = clean(process.env.DATABRICKS_TOKEN);
const WAREHOUSE = clean(process.env.DATABRICKS_WAREHOUSE_ID) || "638494b8211390ee";

export function sqlConfigured(): boolean { return Boolean(HOST && TOKEN && WAREHOUSE); }
export function sqlConfigError(): string {
  const m: string[] = [];
  if (!HOST) m.push("DATABRICKS_HOST");
  if (!TOKEN) m.push("DATABRICKS_TOKEN");
  if (!WAREHOUSE) m.push("DATABRICKS_WAREHOUSE_ID");
  return m.length ? `SQL not configured — missing ${m.join(", ")}.` : "";
}

export type SqlRow = Record<string, string>;

export async function sqlQuery(statement: string, params?: Record<string, string>): Promise<SqlRow[]> {
  if (!sqlConfigured()) throw new Error(sqlConfigError());
  const parameters = params ? Object.entries(params).map(([name, value]) => ({ name, value: value ?? "" })) : undefined;
  const post = await fetch(`${HOST}/api/2.0/sql/statements`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ warehouse_id: WAREHOUSE, statement, wait_timeout: "30s", on_wait_timeout: "CONTINUE", format: "JSON_ARRAY", disposition: "INLINE", parameters }),
  });
  let j: any = await post.json();
  if (!post.ok) throw new Error(`SQL request failed (${post.status}): ${JSON.stringify(j)}`);
  const id = j.statement_id;
  while (j.status && (j.status.state === "PENDING" || j.status.state === "RUNNING")) {
    await new Promise((r) => setTimeout(r, 700));
    const poll = await fetch(`${HOST}/api/2.0/sql/statements/${id}`, { headers: { Authorization: `Bearer ${TOKEN}` }, cache: "no-store" });
    j = await poll.json();
  }
  if (j.status?.state !== "SUCCEEDED") throw new Error(j.status?.error?.message || `SQL ${j.status?.state}`);
  const cols: string[] = (j.manifest?.schema?.columns || []).map((c: any) => c.name);
  const data: any[][] = j.result?.data_array || [];
  return data.map((row) => { const o: SqlRow = {}; cols.forEach((c, i) => { o[c] = row[i]; }); return o; });
}

export async function sqlExec(statement: string): Promise<void> {
  await sqlQuery(statement);
}
