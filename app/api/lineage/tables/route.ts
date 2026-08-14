import { NextRequest, NextResponse } from "next/server";
import { loadGraph, allowedPath } from "@/lib/lineageStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Tables in a dataset. scope=targets (default) or all (#3: include source-only tables).
export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get("path") || "";
    if (!allowedPath(path)) return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
    const q = (req.nextUrl.searchParams.get("q") || "").trim().toUpperCase();
    const scope = req.nextUrl.searchParams.get("scope") === "all" ? "all" : "targets";

    const g = await loadGraph(path);
    const base = scope === "all" ? g.all : g.targets;
    const targetSet = new Set(g.targets);
    let ids = q ? base.filter((id) => id.includes(q)) : base;
    const tables = ids.slice(0, 300).map((id) => {
      const n = g.nodes.get(id)!;
      return { id, table: n.table, schema: n.schema, db: n.db, app: n.app, isTarget: targetSet.has(id) };
    });
    return NextResponse.json({
      total: base.length, rows: g.rows.length, apps: g.apps,
      counts: { tables: g.all.length, targets: g.targets.length, roots: g.roots.length, leaves: g.leaves.length },
      roots: g.roots.slice(0, 50), leaves: g.leaves.slice(0, 50),
      tables,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
