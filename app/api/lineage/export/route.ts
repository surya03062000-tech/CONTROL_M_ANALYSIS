import { NextRequest, NextResponse } from "next/server";
import { loadGraph, allowedPath } from "@/lib/lineageStore";
import { resolveTable, trace, DEFAULT_MAX_NODES, type Direction } from "@/lib/lineage";
import { buildLineageWorkbook, type DiagramImage } from "@/lib/lineageExcel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ExportParams {
  path: string; table: string; direction: Direction; depth: number; apps: string[];
}

function parseParams(sp: URLSearchParams): ExportParams | { error: string; status: number } {
  const path = sp.get("path") || "";
  if (!allowedPath(path)) return { error: "Path not allowed", status: 403 };
  const table = (sp.get("table") || "").trim();
  if (!table) return { error: "table required", status: 400 };
  const direction = (sp.get("direction") || "upstream") as Direction;
  const depth = Math.max(0, Math.min(20, Number(sp.get("depth") || 0)));
  const apps = (sp.get("apps") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { path, table, direction, depth, apps };
}

// image/png;base64,.... -> Buffer (also accepts a bare base64 string)
function decodeDataUrl(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  try { return Buffer.from(m ? m[1] : dataUrl, "base64"); } catch { return null; }
}

async function resolveSeedsAndTrace(path: string, table: string, direction: Direction, depth: number, apps: string[]) {
  const g = await loadGraph(path);
  const seeds: string[] = [];
  for (const w of table.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = resolveTable(g, w);
    if (m.length) seeds.push(m[0]);
  }
  if (!seeds.length) return null;
  const t = trace(g, seeds, { direction, maxDepth: depth, apps, maxNodes: DEFAULT_MAX_NODES });
  return { g, seeds, t };
}

function xlsxResponse(buf: ArrayBuffer, seeds: string[], direction: Direction) {
  const safe = seeds.join("_").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);
  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="lineage-${safe}-${direction}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

// GET — plain export (no diagram sheet; used for bookmarkable/simple links).
export async function GET(req: NextRequest) {
  try {
    const parsed = parseParams(req.nextUrl.searchParams);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const { path, table, direction, depth, apps } = parsed;

    const resolved = await resolveSeedsAndTrace(path, table, direction, depth, apps);
    if (!resolved) return NextResponse.json({ error: "No matching table" }, { status: 404 });
    const { g, seeds, t } = resolved;

    const wb = await buildLineageWorkbook(g, seeds, direction, t);
    const buf = await wb.xlsx.writeBuffer();
    return xlsxResponse(buf as any, seeds, direction);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

// POST — same export, plus an optional client-rasterized diagram PNG embedded
// as a new "Diagram" sheet (#4: the full lineage diagram alongside the data).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const path = String(body.path || "");
    if (!allowedPath(path)) return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
    const table = String(body.table || "").trim();
    if (!table) return NextResponse.json({ error: "table required" }, { status: 400 });
    const direction = (body.direction || "upstream") as Direction;
    const depth = Math.max(0, Math.min(20, Number(body.depth || 0)));
    const apps: string[] = Array.isArray(body.apps) ? body.apps
      : String(body.apps || "").split(",").map((s: string) => s.trim()).filter(Boolean);

    const resolved = await resolveSeedsAndTrace(path, table, direction, depth, apps);
    if (!resolved) return NextResponse.json({ error: "No matching table" }, { status: 404 });
    const { g, seeds, t } = resolved;

    let diagram: DiagramImage | undefined;
    const dataUrl = typeof body.diagramPng === "string" ? body.diagramPng : "";
    const w = Number(body.diagramWidth), h = Number(body.diagramHeight);
    if (dataUrl && w > 0 && h > 0) {
      const buf = decodeDataUrl(dataUrl);
      if (buf && buf.length) diagram = { buf, width: w, height: h };
    }

    const wb = await buildLineageWorkbook(g, seeds, direction, t, diagram);
    const buf = await wb.xlsx.writeBuffer();
    return xlsxResponse(buf as any, seeds, direction);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
