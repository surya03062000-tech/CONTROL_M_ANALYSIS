import { NextRequest, NextResponse } from "next/server";
import { cancelRun } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function gate(req: NextRequest): boolean {
  const pw = process.env.APP_PASSWORD || "";
  if (!pw) return true;
  return req.headers.get("x-app-password") === pw;
}

export async function POST(req: NextRequest) {
  try {
    if (!gate(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const runId = body?.runId;
    if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
    await cancelRun(runId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
