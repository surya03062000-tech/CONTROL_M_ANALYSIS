import { NextRequest, NextResponse } from "next/server";
import { loadGraph, allowedPath } from "@/lib/lineageStore";
import { resolveTable, trace, toMermaid, markBackEdges, schemaBreakdown, DEFAULT_MAX_NODES } from "@/lib/lineage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Trace one or more tables. Supports direction, depth (#2), application filter (#1),
// multi-seed compare (#7), layout (#13), grouping (#10) and colour-by (#9).
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const path = sp.get("path") || "";
    if (!allowedPath(path)) return NextResponse.json({ error: "Path not allowed" }, { status: 403 });

    const raw = (sp.get("table") || "").trim();
    if (!raw) return NextResponse.json({ error: "table required" }, { status: 400 });
    const wanted = raw.split(",").map((s) => s.trim()).filter(Boolean);

    const direction = (["upstream", "downstream", "both"].includes(sp.get("direction") || "") ? sp.get("direction") : "upstream") as "upstream" | "downstream" | "both";
    const depth = Math.max(0, Math.min(20, Number(sp.get("depth") || 0)));
    const apps = (sp.get("apps") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const layout = sp.get("layout") === "TB" ? "TB" : "LR";
    const group = (["schema", "app"].includes(sp.get("group") || "") ? sp.get("group") : "none") as "none" | "schema" | "app";
    const colorBy = sp.get("colorBy") === "app" ? "app" : "role";

    const g = await loadGraph(path);

    const seeds: string[] = [];
    for (const w of wanted) {
      const matches = resolveTable(g, w);
      if (!matches.length) return NextResponse.json({ error: `No table matching "${w}" in this dataset.` }, { status: 404 });
      if (matches.length > 1 && !matches.includes(w.toUpperCase())) {
        if (wanted.length === 1) return NextResponse.json({ ambiguous: true, matches: matches.slice(0, 25) });
        return NextResponse.json({ error: `"${w}" is ambiguous — use the full name.` }, { status: 400 });
      }
      seeds.push(matches[0]);
    }

    const t = trace(g, seeds, { direction, maxDepth: depth, apps, maxNodes: DEFAULT_MAX_NODES });
    // Cycles are real in lineage data; mark back-edges so the diagram lays out
    // acyclically instead of failing to render (notably for direction=both).
    const backEdges = markBackEdges(t);
    const { code, idMap, appColors } = toMermaid(t, { layout, group, colorBy });
    // Target table X: how many tables come from each schema, split staging vs app.
    const schemas = schemaBreakdown(t.nodes);

    const edges = t.edges.map((e) => {
      const s = g.nodes.get(e.from)!, d = g.nodes.get(e.to)!;
      return {
        app: e.app, cycle: !!e.backEdge,
        source_db: s.db, source_schema: s.schema, source_table: s.table,
        target_db: d.db, target_schema: d.schema, target_table: d.table,
      };
    });

    return NextResponse.json({
      seeds, direction, depth, layout, group, colorBy,
      counts: {
        nodes: t.nodes.length, edges: t.edges.length,
        levels: t.nodes.length ? Math.max(0, ...t.nodes.map((n) => Math.abs(n.level))) : 0,
        apps: new Set(t.edges.map((e) => e.app).filter(Boolean)).size,
        shared: t.nodes.filter((n) => n.shared).length,
        backEdges,
      },
      truncated: t.truncated,
      nodes: t.nodes, edges, mermaid: code, idMap, appColors, schemas,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
