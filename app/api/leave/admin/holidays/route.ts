import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/leaveAuth";
import { listHolidays, addHoliday, deleteHoliday, ensureSchema, insertAudit } from "@/lib/leaveDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function admin(req: NextRequest) {
  const s = await getSession(req);
  return s && s.role === "admin" ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    if (!(await admin(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    return NextResponse.json({ holidays: await listHolidays() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await admin(req);
    if (!s) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    await ensureSchema();
    const { date, name } = await req.json();
    const d = String(date || "").slice(0, 10);
    if (!d) return NextResponse.json({ error: "Date is required" }, { status: 400 });
    await addHoliday(d, String(name || "Holiday").trim());
    await insertAudit(s.username, "holiday_add", d, String(name || ""));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const s = await admin(req);
    if (!s) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    const date = req.nextUrl.searchParams.get("date") || "";
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
    await deleteHoliday(date);
    await insertAudit(s.username, "holiday_delete", date, "");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
