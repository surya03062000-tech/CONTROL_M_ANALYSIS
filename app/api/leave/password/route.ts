import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword, verifyPassword } from "@/lib/leaveAuth";
import { getUserWithHash, setPassword } from "@/lib/leaveDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Logged-in user changes their own password.
export async function POST(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { oldPassword, newPassword } = await req.json();
    if (!newPassword || String(newPassword).length < 4) {
      return NextResponse.json({ error: "New password must be at least 4 characters" }, { status: 400 });
    }
    const u = await getUserWithHash(s.username);
    if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!(await verifyPassword(String(oldPassword || ""), u.password_hash))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
    await setPassword(s.username, await hashPassword(String(newPassword)));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
