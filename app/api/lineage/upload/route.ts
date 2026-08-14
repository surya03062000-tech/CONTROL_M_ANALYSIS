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

// mode=preview → parse + quality report only (#18 dry run)
// mode=upload  → save the workbook to the Volume
// mode=store   → index the parsed edges into the Delta table (#19)
export async function POST(req: NextRequest) {
  try {
    if (!gate(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "No file provided." }, { status: 400 });
    const f = file as File;
    if (!/\.(xlsx|xls)$/i.test(f.name)) return NextResponse.json({ error: "Please upload an .xlsx file." }, { status: 400 });

    const legacyPreview = form.get("preview") === "1";
    const mode = legacyPreview ? "preview" : String(form.get("mode") || "upload");

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
    const base = { name: f.name, sheet, size: buf.length, quality, targets, apps };

    if (mode === "preview") return NextResponse.json({ ...base, mode, preview: true });

    if (mode === "store") {
      // Index the parsed edges into Delta so traces query the lakehouse.
      const dataset = f.name.replace(/\.(xlsx|xls)$/i, "");
      await saveToDelta(dataset, rows);
      invalidate(`delta:${dataset}`);
      return NextResponse.json({ ...base, mode, dataset, stored: rows.length });
    }

    // mode === "upload": Volume copy only.
    if (!LINEAGE_VOLUME) return NextResponse.json({ error: "LINEAGE_VOLUME (or INPUT_VOLUME) is not configured." }, { status: 500 });
    const { path } = await uploadFileTo(LINEAGE_VOLUME, f.name, buf);
    invalidate(path);
    return NextResponse.json({ ...base, mode, path });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
