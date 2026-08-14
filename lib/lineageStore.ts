// Loads a lineage workbook from the Databricks Volume and caches the parsed graph
// (serverless-friendly: no server state needed beyond a short-lived in-memory cache).
import { downloadFile, listVolumeXlsx, type OutputFile } from "./databricks";
import { parseLineageWorkbook, buildGraph, type Graph } from "./lineage";

export const LINEAGE_VOLUME = (
  process.env.LINEAGE_VOLUME || process.env.INPUT_VOLUME || process.env.OUTPUT_VOLUME || ""
).replace(/\/+$/, "");

const TTL = 5 * 60 * 1000;
const cache = new Map<string, { at: number; graph: Graph }>();

export async function listLineageFiles(): Promise<OutputFile[]> {
  const files = await listVolumeXlsx(LINEAGE_VOLUME);
  return files.filter((f) => !/^(DG_|AI_)/i.test(f.name));
}

export async function loadGraph(path: string): Promise<Graph> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.graph;
  const res = await downloadFile(path);
  if (!res.ok) throw new Error(`Could not read ${path} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const rows = await parseLineageWorkbook(buf);
  if (!rows.length) throw new Error("No lineage rows found — the sheet needs Target/Source database, schema and table columns.");
  const graph = buildGraph(rows);
  cache.set(path, { at: Date.now(), graph });
  return graph;
}

export function invalidate(path?: string) {
  if (path) cache.delete(path); else cache.clear();
}

// Guard: only allow Unity Catalog Volume paths, and (when configured) only those
// inside the lineage volume. Keeps a caller from pointing the reader anywhere else.
export function allowedPath(path: string): boolean {
  if (!path || path.includes("..")) return false;
  if (!path.startsWith("/Volumes/")) return false;
  return LINEAGE_VOLUME ? path.startsWith(LINEAGE_VOLUME) : true;
}
