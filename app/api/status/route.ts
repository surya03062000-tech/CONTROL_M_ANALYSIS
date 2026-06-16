import { NextRequest, NextResponse } from "next/server";
import { getRun, getRunOutput } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TERMINAL = new Set(["TERMINATED", "SKIPPED", "INTERNAL_ERROR"]);

// The notebook now exits with a JSON payload (output path + Mermaid diagram + flow
// summary). Older notebooks exit with the bare path string — handle both.
interface Flow {
  output_path?: string;
  xml_filename?: string;
  input_mode?: string;
  direction?: string;
  folder_filter?: string;
  input_jobs?: string[];
  jobs?: number;
  containers?: number;
  nodes?: number;
  edges?: number;
  omitted?: number;
  llm_calls?: number;
  mermaid?: string;
  mermaid_url?: string;
}

function parseExit(raw: string): { outputPath: string | null; flow: Flow | null } {
  const s = (raw || "").trim();
  if (!s) return { outputPath: null, flow: null };
  if (s.startsWith("{")) {
    try {
      const obj = JSON.parse(s) as Flow;
      return { outputPath: obj.output_path || null, flow: obj };
    } catch {
      /* fall through to treat as a plain path */
    }
  }
  return { outputPath: s, flow: null };
}

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
    let flow: Flow | null = null;

    if (TERMINAL.has(life) && result === "SUCCESS") {
      // get-output needs the *task* run id; fall back to the job run id for single-task runs.
      const taskRunId = run.tasks?.[0]?.run_id ?? runId;
      try {
        const out = await getRunOutput(taskRunId);
        const parsed = parseExit(out.result || "");
        outputPath = parsed.outputPath;
        flow = parsed.flow;
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
      flow,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
