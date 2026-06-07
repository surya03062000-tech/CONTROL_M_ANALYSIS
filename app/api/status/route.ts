import { NextRequest, NextResponse } from "next/server";
import { getRun, getRunOutput } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TERMINAL = new Set(["TERMINATED", "SKIPPED", "INTERNAL_ERROR"]);

export async function GET(req: NextRequest) {
  try {
    const runId = req.nextUrl.searchParams.get("runId");
    if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

    const run = await getRun(runId);
    const life = run.state?.life_cycle_state || "PENDING";
    const result = run.state?.result_state || "";
    const message = run.state?.state_message || "";
    const runPageUrl = run.run_page_url || "";

    let outputPath: string | null = null;
    let outputError: string | null = null;

    if (TERMINAL.has(life) && result === "SUCCESS") {
      // get-output needs the *task* run id; fall back to the job run id for single-task runs.
      const taskRunId = run.tasks?.[0]?.run_id ?? runId;
      try {
        const out = await getRunOutput(taskRunId);
        outputPath = out.result || null;
      } catch (e: any) {
        outputError = e?.message || String(e);
      }
    }

    return NextResponse.json({
      life_cycle_state: life,
      result_state: result,
      message,
      runPageUrl,
      done: TERMINAL.has(life),
      success: result === "SUCCESS",
      outputPath,
      outputError,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
