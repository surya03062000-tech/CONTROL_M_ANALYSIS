import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/leaveAuth";
import { listLeavesByMonth } from "@/lib/leaveDb";
import { dayPartLabel } from "@/lib/leaveShared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csv(v: string) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }

// Export a month's leave as CSV (opens in Excel).
export async function GET(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s || s.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    const now = new Date();
    const month = req.nextUrl.searchParams.get("month") || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const leaves = await listLeavesByMonth(month);

    const header = ["Employee", "Username", "Type", "Start", "End", "Duration", "Days", "Reason", "Request ID"];
    const rows = leaves.map((l) =>
      [l.display_name, l.username, l.leave_type, l.start_date, l.end_date, dayPartLabel(l.day_part), l.days, l.reason, l.request_id].map(csv).join(",")
    );
    const body = [header.map(csv).join(","), ...rows].join("\r\n");

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leave-${month}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
