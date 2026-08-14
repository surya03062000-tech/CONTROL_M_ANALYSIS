import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Standard lineage template — same columns the tool reads.
export async function GET() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OpsCentral — Data Lineage";

  const ws = wb.addWorksheet("Lineage");
  ws.columns = [
    { header: "Applications", key: "app", width: 26 },
    { header: "Target database", key: "tdb", width: 18 },
    { header: "Target schema", key: "tsc", width: 22 },
    { header: "Target table", key: "ttb", width: 34 },
    { header: "Source database", key: "sdb", width: 18 },
    { header: "Source schema", key: "ssc", width: 22 },
    { header: "Source table", key: "stb", width: 34 },
  ];
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDA291C" } };
    c.alignment = { vertical: "middle" };
  });
  ws.getRow(1).height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  [
    ["Commissions - Residual", "BDWPROD", "APP_CALLIDUS", "WLS_DLR_RES_FIN_CLLDS_DLY_STG", "BDWPROD", "APP_CALLIDUS", "WLS_DLR_RESIDL_TRN_CLLDS_DLY"],
    ["Commissions - Residual", "BDWPROD", "APP_CALLIDUS", "WLS_DLR_RESIDL_TRN_CLLDS_DLY", "BDWPROD", "APP_CALLIDUS", "WLS_DLR_RESIDL_SBSCRBR_ST_STG"],
    ["Commissions - Residual", "BDWPROD", "APP_CALLIDUS", "WLS_DLR_RESIDL_SBSCRBR_ST_STG", "BDWPROD", "ELA_V21", "SUBSCRIBER"],
  ].forEach((r) => ws.addRow(r));

  const help = wb.addWorksheet("Instructions");
  help.columns = [{ width: 110 }];
  [
    "How to use this template",
    "",
    "1. Fill the 'Lineage' sheet — one row per SOURCE → TARGET relationship.",
    "2. A table that is a target in one row can be a source in another; that is how multi-level",
    "   lineage is built (target → its sources → their sources …).",
    "3. Required per row: Target table and Source table. Database/schema are optional but",
    "   recommended — they make table names unique (BDWPROD.APP_CALLIDUS.MY_TABLE).",
    "4. 'Applications' is used to filter and colour the diagram.",
    "5. Leave cells blank if unknown — '(blank)' and '-' are treated as empty. Rows without a",
    "   source or target table are skipped and reported in the quality report.",
    "6. Duplicate rows and self-references (source = target) are reported and ignored.",
    "7. Save and upload on the Data Lineage page — you can preview before storing.",
  ].forEach((t) => help.addRow([t]));
  help.getRow(1).font = { bold: true, size: 13, color: { argb: "FFDA291C" } };

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="lineage-template.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
