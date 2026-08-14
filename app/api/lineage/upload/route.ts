import { NextRequest, NextResponse } from "next/server";
import { uploadFileTo } from "@/lib/databricks";
import { parseLineage } from "@/lib/lineage";
import { LINEAGE_VOLUME, invalidate, saveToDelta } from "@/lib/lineageStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function gate(req: NextRequest): boolean {
  const pw = process.env.APP_PASSWORD || "";
  return !pw || req.headers.get("x-app-password") === pw;
}

// preview=1 → parse + quality report only (#18 dry run). Otherwise: store in the
// Volume and persist the parsed edges to Delta (#19).
export async function POST(req: NextRequest) {
  try {
    if (!gate(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "No file provided." }, { status: 400 });
    const f = file as File;
    if (!/\.(xlsx|xls)$/i.test(f.name)) return NextResponse.json({ error: "Please upload an .xlsx file." }, { status: 400 });
    const preview = form.get("preview") === "1";

    const buf = Buffer.from(await f.arrayBuffer());
    const { rows, quality, sheet } = await parseLineage(buf);
    if (!rows.length) {
      return NextResponse.json({
        error: "No lineage rows found. The sheet needs Applications, Target database/schema/table and Source database/schema/table columns.",
        quality, sheet,
      }, { status: 400 });
    }

    const targets = new Set(rows.map((r) => `${r.tdb}.${r.tsc}.${r.ttb}`)).size;
    const apps = [...new Set(rows.map((r) => r.app).filter(Boolean))];
    if (preview) return NextResponse.json({ preview: true, name: f.name, sheet, quality, targets, apps });

    if (!LINEAGE_VOLUME) return NextResponse.json({ error: "LINEAGE_VOLUME (or INPUT_VOLUME) is not configured." }, { status: 500 });
    const { path } = await uploadFileTo(LINEAGE_VOLUME, f.name, buf);
    invalidate(path);

    // Persist to Delta so traces don't re-read the workbook (best effort).
    let dataset = ""; let deltaError = "";
    try {
      dataset = f.name.replace(/\.(xlsx|xls)$/i, "");
      await saveToDelta(dataset, rows);
      invalidate(`delta:${dataset}`);
    } catch (e: any) { deltaError = e?.message || String(e); dataset = ""; }

    return NextResponse.json({
      path, name: f.name, sheet, size: buf.length, quality, targets, apps,
      dataset, deltaError: deltaError || undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
