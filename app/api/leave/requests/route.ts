import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/leaveAuth";
import { insertLeave, listLeavesByUser, getConfig, ownLeavesOverlapping, leaveIdExists, insertAudit } from "@/lib/leaveDb";
import { LEAVE_TYPES, computeDays, genRequestId, isHalf } from "@/lib/leaveShared";
import { sendMail, leaveEmailHtml } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    return NextResponse.json({ requests: await listLeavesByUser(s.username) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    if (s.must_change) return NextResponse.json({ error: "Please change your password first" }, { status: 403 });
    const body = await req.json();

    const leave_type = String(body.leave_type || "");
    if (!LEAVE_TYPES.includes(leave_type as any)) return NextResponse.json({ error: "Pick a valid leave type" }, { status: 400 });

    const start_date = String(body.start_date || "").slice(0, 10);
    if (!start_date) return NextResponse.json({ error: "Start date is required" }, { status: 400 });
    const day_part = ["full", "half-am", "half-pm"].includes(body.day_part) ? body.day_part : "full";
    let end_date = String(body.end_date || start_date).slice(0, 10);
    if (isHalf(day_part) || end_date < start_date) end_date = start_date;

    const reason = String(body.reason || "").trim();
    if (!reason) return NextResponse.json({ error: "Reason is required" }, { status: 400 });

    // double-booking guard
    const overlap = await ownLeavesOverlapping(s.username, start_date, end_date);
    if (overlap.length) {
      return NextResponse.json({ error: `You already have leave on those dates (${overlap[0].request_id}).` }, { status: 409 });
    }

    let request_id = String(body.request_id || "").trim() || genRequestId();
    if (await leaveIdExists(request_id)) return NextResponse.json({ error: `Request ID '${request_id}' already exists. Choose another.` }, { status: 409 });

    const rec = {
      request_id, username: s.username, display_name: s.name, leave_type, start_date, end_date,
      day_part, days: String(computeDays(start_date, end_date, day_part)), reason,
      status: "submitted", created_at: new Date().toISOString(),
    };
    await insertLeave(rec);
    await insertAudit(s.username, "leave_create", request_id, `${leave_type} ${start_date}`);

    const recipients = (await getConfig("notify_emails")).split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    const mail = await sendMail(recipients, `Leave: ${s.name} — ${leave_type} (${start_date})`, leaveEmailHtml(rec));
    return NextResponse.json({ request_id, mail });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
