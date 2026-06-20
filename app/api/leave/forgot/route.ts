import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getUserWithHash } from "@/lib/leaveDb";
import { createResetToken } from "@/lib/leaveAuth";
import { sendMail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Email-based password reset request. Always returns ok (don't reveal whether a
// user/email exists). Only actually emails if the user has an address + Resend is set.
export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json();
    const key = String(username || "").trim().toLowerCase();
    if (!key) return NextResponse.json({ ok: true });
    await ensureSchema();
    const u = await getUserWithHash(key);
    if (u && u.email && u.active !== "false") {
      const token = await createResetToken(u.username);
      const link = `${req.nextUrl.origin}/leave/reset?token=${encodeURIComponent(token)}`;
      await sendMail([u.email], "Reset your Leave portal password",
        `<p>Hello ${u.display_name || u.username},</p>
         <p>Click the link below to reset your Leave portal password (valid 30 minutes):</p>
         <p><a href="${link}">${link}</a></p>
         <p>If you didn't request this, ignore this email.</p>`);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
