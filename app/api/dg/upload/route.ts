import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { uploadFileTo } from "@/lib/databricks";
import { createTablesFromRows, DG_CATALOG, type ColDef, type DgEvent } from "@/lib/dg";

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
    const schema = cellText(row.getCell(cS).value), table = cellText(row.getCell(cT).value);
    const column = cellText(row.getCell(cC).value), dataType = cellText(row.getCell(cD).value);
    if (schema && table && column && dataType) rows.push({ schema, table, column, dataType });
  });
  return rows;
}

// Streams newline-delimited JSON events (logs, per-table rows, progress, summary).
export async function POST(req: NextRequest) {
  if (!gate(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "No file provided." }, { status: 400 });
  const f = file as File;
  if (!/\.(xlsx|xls)$/i.test(f.name)) return NextResponse.json({ error: "Please upload an .xlsx file." }, { status: 400 });
  const buf = Buffer.from(await f.arrayBuffer());
  const dryRun = form.get("dryRun") === "1";

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (e: DgEvent | { t: string; [k: string]: any }) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        // #14 timestamped copy into the volume + keep original name in the log
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const stored = f.name.replace(/\.(xlsx|xls)$/i, "") + `_${ts}.xlsx`;
        if (DG_INPUT_VOLUME) {
          try { const { path } = await uploadFileTo(DG_INPUT_VOLUME, stored, buf); send({ t: "log", line: `✓ uploaded → ${path}` }); }
          catch (e: any) { send({ t: "log", line: `⚠ volume upload skipped: ${e?.message || e}` }); }
        }
        send({ t: "log", line: "Reading spreadsheet…" });
        const rows = await parseExcel(buf);
        if (!rows.length) { send({ t: "log", line: "✗ No valid rows. Need columns: Schema, Table Name, Column Name, Data Type." }); send({ t: "done" }); return; }
        if (dryRun) { send({ t: "log", line: `Dry-run: ${rows.length} row(s) parsed. No changes made.` }); send({ t: "done", dryRun: true }); return; }
        send({ t: "log", line: `Creating in catalog: ${DG_CATALOG}` });
        await createTablesFromRows(rows, DG_CATALOG, send);
        send({ t: "done" });
      } catch (e: any) {
        send({ t: "log", line: `✗ Error: ${e?.message || e}` }); send({ t: "done" });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
