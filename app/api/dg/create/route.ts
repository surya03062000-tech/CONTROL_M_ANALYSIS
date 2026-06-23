import { NextRequest, NextResponse } from "next/server";
import { runJob } from "@/lib/databricks";
import { DG_CATALOG } from "@/lib/dg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DG_CREATION_JOB_ID = (process.env.DG_CREATION_JOB_ID || "").trim();

function gate(req: NextRequest): boolean {
  const pw = process.env.APP_PASSWORD || "";
  return !pw || req.headers.get("x-app-password") === pw;
}

// Trigger the DG Document Creation job (catalog fixed to edl_qa).
export async function POST(req: NextRequest) {
  try {
    if (!gate(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!DG_CREATION_JOB_ID) return NextResponse.json({ error: "DG_CREATION_JOB_ID is not configured." }, { status: 500 });
    const body = await req.json();

    const schemas = String(body.schemas || "").trim();
    const tables = String(body.tables || "").trim();
    const description = String(body.description || "").trim();
    if (!schemas) return NextResponse.json({ error: "Select at least one schema." }, { status: 400 });
    if (!tables) return NextResponse.json({ error: "Select at least one table." }, { status: 400 });
    if (!description) return NextResponse.json({ error: "Business description is required." }, { status: 400 });

    const { run_id } = await runJob(DG_CREATION_JOB_ID, {
      CATALOG: DG_CATALOG,
      SCHEMA: schemas,
      TABLE_NAME: tables,
      TABLE_DESCRIPTION: description,
    });
    return NextResponse.json({ run_id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
