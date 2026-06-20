import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/leaveAuth";
import { getLeaveById, deleteLeave, updateLeave, ownLeavesOverlapping, insertAudit, listHolidays } from "@/lib/leaveDb";
import { LEAVE_TYPES, computeWorkingDays, isHalf } from "@/lib/leaveShared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cancel / withdraw a leave (owner or admin).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await getSession(req);
    if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const id = decodeURIComponent(params.id);
    const rec = await getLeaveById(id);
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (rec.username !== s.username && s.role !== "admin") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    await deleteLeave(id);
    await insertAudit(s.username, "leave_delete", id, rec.username);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

// Edit a leave (owner or admin).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await getSession(req);
    if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const id = decodeURIComponent(params.id);
    const rec = await getLeaveById(id);
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (rec.username !== s.username && s.role !== "admin") return NextResponse.json({ error: "Not allowed" }, { status: 403 });

    const body = await req.json();
    const leave_type = String(body.leave_type || rec.leave_type);
    if (!LEAVE_TYPES.includes(leave_type as any)) return NextResponse.json({ error: "Invalid leave type" }, { status: 400 });
    const start_date = String(body.start_date || rec.start_date).slice(0, 10);
    const day_part = ["full", "half-am", "half-pm"].includes(body.day_part) ? body.day_part : "full";
    let end_date = String(body.end_date || start_date).slice(0, 10);
    if (isHalf(day_part) || end_date < start_date) end_date = start_date;
    const reason = String(body.reason ?? rec.reason).trim();
    if (!reason) return NextResponse.json({ error: "Reason is required" }, { status: 400 });

    const overlap = await ownLeavesOverlapping(rec.username, start_date, end_date, id);
    if (overlap.length) return NextResponse.json({ error: `Overlaps another leave (${overlap[0].request_id}).` }, { status: 409 });

    const holidays = new Set((await listHolidays()).map((h) => h.holiday_date));
    const wdays = computeWorkingDays(start_date, end_date, day_part, holidays);
    if (wdays <= 0) return NextResponse.json({ error: "Those date(s) fall on a weekend/holiday, which aren't counted as leave." }, { status: 400 });

    await updateLeave(id, { leave_type, start_date, end_date, day_part, days: String(wdays), reason });
    await insertAudit(s.username, "leave_edit", id, "");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
