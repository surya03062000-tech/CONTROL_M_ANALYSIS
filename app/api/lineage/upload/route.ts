import { NextRequest, NextResponse } from "next/server";
import { uploadFileTo } from "@/lib/databricks";
import { parseLineageWorkbook } from "@/lib/lineage";
import { LINEAGE_VOLUME, invalidate } from "@/lib/lineageStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function gate(req: NextRequest): boolean {
  const pw = process.env.APP_PASSWORD || "";
  return !pw || req.headers.get("x-app-password") === pw;
}

// Upload the lineage workbook straight into the Databricks Volume.
export async function POST(req: NextRequest) {
  try {
    if (!gate(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "No file provided." }, { status: 400 });
    const f = file as File;
    if (!/\.(xlsx|xls)$/i.test(f.name)) return NextResponse.json({ error: "Please upload an .xlsx file." }, { status: 400 });

    const buf = Buffer.from(await f.arrayBuffer());
    // validate before storing so bad sheets fail fast with a clear message
    const rows = await parseLineageWorkbook(buf);
    if (!rows.length) {
      return NextResponse.json({
        error: "No lineage rows found. The sheet needs Applications, Target database/schema/table and Source database/schema/table columns.",
      }, { status: 400 });
    }

    if (!LINEAGE_VOLUME) return NextResponse.json({ error: "LINEAGE_VOLUME (or INPUT_VOLUME) is not configured." }, { status: 500 });
    const { path } = await uploadFileTo(LINEAGE_VOLUME, f.name, buf);
    invalidate(path);

    return NextResponse.json({ path, name: f.name, size: buf.length, rows: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
