import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/leaveAuth";
import { listEmployees, createEmployee, userExists, ensureSchema } from "@/lib/leaveDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireAdmin(req: NextRequest) {
  const s = await getSession(req);
  if (!s || s.role !== "admin") return null;
  return s;
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    return NextResponse.json({ users: await listEmployees() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    await ensureSchema();
    const { username, display_name, email, password } = await req.json();
    const u = String(username || "").trim().toLowerCase();
    if (!u || !password) return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    if (!/^[a-z0-9._-]{3,}$/.test(u)) return NextResponse.json({ error: "Username: min 3 chars, letters/numbers/._-" }, { status: 400 });
    if (await userExists(u)) return NextResponse.json({ error: "Username already exists" }, { status: 409 });

    await createEmployee({
      username: u,
      display_name: String(display_name || u).trim(),
      email: String(email || "").trim(),
      passwordHash: await hashPassword(String(password)),
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
