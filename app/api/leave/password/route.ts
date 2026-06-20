import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword, verifyPassword, passwordError, createToken, SESSION_COOKIE, cookieOptions } from "@/lib/leaveAuth";
import { getUserWithHash, setPassword, insertAudit } from "@/lib/leaveDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Logged-in user changes their own password (also clears a forced-change flag).
export async function POST(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { oldPassword, newPassword } = await req.json();
    const pe = passwordError(String(newPassword || ""));
    if (pe) return NextResponse.json({ error: pe }, { status: 400 });
    const u = await getUserWithHash(s.username);
    if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!(await verifyPassword(String(oldPassword || ""), u.password_hash))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
    await setPassword(s.username, await hashPassword(String(newPassword)), false);
    await insertAudit(s.username, "password_change", s.username, "");

    // re-issue the session without the must_change flag
    const token = await createToken({ username: s.username, role: s.role, name: s.name, must_change: false });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions());
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
