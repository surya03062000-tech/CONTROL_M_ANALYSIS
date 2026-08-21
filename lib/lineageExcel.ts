// Builds the "Data Lineage" export workbook. Split out from the API route
// because Next.js route files may only export HTTP-method handlers.
import ExcelJS from "exceljs";
import { schemaBreakdown, type Direction, type Trace, type Graph } from "./lineage";

const RED = "FFDA291C", ALT = "FFF7F8FB", BORDER = "FFE2E7F0";
const thin = { style: "thin" as const, color: { argb: BORDER } };
const borders = { top: thin, left: thin, bottom: thin, right: thin };

// First 3 letters of a schema (e.g. "APP_CALLIDUS" -> "APP", "ELA_BANK" -> "ELA",
// "ODS_BANK" -> "ODS") — the source/target "category" columns in the export.
const category = (schema: string): string => (schema || "").slice(0, 3).toUpperCase();

export interface DiagramImage { buf: Buffer; width: number; height: number }

export async function buildLineageWorkbook(
  g: Graph, seeds: string[], direction: Direction, t: Trace,
  diagram?: DiagramImage,
): Promise<ExcelJS.Workbook> {
  const seed = seeds[0];
  const multi = seeds.length > 1;
  const schemas = schemaBreakdown(t.nodes);

  const wb = new ExcelJS.Workbook();
  wb.creator = "OpsCentral — Data Lineage";

  // ── Lineage ────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet("Lineage", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.mergeCells("A1:J1");
  const title = ws.getCell("A1");
  title.value = `Data Lineage — ${multi ? `${seeds.length} tables` : seed} (${direction})`;
  title.font = { bold: true, size: 14, color: { argb: RED } };
  ws.getCell("A2").value = `${t.nodes.length} table(s) · ${t.edges.length} relationship(s) · generated ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF777777" } };

  ws.columns = [
    { width: 30 },  // Main table
    { width: 26 },  // Applications
    { width: 14 },  // Source Category
    { width: 16 },  // Source database
    { width: 20 },  // Source schema
    { width: 34 },  // Source table
    { width: 14 },  // Target Category
    { width: 16 },  // Target database
    { width: 20 },  // Target schema
    { width: 34 },  // Target table
  ];
  const head = ws.addRow([
    "Main table", "Applications",
    "Source Category", "Source database", "Source schema", "Source table",
    "Target Category", "Target database", "Target schema", "Target table",
  ]);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    c.border = borders;
  });
  ws.autoFilter = { from: "A3", to: "J3" };

  // Multi-seed traces can share an edge between two input tables' chains; emit
  // one row per (seed, edge) pair so "Main table" always says which input that
  // row's data came from, instead of silently picking just one.
  let i = 0;
  for (const e of t.edges) {
    const s = g.nodes.get(e.from)!, d = g.nodes.get(e.to)!;
    for (const mainTable of e.seeds) {
      const r = ws.addRow([
        mainTable, e.app,
        category(s.schema), s.db, s.schema, s.table,
        category(d.schema), d.db, d.schema, d.table,
      ]);
      r.eachCell((c) => { c.border = borders; });
      if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT } }; });
      i++;
    }
  }

  // ── Tables ─────────────────────────────────────────────────────────────
  const nodesWs = wb.addWorksheet("Tables", { views: [{ state: "frozen", ySplit: 1 }] });
  nodesWs.columns = [{ width: 40 }, { width: 16 }, { width: 20 }, { width: 34 }, { width: 10 }, { width: 10 }];
  const nh = nodesWs.addRow(["Full name", "Database", "Schema", "Table", "Level", "Seed"]);
  nh.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    c.border = borders;
  });
  t.nodes.forEach((n, k) => {
    const r = nodesWs.addRow([n.id, n.db, n.schema, n.table, n.level, n.seed ? "Yes" : ""]);
    r.eachCell((c) => { c.border = borders; });
    if (k % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT } }; });
  });

  // ── Schema Breakdown ───────────────────────────────────────────────────
  const sbWs = wb.addWorksheet("Schema Breakdown", { views: [{ state: "frozen", ySplit: 3 }] });
  sbWs.mergeCells("A1:D1");
  const sbTitle = sbWs.getCell("A1");
  sbTitle.value = `Target Table: ${multi ? seeds.join(", ") : seed}`;
  sbTitle.font = { bold: true, size: 14, color: { argb: RED } };
  sbWs.getCell("A2").value = "Dependency table count per schema (staging vs application), excluding the target itself.";
  sbWs.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF777777" } };
  sbWs.columns = [{ width: 26 }, { width: 14 }, { width: 13 }, { width: 80 }];
  const sbHead = sbWs.addRow(["Schema", "Category", "Table Count", "Tables"]);
  sbHead.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    c.border = borders;
  });
  sbWs.autoFilter = { from: "A3", to: "D3" };

  let sbRow = 0, totalTables = 0;
  for (const s of schemas) {
    totalTables += s.totalCount;
    if (s.stgCount > 0) {
      const r = sbWs.addRow([s.schema, "Stg tables", s.stgCount, s.stgTables.join(", ")]);
      r.eachCell((c) => { c.border = borders; c.alignment = { wrapText: true, vertical: "top" }; });
      if (sbRow++ % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT } }; });
    }
    if (s.appCount > 0) {
      const r = sbWs.addRow([s.schema, "App tables", s.appCount, s.appTables.join(", ")]);
      r.eachCell((c) => { c.border = borders; c.alignment = { wrapText: true, vertical: "top" }; });
      if (sbRow++ % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT } }; });
    }
  }
  const sbTotal = sbWs.addRow(["TOTAL", "", totalTables, `${schemas.length} schema(s)`]);
  sbTotal.eachCell((c) => { c.font = { bold: true }; c.border = borders; });

  // ── Diagram (optional — only present when the client sent a rasterized PNG) ──
  if (diagram) {
    const dgWs = wb.addWorksheet("Diagram", { views: [{ showGridLines: false }] });
    dgWs.mergeCells("A1:N1");
    const dgTitle = dgWs.getCell("A1");
    dgTitle.value = `Lineage Diagram — ${multi ? `${seeds.length} tables` : seed} (${direction})`;
    dgTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    dgTitle.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    dgWs.getRow(1).height = 22;

    const imageId = wb.addImage({ buffer: diagram.buf as any, extension: "png" });
    // Display the full-resolution PNG at a sane on-screen size (Excel just
    // scales the bitmap — the embedded pixels stay full detail when zoomed).
    const MAX_W = 1800;
    const scale = Math.min(1, MAX_W / diagram.width);
    dgWs.addImage(imageId, { tl: { col: 0, row: 2 }, ext: { width: diagram.width * scale, height: diagram.height * scale } });
  }

  return wb;
}
