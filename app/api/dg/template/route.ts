import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Standard table-creation template: Schema, Table Name, Column Name, Data Type.
export async function GET() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rogers D&AI Portal";

  const ws = wb.addWorksheet("Tables");
  ws.columns = [
    { header: "Schema", key: "schema", width: 26 },
    { header: "Table Name", key: "table", width: 30 },
    { header: "Column Name", key: "column", width: 28 },
    { header: "Data Type", key: "type", width: 18 },
  ];
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDA291C" } };
  });
  // sample rows (delete before filling your own)
  [
    ["sales", "customers", "customer_id", "BIGINT"],
    ["sales", "customers", "customer_name", "STRING"],
    ["sales", "customers", "created_at", "TIMESTAMP"],
    ["sales", "orders", "order_id", "BIGINT"],
    ["sales", "orders", "amount", "DECIMAL(12,2)"],
  ].forEach((r) => ws.addRow(r));

  const help = wb.addWorksheet("Instructions");
  help.columns = [{ width: 100 }];
  [
    "How to use this template",
    "",
    "1. Fill the 'Tables' sheet — one row per COLUMN.",
    "2. Schema = target schema (created if missing). Table Name = table to create.",
    "3. Column Name + Data Type define each column. Repeat the Schema/Table for every column.",
    "4. Supported types: STRING, INT, BIGINT, SMALLINT, TINYINT, BOOLEAN, DOUBLE, FLOAT, DATE,",
    "   TIMESTAMP, BINARY, DECIMAL(p,s), VARCHAR(n). Unknown types default to STRING.",
    "5. You can include 100+ tables. Catalog is fixed to edl_qa.",
    "6. Save and upload on the DG Document Creation page (Step 1).",
  ].forEach((t) => help.addRow([t]));
  help.getRow(1).font = { bold: true, size: 13, color: { argb: "FFDA291C" } };

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dg-table-template.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
