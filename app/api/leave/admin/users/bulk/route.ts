import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword, passwordError } from "@/lib/leaveAuth";
import { createUser, userExists, ensureSchema, insertAudit } from "@/lib/leaveDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Bulk-create users. Body: { rows: [{ username, display_name, email, password, role }] }
export async function POST(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s || s.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    await ensureSchema();
    const { rows } = await req.json();
    if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: "No rows provided" }, { status: 400 });

    const results: { username: string; ok: boolean; error?: string }[] = [];
    let added = 0;
    for (const raw of rows.slice(0, 500)) {
      const username = String(raw.username || "").trim().toLowerCase();
      try {
        if (!/^[a-z0-9._-]{3,}$/.test(username)) throw new Error("invalid username");
        const pe = passwordError(String(raw.password || ""));
        if (pe) throw new Error("weak/empty password");
        if (await userExists(username)) throw new Error("already exists");
        await createUser({
          username,
          display_name: String(raw.display_name || username).trim(),
          email: String(raw.email || "").trim(),
          passwordHash: await hashPassword(String(raw.password)),
          role: raw.role === "admin" ? "admin" : "employee",
          must_change: true,
        });
        results.push({ username, ok: true }); added += 1;
      } catch (e: any) {
        results.push({ username: username || "(blank)", ok: false, error: e?.message || String(e) });
      }
    }
    await insertAudit(s.username, "user_bulk_import", `${added}/${rows.length}`, "");
    return NextResponse.json({ added, total: rows.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
