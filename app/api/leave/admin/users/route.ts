import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword, passwordError } from "@/lib/leaveAuth";
import { listUsers, createUser, userExists, ensureSchema, insertAudit } from "@/lib/leaveDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function admin(req: NextRequest) {
  const s = await getSession(req);
  return s && s.role === "admin" ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    if (!(await admin(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    return NextResponse.json({ users: await listUsers() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await admin(req);
    if (!s) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    await ensureSchema();
    const { username, display_name, email, password, role } = await req.json();
    const u = String(username || "").trim().toLowerCase();
    const r = role === "admin" ? "admin" : "employee";
    if (!u) return NextResponse.json({ error: "Username is required" }, { status: 400 });
    if (!/^[a-z0-9._-]{3,}$/.test(u)) return NextResponse.json({ error: "Username: min 3 chars, letters/numbers/._-" }, { status: 400 });
    const pe = passwordError(String(password || ""));
    if (pe) return NextResponse.json({ error: pe }, { status: 400 });
    if (await userExists(u)) return NextResponse.json({ error: "Username already exists" }, { status: 409 });

    await createUser({
      username: u, display_name: String(display_name || u).trim(), email: String(email || "").trim(),
      passwordHash: await hashPassword(String(password)), role: r, must_change: true,
    });
    await insertAudit(s.username, "user_create", u, r);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
