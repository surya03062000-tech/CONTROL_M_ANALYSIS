import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/leaveAuth";
import { listLeavesByRange, listHolidays, insertAudit } from "@/lib/leaveDb";
import { dayPartLabel, workingDates, computeWorkingDays, typeColor, LEAVE_TYPES } from "@/lib/leaveShared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RED = "FFDA291C", HEAD_TEXT = "FFFFFFFF", ALT = "FFF7F8FB", BORDER = "FFE2E7F0";
const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const thin = { style: "thin" as const, color: { argb: BORDER } };
const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: HEAD_TEXT }, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    c.alignment = { vertical: "middle", horizontal: "left" };
    c.border = allBorders;
  });
  row.height = 20;
}

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
    const holSet = new Set((await listHolidays()).map((h) => h.holiday_date));

    const wb = new ExcelJS.Workbook();
    wb.creator = "Rogers D&AI Portal"; wb.created = new Date();

    // ── Sheet 1: Leave Details ───────────────────────────────────────────────
    const ws = wb.addWorksheet("Leave Details", { views: [{ state: "frozen", ySplit: 3 }] });
    ws.mergeCells("A1:K1");
    const title = ws.getCell("A1");
    title.value = `Leave Report  (${from} → ${to})`;
    title.font = { bold: true, size: 14, color: { argb: RED } };
    ws.getCell("A2").value = `Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} · ${leaves.length} record(s) · weekends & holidays excluded from day counts`;
    ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF777777" } };

    ws.columns = [
      { key: "name", width: 24 }, { key: "user", width: 14 }, { key: "type", width: 13 },
      { key: "start", width: 13 }, { key: "end", width: 13 }, { key: "dates", width: 42 },
      { key: "duration", width: 16 }, { key: "days", width: 10 }, { key: "reason", width: 40 },
      { key: "id", width: 20 }, { key: "submitted", width: 21 },
    ];
    const head = ws.addRow(["Employee", "Username", "Type", "Start Date", "End Date", "Leave Dates (working days)", "Duration", "Days", "Reason", "Request ID", "Submitted At"]);
    styleHeader(head);
    ws.autoFilter = { from: "A3", to: "K3" };

    let totalDays = 0;
    leaves.forEach((l, i) => {
      const dates = workingDates(l.start_date, l.end_date, holSet);
      const days = computeWorkingDays(l.start_date, l.end_date, l.day_part, holSet);
      totalDays += days;
      const r = ws.addRow([
        l.display_name, l.username, l.leave_type, l.start_date, l.end_date, dates.join(", "),
        dayPartLabel(l.day_part), days, l.reason, l.request_id,
        (l.created_at || "").slice(0, 19).replace("T", " "),
      ]);
      r.eachCell((c) => { c.border = allBorders; c.alignment = { vertical: "top", wrapText: false }; });
      if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT } }; });
      const tc = r.getCell(3);
      tc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(typeColor(l.leave_type)) } };
      tc.font = { bold: true, color: { argb: HEAD_TEXT } };
      r.getCell(6).alignment = { wrapText: true, vertical: "top" };
      r.getCell(9).alignment = { wrapText: true, vertical: "top" };
    });
    const totalRow = ws.addRow(["", "", "", "", "", "", "TOTAL", totalDays, "", "", ""]);
    totalRow.getCell(7).font = { bold: true }; totalRow.getCell(8).font = { bold: true };

    // ── Sheet 2: Summary by Employee ─────────────────────────────────────────
    const byEmp = new Map<string, { name: string; reqs: number; days: number; t: Record<string, number> }>();
    const byType: Record<string, { reqs: number; days: number }> = {};
    for (const l of leaves) {
      const days = computeWorkingDays(l.start_date, l.end_date, l.day_part, holSet);
      const e = byEmp.get(l.username) || { name: l.display_name, reqs: 0, days: 0, t: {} };
      e.reqs += 1; e.days += days; e.t[l.leave_type] = (e.t[l.leave_type] || 0) + 1; byEmp.set(l.username, e);
      byType[l.leave_type] = byType[l.leave_type] || { reqs: 0, days: 0 };
      byType[l.leave_type].reqs += 1; byType[l.leave_type].days += days;
    }
    const sum = wb.addWorksheet("Summary by Employee", { views: [{ state: "frozen", ySplit: 1 }] });
    sum.columns = [{ key: "name", width: 26 }, { key: "user", width: 16 }, { key: "reqs", width: 12 }, { key: "days", width: 10 }, ...LEAVE_TYPES.map((t) => ({ key: t, width: 12 }))];
    styleHeader(sum.addRow(["Employee", "Username", "Requests", "Days", ...LEAVE_TYPES]));
    const rows = [...byEmp.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
    rows.forEach(([user, e], i) => {
      const r = sum.addRow([e.name, user, e.reqs, e.days, ...LEAVE_TYPES.map((t) => e.t[t] || 0)]);
      r.eachCell((c) => { c.border = allBorders; });
      if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT } }; });
    });
    const st = sum.addRow(["TOTAL", "", rows.reduce((a, [, e]) => a + e.reqs, 0), rows.reduce((a, [, e]) => a + e.days, 0), ...LEAVE_TYPES.map((t) => rows.reduce((a, [, e]) => a + (e.t[t] || 0), 0))]);
    st.eachCell((c) => { c.font = { bold: true }; });

    // ── Sheet 3: By Type ─────────────────────────────────────────────────────
    const bt = wb.addWorksheet("By Type");
    bt.columns = [{ key: "type", width: 16 }, { key: "reqs", width: 12 }, { key: "days", width: 10 }];
    styleHeader(bt.addRow(["Leave Type", "Requests", "Days"]));
    LEAVE_TYPES.forEach((t) => {
      const r = bt.addRow([t, byType[t]?.reqs || 0, byType[t]?.days || 0]);
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(typeColor(t)) } };
      r.getCell(1).font = { bold: true, color: { argb: HEAD_TEXT } };
      r.eachCell((c) => { c.border = allBorders; });
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
