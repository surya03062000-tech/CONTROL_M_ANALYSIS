import { NextResponse } from "next/server";
import { listVolumeXlsx } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DG_INPUT_VOLUME = (process.env.DG_INPUT_VOLUME || process.env.INPUT_VOLUME || process.env.OUTPUT_VOLUME || "").replace(/\/+$/, "");

// Recently uploaded table templates (excludes DG_/AI_ outputs) — newest 5.
export async function GET() {
  try {
    const files = (await listVolumeXlsx(DG_INPUT_VOLUME)).filter((f) => !/^(DG_|AI_)/i.test(f.name)).slice(0, 5);
    return NextResponse.json({ files });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
