import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { uploadFileTo } from "@/lib/databricks";
import { createTablesFromRows, DG_CATALOG, type ColDef } from "@/lib/dg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const DG_INPUT_VOLUME = (process.env.DG_INPUT_VOLUME || process.env.INPUT_VOLUME || process.env.OUTPUT_VOLUME || "").replace(/\/+$/, "");

function gate(req: NextRequest): boolean {
  const pw = process.env.APP_PASSWORD || "";
  return !pw || req.headers.get("x-app-password") === pw;
}
const norm = (v: any) => String(v ?? "").trim().toLowerCase();
const cellText = (v: any) => (v && typeof v === "object" && "text" in v ? String((v as any).text) : v == null ? "" : String(v)).trim();

async function parseExcel(buf: Buffer): Promise<ColDef[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets.find((w) => w.actualRowCount > 1) || wb.worksheets[0];
  if (!ws) return [];
  const headers: Record<string, number> = {};
  ws.getRow(1).eachCell((c, col) => { headers[norm(c.value)] = col; });
  const pick = (names: string[]) => { for (const n of names) if (headers[n]) return headers[n]; return 0; };
  const cS = pick(["schema", "schema name", "schemaname"]);
  const cT = pick(["table name", "table", "tablename"]);
  const cC = pick(["column name", "column", "columnname"]);
  const cD = pick(["data type", "datatype", "type"]);
  if (!cS || !cT || !cC || !cD) return [];
  const rows: ColDef[] = [];
  ws.eachRow((row, rn) => {
    if (rn === 1) return;
    const schema = cellText(row.getCell(cS).value);
    const table = cellText(row.getCell(cT).value);
    const column = cellText(row.getCell(cC).value);
    const dataType = cellText(row.getCell(cD).value);
    if (schema && table && column && dataType) rows.push({ schema, table, column, dataType });
  });
  return rows;
}

// Streams plain-text log lines as schemas/tables are created in edl_qa.
export async function POST(req: NextRequest) {
  if (!gate(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "No file provided." }, { status: 400 });
  const f = file as File;
  if (!/\.(xlsx|xls)$/i.test(f.name)) return NextResponse.json({ error: "Please upload an .xlsx file." }, { status: 400 });
  const buf = Buffer.from(await f.arrayBuffer());

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const log = (line: string) => controller.enqueue(enc.encode(line + "\n"));
      try {
        log(`Uploading "${f.name}" to the volume…`);
        if (DG_INPUT_VOLUME) {
          try { const { path } = await uploadFileTo(DG_INPUT_VOLUME, f.name, buf); log(`✓ uploaded → ${path}`); }
          catch (e: any) { log(`⚠ volume upload skipped: ${e?.message || e}`); }
        } else { log("⚠ no DG_INPUT_VOLUME configured — skipping volume copy."); }

        log("Reading spreadsheet…");
        const rows = await parseExcel(buf);
        if (!rows.length) { log("✗ No valid rows. Need columns: Schema, Table Name, Column Name, Data Type."); return; }
        log(`Creating in catalog: ${DG_CATALOG}`);
        await createTablesFromRows(rows, DG_CATALOG, log);
        log("__DONE__");
      } catch (e: any) {
        log(`✗ Error: ${e?.message || e}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
