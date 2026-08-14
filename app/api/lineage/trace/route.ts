import { NextRequest, NextResponse } from "next/server";
import { loadGraph, allowedPath } from "@/lib/lineageStore";
import { resolveTable, trace, toMermaid } from "@/lib/lineage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Trace a table's lineage: upstream walks target → its sources → their sources …
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const path = sp.get("path") || "";
    if (!allowedPath(path)) return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
    const table = (sp.get("table") || "").trim();
    if (!table) return NextResponse.json({ error: "table required" }, { status: 400 });
    const direction = (sp.get("direction") || "upstream") as "upstream" | "downstream" | "both";
    const depth = Math.max(0, Number(sp.get("depth") || 0));

    const g = await loadGraph(path);
    const matches = resolveTable(g, table);
    if (!matches.length) return NextResponse.json({ error: `No table matching "${table}" in this workbook.` }, { status: 404 });
    if (matches.length > 1 && !matches.includes(table.trim().toUpperCase())) {
      return NextResponse.json({ ambiguous: true, matches: matches.slice(0, 25) });
    }
    const seed = matches[0];

    const t = trace(g, seed, direction, depth);
    const mermaid = toMermaid(t, "LR");

    // flat edge list for the table view / export
    const edges = t.edges.map((e) => {
      const s = g.nodes.get(e.from)!, d = g.nodes.get(e.to)!;
      return {
        app: e.app,
        source_db: s.db, source_schema: s.schema, source_table: s.table,
        target_db: d.db, target_schema: d.schema, target_table: d.table,
      };
    });

    return NextResponse.json({
      seed, direction,
      counts: { nodes: t.nodes.length, edges: t.edges.length, levels: Math.max(0, ...t.nodes.map((n) => Math.abs(n.level))) },
      truncated: t.truncated,
      nodes: t.nodes, edges, mermaid,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
