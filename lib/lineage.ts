// Data Lineage — parse the "Lineage" sheet (Applications, Target database/schema/table,
// Source database/schema/table), build a graph, and trace tables upstream/downstream.
import ExcelJS from "exceljs";

export interface LinRow {
  app: string;
  tdb: string; tsc: string; ttb: string;
  sdb: string; ssc: string; stb: string;
}
export interface LinNode {
  id: string; table: string; schema: string; db: string; app: string;
  level: number; seed?: boolean; shared?: boolean;
}
export interface LinEdge { from: string; to: string; app: string; backEdge?: boolean }

const BLANK = new Set(["", "(blank)", "-", "--", "n/a", "na", "null", "none"]);
const clean = (v: any) => {
  const s = (v && typeof v === "object" && "text" in v ? String((v as any).text) : v == null ? "" : String(v))
    .replace(/[\u0000-\u001F\u007F]/g, " ")  // strip control chars (keep hyphens/dots)
    .replace(/\s+/g, " ")
    .trim();
  return BLANK.has(s.toLowerCase()) ? "" : s;
};
const norm = (s: string) => s.trim().toUpperCase();

export function nodeId(db: string, schema: string, table: string): string {
  return [db, schema, table].map(norm).filter(Boolean).join(".");
}

// ── Quality report (#15/#17) ───────────────────────────────────────────────
export interface QualityIssue { row: number; issue: string; detail: string }
export interface Quality {
  totalRows: number; validEdges: number; skipped: number;
  missingSourceTable: number; missingTargetTable: number; emptyRows: number;
  missingApp: number; missingSchema: number; missingDatabase: number;
  duplicateEdges: number; selfReferences: number; cyclePairs: number;
  issues: QualityIssue[];
}

export interface ParseResult { rows: LinRow[]; quality: Quality; sheet: string }

export async function parseLineage(buf: Buffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
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
  const q: Quality = {
    totalRows: 0, validEdges: 0, skipped: 0, missingSourceTable: 0, missingTargetTable: 0,
    emptyRows: 0, missingApp: 0, missingSchema: 0, missingDatabase: 0,
    duplicateEdges: 0, selfReferences: 0, cyclePairs: 0, issues: [],
  };
  if (!ws) return { rows: [], quality: q, sheet: "" };

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
  if (!cTtb || !cStb) return { rows: [], quality: q, sheet: ws.name };

  const rows: LinRow[] = [];
  const seenEdge = new Set<string>();
  const addIssue = (row: number, issue: string, detail: string) => {
    if (q.issues.length < 50) q.issues.push({ row, issue, detail });
  };

  ws.eachRow((row, n) => {
    if (n === 1) return;
    const get = (i: number) => (i ? clean(row.getCell(i).value) : "");
    const r: LinRow = {
      app: get(cApp), tdb: get(cTdb), tsc: get(cTsc), ttb: get(cTtb),
      sdb: get(cSdb), ssc: get(cSsc), stb: get(cStb),
    };
    const anything = r.app || r.tdb || r.tsc || r.ttb || r.sdb || r.ssc || r.stb;
    if (!anything) { q.emptyRows += 1; return; }
    q.totalRows += 1;

    if (!r.ttb || !r.stb) {
      q.skipped += 1;
      if (!r.stb) { q.missingSourceTable += 1; addIssue(n, "Missing source table", `${r.tsc}.${r.ttb || "?"}`); }
      if (!r.ttb) { q.missingTargetTable += 1; addIssue(n, "Missing target table", `${r.ssc}.${r.stb || "?"}`); }
      return;
    }
    if (!r.app) q.missingApp += 1;
    if (!r.tsc || !r.ssc) q.missingSchema += 1;
    if (!r.tdb || !r.sdb) q.missingDatabase += 1;

    const t = nodeId(r.tdb, r.tsc, r.ttb), s = nodeId(r.sdb, r.ssc, r.stb);
    if (t === s) { q.selfReferences += 1; addIssue(n, "Self reference", t); return; }
    const key = `${s}->${t}`;
    if (seenEdge.has(key)) { q.duplicateEdges += 1; return; }
    seenEdge.add(key);
    rows.push(r);
    q.validEdges += 1;
  });

  // reciprocal pairs = cycles
  for (const k of seenEdge) {
    const [s, t] = k.split("->");
    if (seenEdge.has(`${t}->${s}`) && s < t) q.cyclePairs += 1;
  }
  return { rows, quality: q, sheet: ws.name };
}

// Back-compat helper used by older callers.
export async function parseLineageWorkbook(buf: Buffer): Promise<LinRow[]> {
  return (await parseLineage(buf)).rows;
}

