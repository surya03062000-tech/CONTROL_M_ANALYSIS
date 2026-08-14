// Lineage storage. Uploaded workbooks are parsed once and persisted as Delta rows
// (#19) so traces query the lakehouse instead of re-reading Excel; the Volume copy
// is kept and used as a fallback when Delta isn't available.
import { downloadFile, listVolumeXlsx, type OutputFile } from "./databricks";
import { sqlQuery, sqlExec, sqlConfigured } from "./databricksSql";
import { parseLineage, buildGraph, type Graph, type LinRow } from "./lineage";

export const LINEAGE_VOLUME = (
  process.env.LINEAGE_VOLUME || process.env.INPUT_VOLUME || process.env.OUTPUT_VOLUME || ""
).replace(/\/+$/, "");

const CATALOG = (process.env.LEAVE_CATALOG || "edl_qa").trim();
const SCHEMA = (process.env.LEAVE_SCHEMA || "qa_agent").trim();
const TBL = `\`${CATALOG}\`.\`${SCHEMA}\`.\`lineage_edges\``;

const TTL = 5 * 60 * 1000;
const cache = new Map<string, { at: number; graph: Graph }>();

export async function listLineageFiles(): Promise<OutputFile[]> {
  const files = await listVolumeXlsx(LINEAGE_VOLUME);
  return files.filter((f) => !/^(DG_|AI_)/i.test(f.name));
}

// ── Delta persistence ──────────────────────────────────────────────────────
const sqlLit = (s: string) => `'${String(s || "").replace(/'/g, "''")}'`;

export async function ensureLineageTable(): Promise<void> {
  await sqlExec(
    `CREATE TABLE IF NOT EXISTS ${TBL} (dataset STRING, app STRING, ` +
    `target_db STRING, target_schema STRING, target_table STRING, ` +
    `source_db STRING, source_schema STRING, source_table STRING, loaded_at STRING) USING DELTA`
  );
}

export async function saveToDelta(dataset: string, rows: LinRow[]): Promise<number> {
  await ensureLineageTable();
  await sqlExec(`DELETE FROM ${TBL} WHERE dataset = ${sqlLit(dataset)}`);
  const at = new Date().toISOString();
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const values = rows.slice(i, i + CHUNK).map((r) =>
      `(${[dataset, r.app, r.tdb, r.tsc, r.ttb, r.sdb, r.ssc, r.stb, at].map(sqlLit).join(",")})`
    ).join(",");
    await sqlExec(`INSERT INTO ${TBL} VALUES ${values}`);
  }
  return rows.length;
}

export interface Dataset { dataset: string; edges: number; loaded_at: string }
export async function listDatasets(): Promise<Dataset[]> {
  if (!sqlConfigured()) return [];
  try {
    await ensureLineageTable();
    const rows = await sqlQuery(
      `SELECT dataset, COUNT(*) AS edges, MAX(loaded_at) AS loaded_at FROM ${TBL} GROUP BY dataset ORDER BY loaded_at DESC`
    );
    return rows.map((r) => ({ dataset: r.dataset, edges: Number(r.edges || 0), loaded_at: r.loaded_at }));
  } catch { return []; }
}

async function loadFromDelta(dataset: string): Promise<Graph> {
  const rows = await sqlQuery(
    `SELECT app, target_db, target_schema, target_table, source_db, source_schema, source_table ` +
    `FROM ${TBL} WHERE dataset = ${sqlLit(dataset)}`
  );
  if (!rows.length) throw new Error(`No lineage rows stored for "${dataset}".`);
  const lin: LinRow[] = rows.map((r) => ({
    app: r.app || "", tdb: r.target_db || "", tsc: r.target_schema || "", ttb: r.target_table || "",
    sdb: r.source_db || "", ssc: r.source_schema || "", stb: r.source_table || "",
  }));
  return buildGraph(lin);
}

async function loadFromVolume(path: string): Promise<Graph> {
  const res = await downloadFile(path);
  if (!res.ok) throw new Error(`Could not read ${path} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { rows } = await parseLineage(buf);
  if (!rows.length) throw new Error("No lineage rows found — the sheet needs Target/Source database, schema and table columns.");
  return buildGraph(rows);
}

// ref is either "delta:<dataset>" or an absolute Volume path.
export async function loadGraph(ref: string): Promise<Graph> {
  const hit = cache.get(ref);
  if (hit && Date.now() - hit.at < TTL) return hit.graph;
  const graph = ref.startsWith("delta:") ? await loadFromDelta(ref.slice(6)) : await loadFromVolume(ref);
  cache.set(ref, { at: Date.now(), graph });
  return graph;
}

export function invalidate(ref?: string) {
  if (ref) cache.delete(ref); else cache.clear();
}

// Guard: Delta dataset refs, or Volume paths inside the lineage volume.
export function allowedPath(ref: string): boolean {
  if (!ref || ref.includes("..")) return false;
  if (ref.startsWith("delta:")) return ref.length > 6;
  if (!ref.startsWith("/Volumes/")) return false;
  return LINEAGE_VOLUME ? ref.startsWith(LINEAGE_VOLUME) : true;
}
