import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { downloadFile } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DG_OUTPUT_VOLUME = (process.env.DG_OUTPUT_VOLUME || process.env.OUTPUT_VOLUME || "").replace(/\/+$/, "");

// Returns the first worksheet of a DG Excel as { sheet, headers, rows } for in-browser preview.
export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get("path");
    if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });
    if (DG_OUTPUT_VOLUME && !path.startsWith(DG_OUTPUT_VOLUME)) return NextResponse.json({ error: "Path not allowed" }, { status: 403 });

    const res = await downloadFile(path);
    if (!res.ok) return NextResponse.json({ error: `Read failed (${res.status})` }, { status: 502 });
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const sheets = wb.worksheets.map((w) => w.name);
    const wanted = req.nextUrl.searchParams.get("sheet");
    const ws = (wanted && wb.getWorksheet(wanted)) || wb.worksheets[0];
    if (!ws) return NextResponse.json({ sheets, headers: [], rows: [] });

    const cellText = (v: any) => (v && typeof v === "object" && "text" in v ? String((v as any).text) : v == null ? "" : String(v));
    const headers: string[] = [];
    ws.getRow(1).eachCell((c) => headers.push(cellText(c.value)));
    const rows: string[][] = [];
    ws.eachRow((row, rn) => {
      if (rn === 1 || rows.length >= 200) return;
      const r: string[] = [];
      for (let i = 1; i <= headers.length; i++) r.push(cellText(row.getCell(i).value));
      rows.push(r);
    });
    return NextResponse.json({ sheets, sheet: ws.name, headers, rows, truncated: ws.actualRowCount - 1 > rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