export interface Graph {
  rows: LinRow[];
  upstream: Map<string, LinRow[]>;
  downstream: Map<string, LinRow[]>;
  nodes: Map<string, { db: string; schema: string; table: string; app: string }>;
  targets: string[];
  all: string[];
  apps: string[];
  roots: string[];  // no sources
  leaves: string[]; // no targets
}

export function buildGraph(rows: LinRow[]): Graph {
  const upstream = new Map<string, LinRow[]>();
  const downstream = new Map<string, LinRow[]>();
  const nodes = new Map<string, { db: string; schema: string; table: string; app: string }>();
  const push = (m: Map<string, LinRow[]>, k: string, v: LinRow) => {
    const arr = m.get(k); if (arr) arr.push(v); else m.set(k, [v]);
  };
  for (const r of rows) {
    const t = nodeId(r.tdb, r.tsc, r.ttb), s = nodeId(r.sdb, r.ssc, r.stb);
    if (!nodes.has(t)) nodes.set(t, { db: norm(r.tdb), schema: norm(r.tsc), table: norm(r.ttb), app: r.app });
    if (!nodes.has(s)) nodes.set(s, { db: norm(r.sdb), schema: norm(r.ssc), table: norm(r.stb), app: r.app });
    push(upstream, t, r);
    push(downstream, s, r);
  }
  const all = [...nodes.keys()].sort();
  const targets = [...new Set(rows.map((r) => nodeId(r.tdb, r.tsc, r.ttb)))].sort();
  const apps = [...new Set(rows.map((r) => r.app).filter(Boolean))].sort();
  const roots = all.filter((id) => !upstream.has(id));
  const leaves = all.filter((id) => !downstream.has(id));
  return { rows, upstream, downstream, nodes, targets, all, apps, roots, leaves };
}

// Resolve a typed table name to matching node ids.
export function resolveTable(g: Graph, query: string): string[] {
  const q = norm(query);
  if (!q) return [];
  const ids = g.all;
  const exactId = ids.filter((id) => id === q);
  if (exactId.length) return exactId;
  const exactTable = ids.filter((id) => g.nodes.get(id)!.table === q);
  if (exactTable.length) return exactTable;
  return ids.filter((id) => id.includes(q)).slice(0, 25);
}

export interface Trace {
  nodes: LinNode[]; edges: LinEdge[]; truncated: boolean; seeds: string[];
}

export interface TraceOpts {
  direction?: "upstream" | "downstream" | "both";
  maxDepth?: number;      // 0 = unlimited
  apps?: string[];        // #1 application filter
  maxNodes?: number;
}

// Walk from one or more seeds (#7 multi-table compare).
export function trace(g: Graph, seedIds: string[], opts: TraceOpts = {}): Trace {
  const { direction = "upstream", maxDepth = 0, apps, maxNodes = 300 } = opts;
  const appFilter = apps && apps.length ? new Set(apps) : null;
  const nodes = new Map<string, LinNode>();
  const reachedBy = new Map<string, Set<string>>();
  const edges: LinEdge[] = [];
  const edgeKeys = new Set<string>();
  let truncated = false;

  const addNode = (id: string, level: number, seed: boolean, bySeed: string) => {
    const m = g.nodes.get(id) || { db: "", schema: "", table: id, app: "" };
    if (!nodes.has(id)) nodes.set(id, { id, ...m, level, seed });
    else if (seed) nodes.get(id)!.seed = true;
    const set = reachedBy.get(id) || new Set<string>();
    set.add(bySeed); reachedBy.set(id, set);
  };

  for (const s of seedIds) addNode(s, 0, true, s);

  const walk = (id: string, depth: number, dir: "upstream" | "downstream", bySeed: string, seen: Set<string>) => {
    if (maxDepth && depth >= maxDepth) return;
    if (seen.has(id)) return;
    seen.add(id);
    const rows = (dir === "upstream" ? g.upstream : g.downstream).get(id) || [];
    for (const r of rows) {
      if (appFilter && !appFilter.has(r.app)) continue;
      const t = nodeId(r.tdb, r.tsc, r.ttb), s = nodeId(r.sdb, r.ssc, r.stb);
      const next = dir === "upstream" ? s : t;
      if (next === id) continue;
      if (nodes.size >= maxNodes) { truncated = true; return; }
      addNode(next, dir === "upstream" ? depth + 1 : -(depth + 1), false, bySeed);
      const k = `${s}->${t}`;
      if (!edgeKeys.has(k)) { edgeKeys.add(k); edges.push({ from: s, to: t, app: r.app }); }
      walk(next, depth + 1, dir, bySeed, seen);
    }
  };

  for (const seed of seedIds) {
    if (direction === "upstream" || direction === "both") walk(seed, 0, "upstream", seed, new Set());
    if (direction === "downstream" || direction === "both") walk(seed, 0, "downstream", seed, new Set());
  }

  // #7: mark nodes reached from more than one seed
  if (seedIds.length > 1) {
    for (const [id, set] of reachedBy) if (set.size > 1) nodes.get(id)!.shared = true;
  }
  return { nodes: [...nodes.values()], edges, truncated, seeds: seedIds };
}

