import { NextRequest, NextResponse } from "next/server";
import { listSchemas, DG_CATALOG } from "@/lib/dg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    return NextResponse.json({ catalog: DG_CATALOG, schemas: await listSchemas() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
