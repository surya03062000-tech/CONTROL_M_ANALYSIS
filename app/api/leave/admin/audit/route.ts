import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/leaveAuth";
import { listAudit } from "@/lib/leaveDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const s = await getSession(req);
    if (!s || s.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    return NextResponse.json({ audit: await listAudit(150) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
