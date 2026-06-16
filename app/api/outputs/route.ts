import { NextRequest, NextResponse } from "next/server";
import { listOutputs } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function gate(req: NextRequest): boolean {
  const pw = process.env.APP_PASSWORD || "";
  if (!pw) return true;
  return req.headers.get("x-app-password") === pw;
}

// Lists recent .xlsx outputs in the Volume (newest first) for the run-history panel.
export async function GET(req: NextRequest) {
  try {
    if (!gate(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const files = await listOutputs();
    return NextResponse.json({ files: files.slice(0, 15) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
