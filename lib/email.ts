// Best-effort email via Resend. If RESEND_API_KEY isn't set, it no-ops and reports
// why — leave submission still succeeds regardless.
export async function sendMail(
  to: string[], subject: string, html: string
): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LEAVE_FROM_EMAIL || "Leave Tracker <onboarding@resend.dev>";
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" };
  if (!to.length) return { sent: false, reason: "no recipients configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) return { sent: false, reason: `Resend ${res.status}: ${await res.text()}` };
    return { sent: true };
  } catch (e: any) {
    return { sent: false, reason: e?.message || String(e) };
  }
}

export function leaveEmailHtml(r: {
  display_name: string; leave_type: string; start_date: string; end_date: string;
  day_part: string; days: string; reason: string; request_id: string;
}): string {
  const range = r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`;
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px">
    <h2 style="color:#DA291C;margin:0 0 4px">Leave notification</h2>
    <p style="color:#444;margin:0 0 16px">A team member has recorded leave.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      ${row("Employee", r.display_name)}
      ${row("Type", r.leave_type)}
      ${row("Date(s)", range)}
      ${row("Duration", `${r.day_part === "half" ? "Half day" : "Full day"} (${r.days} day${r.days === "1" ? "" : "s"})`)}
      ${row("Reason", r.reason || "—")}
      ${row("Request ID", r.request_id)}
    </table>
  </div>`;
}
function row(k: string, v: string): string {
  return `<tr>
    <td style="padding:8px 10px;border:1px solid #eee;background:#fafafa;font-weight:600;width:140px">${k}</td>
    <td style="padding:8px 10px;border:1px solid #eee">${escapeHtml(v)}</td>
  </tr>`;
}
function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
