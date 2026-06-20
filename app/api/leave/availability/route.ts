import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/leaveAuth";
import { listLeavesByMonth, listHolidays } from "@/lib/leaveDb";
import { expandDates } from "@/lib/leaveShared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Aggregate counts of people on leave per date (no names) + holidays — used by the
// employee calendar + overlap warning. Any signed-in user can read it.
export async function GET(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const now = new Date();
    const month = req.nextUrl.searchParams.get("month") || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const leaves = await listLeavesByMonth(month);
    const counts: Record<string, number> = {};
    for (const l of leaves) for (const d of expandDates(l.start_date, l.end_date)) {
      if (d.startsWith(month)) counts[d] = (counts[d] || 0) + 1;
    }
    let holidays: { holiday_date: string; name: string }[] = [];
    try { holidays = await listHolidays(); } catch {}
    return NextResponse.json({ month, counts, holidays });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
