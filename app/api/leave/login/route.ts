import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getUserWithHash, insertAudit } from "@/lib/leaveDb";
import { createToken, verifyPassword, SESSION_COOKIE, cookieOptions } from "@/lib/leaveAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Best-effort in-memory rate limiting (per serverless instance).
const attempts = new Map<string, { n: number; until: number }>();
function blocked(key: string): number {
  const a = attempts.get(key);
  if (a && a.until > Date.now()) return Math.ceil((a.until - Date.now()) / 1000);
  return 0;
}
function fail(key: string) {
  const a = attempts.get(key) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= 5) { a.until = Date.now() + 60_000; a.n = 0; }
  attempts.set(key, a);
}

export async function POST(req: NextRequest) {
  try {
    const { username, password, as } = await req.json();
    if (!username || !password) return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    const key = String(username).trim().toLowerCase();

    const wait = blocked(key);
    if (wait) return NextResponse.json({ error: `Too many attempts. Try again in ${wait}s.` }, { status: 429 });

    await ensureSchema();
    const u = await getUserWithHash(key);
    if (!u || u.active === "false" || !(await verifyPassword(String(password), u.password_hash))) {
      fail(key);
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }
    if (as === "admin" && u.role !== "admin") {
      return NextResponse.json({ error: "This is not an admin account" }, { status: 403 });
    }
    attempts.delete(key);

    const token = await createToken({
      username: u.username, role: u.role as any, name: u.display_name || u.username,
      must_change: u.must_change === "true",
    });
    await insertAudit(u.username, "login", u.username, "");
    const res = NextResponse.json({ username: u.username, role: u.role, name: u.display_name || u.username, must_change: u.must_change === "true" });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions());
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
