import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/leaveAuth";
import { listLeavesByUser } from "@/lib/leaveDb";
import { dayPartLabel } from "@/lib/leaveShared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function d(s: string) { return s.replace(/-/g, ""); }
function plusDay(s: string) { const t = new Date(s + "T00:00:00"); t.setDate(t.getDate() + 1); return t.toISOString().slice(0, 10); }

// Download the signed-in user's leave as an .ics calendar (Outlook/Google).
export async function GET(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const leaves = await listLeavesByUser(s.username);

    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rogers//Leave//EN", "CALSCALE:GREGORIAN"];
    for (const l of leaves) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${l.request_id}@rogers-leave`);
      lines.push(`SUMMARY:Leave — ${l.leave_type} (${dayPartLabel(l.day_part)})`);
      lines.push(`DTSTART;VALUE=DATE:${d(l.start_date)}`);
      lines.push(`DTEND;VALUE=DATE:${d(plusDay(l.end_date))}`); // DTEND is exclusive
      lines.push(`DESCRIPTION:${(l.reason || "").replace(/\n/g, " ")}`);
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");

    return new NextResponse(lines.join("\r\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="my-leave.ics"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
