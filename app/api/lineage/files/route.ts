import { NextResponse } from "next/server";
import { listLineageFiles } from "@/lib/lineageStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Lineage workbooks available in the Volume (newest first).
export async function GET() {
  try {
    const files = (await listLineageFiles()).slice(0, 10);
    return NextResponse.json({ files });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
