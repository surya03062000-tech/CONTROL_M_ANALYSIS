import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { loadGraph, allowedPath } from "@/lib/lineageStore";
import { resolveTable, trace } from "@/lib/lineage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RED = "FFDA291C", ALT = "FFF7F8FB", BORDER = "FFE2E7F0";
const thin = { style: "thin" as const, color: { argb: BORDER } };
const borders = { top: thin, left: thin, bottom: thin, right: thin };

// Excel export of a traced lineage (edges + nodes).
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const path = sp.get("path") || "";
    if (!allowedPath(path)) return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
    const table = (sp.get("table") || "").trim();
    if (!table) return NextResponse.json({ error: "table required" }, { status: 400 });
    const direction = (sp.get("direction") || "upstream") as "upstream" | "downstream" | "both";

    const g = await loadGraph(path);
    const matches = resolveTable(g, table);
    if (!matches.length) return NextResponse.json({ error: "No matching table" }, { status: 404 });
    const seed = matches[0];
    const t = trace(g, seed, direction, 0);

    const wb = new ExcelJS.Workbook();
    wb.creator = "OpsCentral — Data Lineage";

    const ws = wb.addWorksheet("Lineage", { views: [{ state: "frozen", ySplit: 3 }] });
    ws.mergeCells("A1:G1");
    const title = ws.getCell("A1");
    title.value = `Data Lineage — ${seed} (${direction})`;
    title.font = { bold: true, size: 14, color: { argb: RED } };
    ws.getCell("A2").value = `${t.nodes.length} table(s) · ${t.edges.length} relationship(s) · generated ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
    ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF777777" } };

    ws.columns = [
      { width: 26 }, { width: 16 }, { width: 20 }, { width: 34 }, { width: 16 }, { width: 20 }, { width: 34 },
    ];
    const head = ws.addRow(["Applications", "Source database", "Source schema", "Source table", "Target database", "Target schema", "Target table"]);
    head.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
      c.border = borders;
    });
    ws.autoFilter = { from: "A3", to: "G3" };

    t.edges.forEach((e, i) => {
      const s = g.nodes.get(e.from)!, d = g.nodes.get(e.to)!;
      const r = ws.addRow([e.app, s.db, s.schema, s.table, d.db, d.schema, d.table]);
      r.eachCell((c) => { c.border = borders; });
      if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT } }; });
    });

    const nodesWs = wb.addWorksheet("Tables", { views: [{ state: "frozen", ySplit: 1 }] });
    nodesWs.columns = [{ width: 40 }, { width: 16 }, { width: 20 }, { width: 34 }, { width: 10 }, { width: 10 }];
    const nh = nodesWs.addRow(["Full name", "Database", "Schema", "Table", "Level", "Seed"]);
    nh.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
      c.border = borders;
    });
    t.nodes.forEach((n, i) => {
      const r = nodesWs.addRow([n.id, n.db, n.schema, n.table, n.level, n.seed ? "Yes" : ""]);
      r.eachCell((c) => { c.border = borders; });
      if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT } }; });
    });

    const buf = await wb.xlsx.writeBuffer();
    const safe = seed.replace(/[^A-Za-z0-9_.-]/g, "_");
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="lineage-${safe}-${direction}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
