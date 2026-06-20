import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/leaveAuth";
import { getConfig, setConfig, ensureSchema } from "@/lib/leaveDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireAdmin(req: NextRequest) {
  const s = await getSession(req);
  return s && s.role === "admin" ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    return NextResponse.json({ emails: await getConfig("notify_emails") });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    await ensureSchema();
    const { emails } = await req.json();
    await setConfig("notify_emails", String(emails || "").trim());
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
