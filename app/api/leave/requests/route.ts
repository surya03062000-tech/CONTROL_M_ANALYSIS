import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/leaveAuth";
import { insertLeave, listLeavesByUser, getConfig, LEAVE_TYPES } from "@/lib/leaveDb";
import { sendMail, leaveEmailHtml } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const requests = await listLeavesByUser(s.username);
    return NextResponse.json({ requests });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

function genId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `LR-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
function dayCount(start: string, end: string, dayPart: string): number {
  if (dayPart === "half") return 0.5;
  const s = new Date(start), e = new Date(end || start);
  const d = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  return d > 0 ? d : 1;
}

export async function POST(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const body = await req.json();

    const leave_type = String(body.leave_type || "");
    if (!LEAVE_TYPES.includes(leave_type as any)) {
      return NextResponse.json({ error: "Pick a valid leave type" }, { status: 400 });
    }
    const start_date = String(body.start_date || "").slice(0, 10);
    if (!start_date) return NextResponse.json({ error: "Start date is required" }, { status: 400 });
    const day_part = body.day_part === "half" ? "half" : "full";
    let end_date = String(body.end_date || start_date).slice(0, 10);
    if (day_part === "half" || end_date < start_date) end_date = start_date;
    const reason = String(body.reason || "").trim();
    if (!reason) return NextResponse.json({ error: "Reason is required" }, { status: 400 });

    const request_id = String(body.request_id || "").trim() || genId();
    const rec = {
      request_id, username: s.username, display_name: s.name, leave_type,
      start_date, end_date, day_part, days: String(dayCount(start_date, end_date, day_part)),
      reason, status: "submitted", created_at: new Date().toISOString(),
    };
    await insertLeave(rec);

    // Best-effort notify the admin-configured recipients.
    const recipients = (await getConfig("notify_emails")).split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    const mail = await sendMail(recipients, `Leave: ${s.name} — ${leave_type} (${start_date})`, leaveEmailHtml(rec));

    return NextResponse.json({ request_id, mail });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
