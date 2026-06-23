// DG Document Creation helpers — list schemas/tables and create tables from an
// uploaded spreadsheet, all in the edl_qa catalog via the SQL Warehouse.
import { sqlQuery, sqlExec } from "./databricksSql";

export const DG_CATALOG = (process.env.DG_CATALOG || "edl_qa").trim();

const ident = (s: string) => "`" + String(s || "").trim().replace(/`/g, "") + "`";

export async function listSchemas(catalog = DG_CATALOG): Promise<string[]> {
  const rows = await sqlQuery(`SHOW SCHEMAS IN ${ident(catalog)}`);
  return rows.map((r) => r.databaseName || r.namespace || Object.values(r)[0]).filter(Boolean) as string[];
}

export async function listTables(catalog: string, schema: string): Promise<string[]> {
  const rows = await sqlQuery(`SHOW TABLES IN ${ident(catalog)}.${ident(schema)}`);
  return rows.map((r) => r.tableName || Object.values(r)[1] || Object.values(r)[0]).filter(Boolean) as string[];
}

export interface ColDef { schema: string; table: string; column: string; dataType: string; }

// Group flat rows into { schema, table -> columns[] }, then emit CREATE statements.
// `onLog` streams human-readable progress lines.
export async function createTablesFromRows(
  rows: ColDef[], catalog: string, onLog: (line: string) => void
): Promise<{ schemas: number; tables: number; errors: number }> {
  // group
  const tables = new Map<string, { schema: string; table: string; cols: { column: string; dataType: string }[] }>();
  for (const r of rows) {
    const schema = (r.schema || "").trim();
    const table = (r.table || "").trim();
    const column = (r.column || "").trim();
    const dataType = (r.dataType || "").trim();
    if (!schema || !table || !column || !dataType) continue;
    const key = `${schema}.${table}`;
    if (!tables.has(key)) tables.set(key, { schema, table, cols: [] });
    tables.get(key)!.cols.push({ column, dataType });
  }

  const schemas = new Set([...tables.values()].map((t) => t.schema));
  let createdSchemas = 0, createdTables = 0, errors = 0;

  onLog(`Parsed ${rows.length} row(s) → ${tables.size} table(s) across ${schemas.size} schema(s).`);

  for (const schema of schemas) {
    try {
      await sqlExec(`CREATE SCHEMA IF NOT EXISTS ${ident(catalog)}.${ident(schema)}`);
      createdSchemas += 1;
      onLog(`✓ schema ${catalog}.${schema}`);
    } catch (e: any) {
      errors += 1;
      onLog(`✗ schema ${catalog}.${schema} — ${e?.message || e}`);
    }
  }

  let i = 0;
  for (const t of tables.values()) {
    i += 1;
    const colSql = t.cols.map((c) => `${ident(c.column)} ${sanitizeType(c.dataType)}`).join(", ");
    const stmt = `CREATE TABLE IF NOT EXISTS ${ident(catalog)}.${ident(t.schema)}.${ident(t.table)} (${colSql}) USING DELTA`;
    try {
      await sqlExec(stmt);
      createdTables += 1;
      onLog(`✓ [${i}/${tables.size}] ${t.schema}.${t.table} (${t.cols.length} cols)`);
    } catch (e: any) {
      errors += 1;
      onLog(`✗ [${i}/${tables.size}] ${t.schema}.${t.table} — ${e?.message || e}`);
    }
  }
  onLog(`Done. Schemas: ${createdSchemas}/${schemas.size} · Tables: ${createdTables}/${tables.size} · Errors: ${errors}`);
  return { schemas: createdSchemas, tables: createdTables, errors };
}

// Allow common Databricks/SQL types only; default to STRING.
function sanitizeType(t: string): string {
  const s = String(t || "").trim().toUpperCase();
  if (/^(STRING|INT|INTEGER|BIGINT|SMALLINT|TINYINT|BOOLEAN|DOUBLE|FLOAT|DATE|TIMESTAMP|BINARY|LONG)$/.test(s)) return s;
  if (/^(DECIMAL|NUMERIC)\s*\(\s*\d+\s*,\s*\d+\s*\)$/.test(s)) return s;
  if (/^VARCHAR\s*\(\s*\d+\s*\)$/.test(s)) return s;
  return "STRING";
}
