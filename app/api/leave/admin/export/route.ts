import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/leaveAuth";
import { listLeavesByRange, insertAudit } from "@/lib/leaveDb";
import { dayPartLabel, rangeLabel, expandDates, LEAVE_TYPES } from "@/lib/leaveShared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RED = "FFDA291C";
const HEAD_TEXT = "FFFFFFFF";
const ALT = "FFF7F8FB";

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: HEAD_TEXT }, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    c.alignment = { vertical: "middle", horizontal: "left" };
    c.border = { bottom: { style: "thin", color: { argb: "FFBBBBBB" } } };
  });
  row.height = 20;
}

// Excel (.xlsx) leave report for a date range (month / year / custom period).
export async function GET(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s || s.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

    const q = req.nextUrl.searchParams;
    const from = (q.get("from") || "").slice(0, 10);
    const to = (q.get("to") || "").slice(0, 10);
    const label = q.get("label") || (from && to ? `${from}_to_${to}` : "leave-report");
    if (!from || !to) return NextResponse.json({ error: "from and to dates required" }, { status: 400 });

    const leaves = await listLeavesByRange(from, to);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Rogers D&AI Portal";
    wb.created = new Date();

    // ── Sheet 1: Leave Details ───────────────────────────────────────────────
    const ws = wb.addWorksheet("Leave Details", { views: [{ state: "frozen", ySplit: 3 }] });
    ws.mergeCells("A1:K1");
    const title = ws.getCell("A1");
    title.value = `Leave Report  (${from} → ${to})`;
    title.font = { bold: true, size: 14, color: { argb: RED } };
    ws.getCell("A2").value = `Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} · ${leaves.length} record(s)`;
    ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF777777" } };

    ws.columns = [
      { key: "name", width: 24 }, { key: "user", width: 14 }, { key: "type", width: 12 },
      { key: "start", width: 13 }, { key: "end", width: 13 }, { key: "dates", width: 40 },
      { key: "duration", width: 16 }, { key: "days", width: 8 }, { key: "reason", width: 40 },
      { key: "id", width: 20 }, { key: "submitted", width: 21 },
    ];
    const head = ws.addRow(["Employee", "Username", "Type", "Start Date", "End Date", "Leave Dates", "Duration", "Days", "Reason", "Request ID", "Submitted At"]);
    styleHeader(head);

    leaves.forEach((l, i) => {
      const dates = expandDates(l.start_date, l.end_date).join(", ");
      const r = ws.addRow([
        l.display_name, l.username, l.leave_type, l.start_date, l.end_date, dates,
        dayPartLabel(l.day_part), Number(l.days) || 0, l.reason, l.request_id,
        (l.created_at || "").slice(0, 19).replace("T", " "),
      ]);
      if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT } }; });
      r.getCell(9).alignment = { wrapText: true, vertical: "top" };
      r.getCell(6).alignment = { wrapText: true, vertical: "top" };
    });

    // ── Sheet 2: Summary by Employee ─────────────────────────────────────────
    const byEmp = new Map<string, { name: string; reqs: number; days: number; t: Record<string, number> }>();
    for (const l of leaves) {
      const e = byEmp.get(l.username) || { name: l.display_name, reqs: 0, days: 0, t: {} };
      e.reqs += 1; e.days += Number(l.days) || 0;
      e.t[l.leave_type] = (e.t[l.leave_type] || 0) + 1;
      byEmp.set(l.username, e);
    }
    const sum = wb.addWorksheet("Summary by Employee", { views: [{ state: "frozen", ySplit: 1 }] });
    sum.columns = [
      { key: "name", width: 26 }, { key: "user", width: 16 }, { key: "reqs", width: 12 }, { key: "days", width: 10 },
      ...LEAVE_TYPES.map((t) => ({ key: t, width: 12 })),
    ];
    const sh = sum.addRow(["Employee", "Username", "Requests", "Days", ...LEAVE_TYPES]);
    styleHeader(sh);
    [...byEmp.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([user, e], i) => {
      const r = sum.addRow([e.name, user, e.reqs, e.days, ...LEAVE_TYPES.map((t) => e.t[t] || 0)]);
      if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT } }; });
    });

    const buf = await wb.xlsx.writeBuffer();
    await insertAudit(s.username, "report_excel", `${from}..${to}`, `${leaves.length} rows`);
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="leave-report-${label}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
