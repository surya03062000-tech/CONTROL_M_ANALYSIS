import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/leaveAuth";
import { listLeavesByMonth, getConfig, insertAudit } from "@/lib/leaveDb";
import { dayPartLabel, rangeLabel, LEAVE_TYPES } from "@/lib/leaveShared";
import { sendMail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Manually email the month's leave digest to the configured recipients.
export async function POST(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s || s.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    const now = new Date();
    const month = req.nextUrl.searchParams.get("month") || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const leaves = await listLeavesByMonth(month);
    const recipients = (await getConfig("notify_emails")).split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

    const counts = LEAVE_TYPES.map((t) => `${t}: ${leaves.filter((l) => l.leave_type === t).length}`).join(" · ");
    const rows = leaves.map((l) =>
      `<tr><td style="padding:6px 10px;border:1px solid #eee">${l.display_name}</td>
       <td style="padding:6px 10px;border:1px solid #eee">${l.leave_type}</td>
       <td style="padding:6px 10px;border:1px solid #eee">${rangeLabel(l.start_date, l.end_date)}</td>
       <td style="padding:6px 10px;border:1px solid #eee">${dayPartLabel(l.day_part)}</td></tr>`
    ).join("");
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif">
      <h2 style="color:#DA291C">Leave summary — ${month}</h2>
      <p>${leaves.length} record(s). ${counts}.</p>
      <table style="border-collapse:collapse;font-size:13px"><tr>
        <th style="padding:6px 10px;border:1px solid #eee;text-align:left">Employee</th>
        <th style="padding:6px 10px;border:1px solid #eee;text-align:left">Type</th>
        <th style="padding:6px 10px;border:1px solid #eee;text-align:left">Date(s)</th>
        <th style="padding:6px 10px;border:1px solid #eee;text-align:left">Duration</th></tr>${rows}</table></div>`;

    const mail = await sendMail(recipients, `Leave summary — ${month}`, html);
    await insertAudit(s.username, "summary_email", month, mail.sent ? "sent" : (mail.reason || "not sent"));
    return NextResponse.json({ mail, count: leaves.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
