import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword, passwordError } from "@/lib/leaveAuth";
import { getUserWithHash, deleteUser, setPassword, setActive, setRole, updateUserProfile, countActiveAdmins, insertAudit } from "@/lib/leaveDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function admin(req: NextRequest) {
  const s = await getSession(req);
  return s && s.role === "admin" ? s : null;
}

export async function DELETE(req: NextRequest, { params }: { params: { username: string } }) {
  try {
    const s = await admin(req);
    if (!s) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    const target = decodeURIComponent(params.username);
    if (target === s.username) return NextResponse.json({ error: "You can't remove your own account." }, { status: 400 });
    const u = await getUserWithHash(target);
    if (u?.role === "admin" && (await countActiveAdmins()) <= 1) {
      return NextResponse.json({ error: "Can't remove the last admin." }, { status: 400 });
    }
    await deleteUser(target);
    await insertAudit(s.username, "user_delete", target, "");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { username: string } }) {
  try {
    const s = await admin(req);
    if (!s) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    const target = decodeURIComponent(params.username);
    const u = await getUserWithHash(target);
    if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const body = await req.json();
    const action = body.action;

    if (action === "reset") {
      const pe = passwordError(String(body.password || ""));
      if (pe) return NextResponse.json({ error: pe }, { status: 400 });
      await setPassword(target, await hashPassword(String(body.password)), true); // force change on next login
      await insertAudit(s.username, "user_reset", target, "");
    } else if (action === "profile") {
      await updateUserProfile(target, String(body.display_name || u.display_name).trim(), String(body.email ?? u.email).trim());
      await insertAudit(s.username, "user_update", target, "");
    } else if (action === "active") {
      const active = !!body.active;
      if (!active && u.role === "admin" && (await countActiveAdmins()) <= 1) {
        return NextResponse.json({ error: "Can't deactivate the last admin." }, { status: 400 });
      }
      if (!active && target === s.username) return NextResponse.json({ error: "You can't deactivate yourself." }, { status: 400 });
      await setActive(target, active);
      await insertAudit(s.username, active ? "user_activate" : "user_deactivate", target, "");
    } else if (action === "role") {
      const role = body.role === "admin" ? "admin" : "employee";
      if (role === "employee" && u.role === "admin" && (await countActiveAdmins()) <= 1) {
        return NextResponse.json({ error: "Can't demote the last admin." }, { status: 400 });
      }
      await setRole(target, role);
      await insertAudit(s.username, "user_role", target, role);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
