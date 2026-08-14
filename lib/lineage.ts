// Data Lineage — parse the "Lineage" sheet (Applications, Target database/schema/table,
// Source database/schema/table), build a graph, and trace a table's upstream sources
// (recursively) or downstream targets.
import ExcelJS from "exceljs";

export interface LinRow {
  app: string;
  tdb: string; tsc: string; ttb: string;
  sdb: string; ssc: string; stb: string;
}
export interface LinNode { id: string; table: string; schema: string; db: string; level: number; seed?: boolean; }
export interface LinEdge { from: string; to: string; app: string; }

const BLANK = new Set(["", "(blank)", "-", "n/a", "na", "null"]);
const clean = (v: any) => {
  const s = (v && typeof v === "object" && "text" in v ? String((v as any).text) : v == null ? "" : String(v)).trim();
  return BLANK.has(s.toLowerCase()) ? "" : s;
};
const norm = (s: string) => s.trim().toUpperCase();

export function nodeId(db: string, schema: string, table: string): string {
  return [db, schema, table].map(norm).filter(Boolean).join(".");
}

export async function parseLineageWorkbook(buf: Buffer): Promise<LinRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  // prefer a sheet literally named "Lineage", else the first sheet with the headers
  const sheets = wb.worksheets;
  const pickSheet = () => {
    const named = sheets.find((w) => w.name.trim().toLowerCase() === "lineage");
    if (named) return named;
    for (const w of sheets) {
      const hdr: string[] = [];
      w.getRow(1).eachCell((c) => hdr.push(String(c.text || "").trim().toLowerCase()));
      if (hdr.includes("target table") && hdr.includes("source table")) return w;
    }
    return sheets[0];
  };
  const ws = pickSheet();
  if (!ws) return [];

  const H: Record<string, number> = {};
  ws.getRow(1).eachCell((c, i) => { H[String(c.text || "").trim().toLowerCase()] = i; });
  const col = (...names: string[]) => { for (const n of names) if (H[n]) return H[n]; return 0; };
  const cApp = col("applications", "application");
  const cTdb = col("target database", "target db");
  const cTsc = col("target schema");
  const cTtb = col("target table");
  const cSdb = col("source database", "source db");
  const cSsc = col("source schema");
  const cStb = col("source table");
  if (!cTtb || !cStb) return [];

  const rows: LinRow[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const get = (i: number) => (i ? clean(row.getCell(i).value) : "");
    const r: LinRow = {
      app: get(cApp), tdb: get(cTdb), tsc: get(cTsc), ttb: get(cTtb),
      sdb: get(cSdb), ssc: get(cSsc), stb: get(cStb),
    };
    if (r.ttb && r.stb) rows.push(r); // an edge needs both ends
  });
  return rows;
}

export interface Graph {
  rows: LinRow[];
  upstream: Map<string, LinRow[]>;   // target id -> rows feeding it
  downstream: Map<string, LinRow[]>; // source id -> rows it feeds
  nodes: Map<string, { db: string; schema: string; table: string }>;
  targets: string[]; // distinct target ids (sorted)
  apps: string[];
}

export function buildGraph(rows: LinRow[]): Graph {
  const upstream = new Map<string, LinRow[]>();
  const downstream = new Map<string, LinRow[]>();
  const nodes = new Map<string, { db: string; schema: string; table: string }>();
  const push = (m: Map<string, LinRow[]>, k: string, v: LinRow) => { (m.get(k) || m.set(k, []).get(k)!).push(v); };

  for (const r of rows) {
    const t = nodeId(r.tdb, r.tsc, r.ttb);
    const s = nodeId(r.sdb, r.ssc, r.stb);
    nodes.set(t, { db: norm(r.tdb), schema: norm(r.tsc), table: norm(r.ttb) });
    nodes.set(s, { db: norm(r.sdb), schema: norm(r.ssc), table: norm(r.stb) });
    push(upstream, t, r);
    push(downstream, s, r);
  }
  const targets = [...new Set(rows.map((r) => nodeId(r.tdb, r.tsc, r.ttb)))].sort();
  const apps = [...new Set(rows.map((r) => r.app).filter(Boolean))].sort();
  return { rows, upstream, downstream, nodes, targets, apps };
}

