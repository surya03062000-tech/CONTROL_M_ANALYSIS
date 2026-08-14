import { NextResponse } from "next/server";
import { listLineageFiles, listDatasets } from "@/lib/lineageStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Available lineage sources: Delta datasets (#19) + workbooks in the Volume.
export async function GET() {
  try {
    const [files, datasets] = await Promise.all([
      listLineageFiles().catch(() => []),
      listDatasets().catch(() => []),
    ]);
    return NextResponse.json({ files: files.slice(0, 10), datasets });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
