import { NextRequest, NextResponse } from "next/server";
import { verifyResetToken, hashPassword, passwordError } from "@/lib/leaveAuth";
import { setPassword, insertAudit } from "@/lib/leaveDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json();
    const username = await verifyResetToken(String(token || ""));
    if (!username) return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
    const pe = passwordError(String(newPassword || ""));
    if (pe) return NextResponse.json({ error: pe }, { status: 400 });
    await setPassword(username, await hashPassword(String(newPassword)), false);
    await insertAudit(username, "password_reset_self", username, "");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