// Resolve a user-typed table name to matching node ids (exact id, exact table, or contains).
export function resolveTable(g: Graph, query: string): string[] {
  const q = norm(query);
  if (!q) return [];
  const ids = [...g.nodes.keys()];
  const exactId = ids.filter((id) => id === q);
  if (exactId.length) return exactId;
  const exactTable = ids.filter((id) => g.nodes.get(id)!.table === q);
  if (exactTable.length) return exactTable;
  return ids.filter((id) => id.includes(q)).slice(0, 25);
}

export interface Trace { nodes: LinNode[]; edges: LinEdge[]; truncated: boolean; }

// Walk the graph from a seed node. direction: "upstream" (default) walks target→sources
// recursively (back-tracing); "downstream" walks source→targets; "both" does both.
export function trace(g: Graph, seedId: string, direction: "upstream" | "downstream" | "both" = "upstream", maxDepth = 0, maxNodes = 300): Trace {
  const nodes = new Map<string, LinNode>();
  const edges: LinEdge[] = [];
  const seen = new Set<string>();
  let truncated = false;

  const meta = g.nodes.get(seedId);
  nodes.set(seedId, { id: seedId, ...(meta || { db: "", schema: "", table: seedId }), level: 0, seed: true });

  const walk = (id: string, depth: number, dir: "upstream" | "downstream") => {
    if (maxDepth && depth >= maxDepth) return;
    const key = dir + "|" + id;
    if (seen.has(key)) return;
    seen.add(key);
    const rows = (dir === "upstream" ? g.upstream : g.downstream).get(id) || [];
    for (const r of rows) {
      const t = nodeId(r.tdb, r.tsc, r.ttb);
      const s = nodeId(r.sdb, r.ssc, r.stb);
      const next = dir === "upstream" ? s : t;
      if (next === id) continue; // self-reference
      if (nodes.size >= maxNodes) { truncated = true; return; }
      if (!nodes.has(next)) {
        const m = g.nodes.get(next)!;
        nodes.set(next, { id: next, ...m, level: dir === "upstream" ? depth + 1 : -(depth + 1) });
      }
      if (!edges.some((e) => e.from === s && e.to === t)) edges.push({ from: s, to: t, app: r.app });
      walk(next, depth + 1, dir);
    }
  };

  if (direction === "upstream" || direction === "both") walk(seedId, 0, "upstream");
  if (direction === "downstream" || direction === "both") walk(seedId, 0, "downstream");
  return { nodes: [...nodes.values()], edges, truncated };
}

const safeId = (s: string) => "n" + s.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 60);

// Mermaid flowchart; classDefs match the app's diagram theming (inputJob = seed).
export function toMermaid(t: Trace, dir: "LR" | "TB" = "LR"): string {
  const lines = [`graph ${dir}`];
  lines.push("    classDef inputJob fill:#FFD700,stroke:#000,stroke-width:2px;");
  lines.push("    classDef chainJob fill:#E3F2FD,stroke:#666;");
  for (const n of t.nodes) {
    const label = n.schema ? `${n.table}<br/>${n.schema}` : n.table;
    lines.push(`    ${safeId(n.id)}["${label}"]`);
  }
  for (const e of t.edges) lines.push(`    ${safeId(e.from)} --> ${safeId(e.to)}`);
  for (const n of t.nodes) lines.push(`    class ${safeId(n.id)} ${n.seed ? "inputJob" : "chainJob"};`);
  if (t.truncated) {
    lines.push(`    truncated["… graph truncated"]`);
    lines.push(`    class truncated chainJob;`);
  }
  return lines.join("\n");
}
