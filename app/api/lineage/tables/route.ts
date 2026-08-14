import { NextRequest, NextResponse } from "next/server";
import { loadGraph, allowedPath } from "@/lib/lineageStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Distinct target tables in a workbook (for the search / picker).
export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get("path") || "";
    if (!allowedPath(path)) return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
    const q = (req.nextUrl.searchParams.get("q") || "").trim().toUpperCase();

    const g = await loadGraph(path);
    let ids = g.targets;
    if (q) ids = ids.filter((id) => id.includes(q));
    const tables = ids.slice(0, 200).map((id) => {
      const n = g.nodes.get(id)!;
      return { id, table: n.table, schema: n.schema, db: n.db };
    });
    return NextResponse.json({ total: g.targets.length, apps: g.apps, rows: g.rows.length, tables });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
