import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getUserWithHash } from "@/lib/leaveDb";
import { createToken, verifyPassword, SESSION_COOKIE, cookieOptions } from "@/lib/leaveAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { username, password, as } = await req.json();
    if (!username || !password) return NextResponse.json({ error: "Username and password required" }, { status: 400 });

    await ensureSchema();
    const u = await getUserWithHash(String(username).trim());
    if (!u || u.active === "false" || !(await verifyPassword(String(password), u.password_hash))) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }
    if (as === "admin" && u.role !== "admin") {
      return NextResponse.json({ error: "This is not an admin account" }, { status: 403 });
    }

    const token = await createToken({ username: u.username, role: u.role as any, name: u.display_name || u.username });
    const res = NextResponse.json({ username: u.username, role: u.role, name: u.display_name || u.username });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions());
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
