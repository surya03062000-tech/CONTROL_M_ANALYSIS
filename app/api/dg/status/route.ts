import { NextRequest, NextResponse } from "next/server";
import { getRun, getRunOutput } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TERMINAL = new Set(["TERMINATED", "SKIPPED", "INTERNAL_ERROR"]);

function parseExit(raw: string): { outputPath: string | null; details: any | null } {
  const s = (raw || "").trim();
  if (!s) return { outputPath: null, details: null };
  if (s.startsWith("{")) { try { const o = JSON.parse(s); return { outputPath: o.output_path || o.path || null, details: o }; } catch {} }
  return { outputPath: s, details: null };
}

export async function GET(req: NextRequest) {
  try {
    const runId = req.nextUrl.searchParams.get("runId");
    if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

    const run = await getRun(runId);
    const life = run.state?.life_cycle_state || "PENDING";
    const result = run.state?.result_state || "";
    const message = run.state?.state_message || "";
    let outputPath: string | null = null;
    let details: any = null;
    let outputError: string | null = null;

    if (TERMINAL.has(life) && result === "SUCCESS") {
      const taskRunId = run.tasks?.[0]?.run_id ?? runId;
      try { const out = await getRunOutput(taskRunId); const p = parseExit(out.result || ""); outputPath = p.outputPath; details = p.details; }
      catch (e: any) { outputError = e?.message || String(e); }
    }

    return NextResponse.json({
      life_cycle_state: life, result_state: result, message, runPageUrl: run.run_page_url || "",
      done: TERMINAL.has(life), success: result === "SUCCESS", outputPath, details, outputError,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
