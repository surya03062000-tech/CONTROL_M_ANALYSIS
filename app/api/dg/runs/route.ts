import { NextResponse } from "next/server";
import { listVolumeXlsx } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DG_OUTPUT_VOLUME = (process.env.DG_OUTPUT_VOLUME || process.env.OUTPUT_VOLUME || "").replace(/\/+$/, "");

// Recent DG outputs (DG_*.xlsx) — newest 3.
export async function GET() {
  try {
    const files = (await listVolumeXlsx(DG_OUTPUT_VOLUME)).filter((f) => /^DG_/i.test(f.name)).slice(0, 3);
    return NextResponse.json({ files });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
