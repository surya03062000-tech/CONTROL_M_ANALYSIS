import { NextRequest, NextResponse } from "next/server";
import { listTables, DG_CATALOG } from "@/lib/dg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ?schemas=a,b,c  →  [{ schema, table }] across all requested schemas.
export async function GET(req: NextRequest) {
  try {
    const schemas = (req.nextUrl.searchParams.get("schemas") || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!schemas.length) return NextResponse.json({ tables: [] });
    const out: { schema: string; table: string }[] = [];
    for (const sch of schemas) {
      try { (await listTables(DG_CATALOG, sch)).forEach((t) => out.push({ schema: sch, table: t })); } catch {}
    }
    return NextResponse.json({ catalog: DG_CATALOG, tables: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