// Mark edges that close a cycle so the renderer can lay the graph out acyclically.
// The data keeps every edge — only the diagram treats back-edges specially, which
// is what made "both" traces fail to render.
export function markBackEdges(t: Trace): number {
  const adj = new Map<string, LinEdge[]>();
  for (const e of t.edges) { const a = adj.get(e.from); if (a) a.push(e); else adj.set(e.from, [e]); }
  const state = new Map<string, 0 | 1 | 2>(); // 0=unseen 1=in-stack 2=done
  let count = 0;
  const visit = (id: string) => {
    state.set(id, 1);
    for (const e of adj.get(id) || []) {
      const s = state.get(e.to) || 0;
      if (s === 1) { e.backEdge = true; count++; }
      else if (s === 0) visit(e.to);
    }
    state.set(id, 2);
  };
  for (const n of t.nodes) if (!state.get(n.id)) visit(n.id);
  return count;
}

const safeId = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return "n" + s.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 48) + "_" + (h >>> 0).toString(36);
};
const esc = (s: string) => String(s).replace(/"/g, "'").replace(/[<>]/g, " ");

export const APP_COLORS = ["#DA291C", "#2563eb", "#0891b2", "#7c3aed", "#16a34a", "#d97706", "#be185d", "#0f766e"];

export interface MermaidOpts {
  layout?: "LR" | "TB";          // #13
  group?: "none" | "schema" | "app"; // #10
  colorBy?: "role" | "app";      // #9
}

export function toMermaid(t: Trace, opts: MermaidOpts = {}): { code: string; idMap: Record<string, string>; appColors: Record<string, string> } {
  const { layout = "LR", group = "none", colorBy = "role" } = opts;
  const lines = [`graph ${layout}`];
  const idMap: Record<string, string> = {};
  const appColors: Record<string, string> = {};

  lines.push("    classDef inputJob fill:#FFD700,stroke:#000,stroke-width:2px;");
  lines.push("    classDef chainJob fill:#E3F2FD,stroke:#666;");
  lines.push("    classDef sharedJob fill:#FFE0B2,stroke:#B45309,stroke-width:2px;");

  const apps = [...new Set(t.nodes.map((n) => n.app).filter(Boolean))];
  if (colorBy === "app") {
    apps.forEach((a, i) => {
      const c = APP_COLORS[i % APP_COLORS.length];
      appColors[a] = c;
      lines.push(`    classDef app${i} fill:${c},stroke:#333,color:#fff;`);
    });
  }

  const decl = (n: LinNode) => {
    const sid = safeId(n.id);
    idMap[sid] = n.id;
    const label = n.schema ? `${esc(n.table)}<br/>${esc(n.schema)}` : esc(n.table);
    return `    ${sid}["${label}"]`;
  };

  if (group === "none") {
    for (const n of t.nodes) lines.push(decl(n));
  } else {
    const groups = new Map<string, LinNode[]>();
    for (const n of t.nodes) {
      const k = (group === "schema" ? n.schema : n.app) || "(none)";
      const arr = groups.get(k); if (arr) arr.push(n); else groups.set(k, [n]);
    }
    let gi = 0;
    for (const [k, ns] of groups) {
      lines.push(`    subgraph g${gi++}["${esc(k)}"]`);
      for (const n of ns) lines.push("  " + decl(n));
      lines.push("    end");
    }
  }

  for (const e of t.edges) {
    // back-edges are drawn dotted in the layout direction so dagre stays acyclic
    if (e.backEdge) lines.push(`    ${safeId(e.from)} -.-> ${safeId(e.to)}`);
    else lines.push(`    ${safeId(e.from)} --> ${safeId(e.to)}`);
  }

  for (const n of t.nodes) {
    const sid = safeId(n.id);
    if (n.seed) lines.push(`    class ${sid} inputJob;`);
    else if (n.shared) lines.push(`    class ${sid} sharedJob;`);
    else if (colorBy === "app" && n.app) lines.push(`    class ${sid} app${apps.indexOf(n.app)};`);
    else lines.push(`    class ${sid} chainJob;`);
  }
  if (t.truncated) {
    lines.push(`    truncated["… graph truncated"]`);
    lines.push(`    class truncated chainJob;`);
  }
  return { code: lines.join("\n"), idMap, appColors };
}
