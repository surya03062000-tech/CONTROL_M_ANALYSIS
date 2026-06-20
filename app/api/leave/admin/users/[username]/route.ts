import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/leaveAuth";
import { deleteUser, setPassword } from "@/lib/leaveDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireAdmin(req: NextRequest) {
  const s = await getSession(req);
  return s && s.role === "admin" ? s : null;
}

// Remove an employee.
export async function DELETE(req: NextRequest, { params }: { params: { username: string } }) {
  try {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    await deleteUser(decodeURIComponent(params.username));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

// Reset an employee's password.
export async function PATCH(req: NextRequest, { params }: { params: { username: string } }) {
  try {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    const { password } = await req.json();
    if (!password || String(password).length < 4) {
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
    }
    await setPassword(decodeURIComponent(params.username), await hashPassword(String(password)));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
