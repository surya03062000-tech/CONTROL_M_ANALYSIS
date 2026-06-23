// DG Document Creation helpers — list schemas/tables and create tables from an
// uploaded spreadsheet, all in the edl_qa catalog via the SQL Warehouse.
import { sqlQuery, sqlExec } from "./databricksSql";

export const DG_CATALOG = (process.env.DG_CATALOG || "edl_qa").trim();

const ident = (s: string) => "`" + String(s || "").trim().replace(/`/g, "") + "`";

// ── short-TTL cache for schema/table listings ──────────────────────────────
const TTL = 30_000;
const cache = new Map<string, { at: number; val: string[] }>();
async function cached(key: string, fn: () => Promise<string[]>): Promise<string[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.val;
  const val = await fn();
  cache.set(key, { at: Date.now(), val });
  return val;
}

export async function listSchemas(catalog = DG_CATALOG): Promise<string[]> {
  return cached(`sch:${catalog}`, async () => {
    const rows = await sqlQuery(`SHOW SCHEMAS IN ${ident(catalog)}`);
    return rows.map((r) => r.databaseName || r.namespace || Object.values(r)[0]).filter(Boolean) as string[];
  });
}
export async function listTables(catalog: string, schema: string): Promise<string[]> {
  return cached(`tab:${catalog}.${schema}`, async () => {
    const rows = await sqlQuery(`SHOW TABLES IN ${ident(catalog)}.${ident(schema)}`);
    return rows.map((r) => r.tableName || Object.values(r)[1] || Object.values(r)[0]).filter(Boolean) as string[];
  });
}
function invalidate(catalog: string, schema?: string) {
  cache.delete(`sch:${catalog}`);
  if (schema) cache.delete(`tab:${catalog}.${schema}`);
}

async function existingColumns(catalog: string, schema: string, table: string): Promise<Set<string>> {
  const rows = await sqlQuery(`DESCRIBE TABLE ${ident(catalog)}.${ident(schema)}.${ident(table)}`);
  const cols = new Set<string>();
  for (const r of rows) {
    const name = (r.col_name || "").trim();
    if (!name || name.startsWith("#")) break; // partition/metadata section starts
    cols.add(name.toLowerCase());
  }
  return cols;
}

// concurrency-limited map
async function pool<T>(items: T[], limit: number, fn: (it: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  });
  await Promise.all(workers);
}

export interface ColDef { schema: string; table: string; column: string; dataType: string; }
export type DgEvent =
  | { t: "log"; line: string }
  | { t: "progress"; done: number; total: number }
  | { t: "row"; schema: string; table: string; status: "created" | "altered" | "exists" | "error"; detail: string; cols: number }
  | { t: "summary"; schemas: number; created: number; altered: number; existing: number; errors: number; tables: number };

export async function createTablesFromRows(rows: ColDef[], catalog: string, emit: (e: DgEvent) => void): Promise<void> {
  // group → table → ordered unique columns (detect duplicates)
  const tables = new Map<string, { schema: string; table: string; cols: { column: string; dataType: string }[]; dups: string[] }>();
  for (const r of rows) {
    const schema = (r.schema || "").trim(), table = (r.table || "").trim();
    const column = (r.column || "").trim(), dataType = (r.dataType || "").trim();
    if (!schema || !table || !column || !dataType) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)) {
      emit({ t: "log", line: `⚠ skipped invalid identifier: ${schema}.${table}.${column}` });
      continue;
    }
    const key = `${schema}.${table}`;
    if (!tables.has(key)) tables.set(key, { schema, table, cols: [], dups: [] });
    const t = tables.get(key)!;
    if (t.cols.some((c) => c.column.toLowerCase() === column.toLowerCase())) { t.dups.push(column); continue; }
    t.cols.push({ column, dataType });
  }

  const schemas = [...new Set([...tables.values()].map((t) => t.schema))];
  const total = tables.size;
  emit({ t: "log", line: `Parsed ${rows.length} row(s) → ${total} table(s) across ${schemas.length} schema(s).` });
  for (const t of tables.values()) if (t.dups.length) emit({ t: "log", line: `⚠ ${t.schema}.${t.table}: duplicate column(s) ignored → ${[...new Set(t.dups)].join(", ")}` });

  // schemas (parallel, small)
  let schemaOk = 0;
  await pool(schemas, 4, async (schema) => {
    try { await sqlExec(`CREATE SCHEMA IF NOT EXISTS ${ident(catalog)}.${ident(schema)}`); schemaOk++; emit({ t: "log", line: `✓ schema ${catalog}.${schema}` }); }
    catch (e: any) { emit({ t: "log", line: `✗ schema ${catalog}.${schema} — ${e?.message || e}` }); }
  });
  schemas.forEach((s) => invalidate(catalog, s));

  // existing tables per schema (cache)
  const existing = new Map<string, Set<string>>();
  await pool(schemas, 4, async (schema) => {
    try { existing.set(schema, new Set((await listTables(catalog, schema)).map((x) => x.toLowerCase()))); }
    catch { existing.set(schema, new Set()); }
  });

  let created = 0, altered = 0, existed = 0, errors = 0, done = 0;
  const list = [...tables.values()];
  await pool(list, 6, async (t) => {
    const colSql = t.cols.map((c) => `${ident(c.column)} ${sanitizeType(c.dataType)}`).join(", ");
    try {
      const exists = existing.get(t.schema)?.has(t.table.toLowerCase());
      if (!exists) {
        await sqlExec(`CREATE TABLE IF NOT EXISTS ${ident(catalog)}.${ident(t.schema)}.${ident(t.table)} (${colSql}) USING DELTA`);
        created++; emit({ t: "row", schema: t.schema, table: t.table, status: "created", detail: `${t.cols.length} columns`, cols: t.cols.length });
      } else {
        const have = await existingColumns(catalog, t.schema, t.table);
        const missing = t.cols.filter((c) => !have.has(c.column.toLowerCase()));
        if (missing.length) {
          await sqlExec(`ALTER TABLE ${ident(catalog)}.${ident(t.schema)}.${ident(t.table)} ADD COLUMNS (${missing.map((c) => `${ident(c.column)} ${sanitizeType(c.dataType)}`).join(", ")})`);
          altered++; emit({ t: "row", schema: t.schema, table: t.table, status: "altered", detail: `+${missing.length} column(s): ${missing.map((c) => c.column).join(", ")}`, cols: t.cols.length });
        } else {
          existed++; emit({ t: "row", schema: t.schema, table: t.table, status: "exists", detail: "already up to date", cols: t.cols.length });
        }
      }
    } catch (e: any) {
      errors++; emit({ t: "row", schema: t.schema, table: t.table, status: "error", detail: String(e?.message || e), cols: t.cols.length });
    } finally {
      done++; emit({ t: "progress", done, total });
    }
  });

  emit({ t: "summary", schemas: schemaOk, created, altered, existing: existed, errors, tables: total });
}

function sanitizeType(t: string): string {
  const s = String(t || "").trim().toUpperCase();
  if (/^(STRING|INT|INTEGER|BIGINT|SMALLINT|TINYINT|BOOLEAN|DOUBLE|FLOAT|DATE|TIMESTAMP|BINARY|LONG)$/.test(s)) return s;
  if (/^(DECIMAL|NUMERIC)\s*\(\s*\d+\s*,\s*\d+\s*\)$/.test(s)) return s;
  if (/^VARCHAR\s*\(\s*\d+\s*\)$/.test(s)) return s;
  return "STRING";
}
