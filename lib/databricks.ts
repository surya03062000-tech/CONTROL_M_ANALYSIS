// Minimal Databricks REST client used by the API routes (runs server-side only).
// The token lives in env vars and is never exposed to the browser.

const HOST = (process.env.DATABRICKS_HOST || "").replace(/\/+$/, "");
const TOKEN = process.env.DATABRICKS_TOKEN || "";
const JOB_ID = process.env.DATABRICKS_JOB_ID || "";
const OUTPUT_VOLUME = (process.env.OUTPUT_VOLUME || "").replace(/\/+$/, "");

export function assertConfig() {
  const missing: string[] = [];
  if (!HOST) missing.push("DATABRICKS_HOST");
  if (!TOKEN) missing.push("DATABRICKS_TOKEN");
  if (!JOB_ID) missing.push("DATABRICKS_JOB_ID");
  if (missing.length) {
    throw new Error(`Missing env var(s): ${missing.join(", ")}. Copy .env.example → .env.local and fill them in.`);
  }
}

async function dbx(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${HOST}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
}

// Encode an absolute Volume/DBFS path for the Files API (keeps "/", encodes spaces/parens).
export function encodePath(absPath: string): string {
  return absPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

export type NotebookParams = Record<string, string>;

export async function runNow(notebook_params: NotebookParams): Promise<{ run_id: number }> {
  assertConfig();
  const res = await dbx("/api/2.1/jobs/run-now", {
    method: "POST",
    body: JSON.stringify({ job_id: Number(JOB_ID), notebook_params }),
  });
  if (!res.ok) throw new Error(`run-now failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export interface RunState {
  life_cycle_state?: string; // PENDING | RUNNING | TERMINATING | TERMINATED | SKIPPED | INTERNAL_ERROR | BLOCKED | QUEUED
  result_state?: string; // SUCCESS | FAILED | TIMEDOUT | CANCELED
  state_message?: string;
}

export interface RunGet {
  state?: RunState;
  run_page_url?: string;
  start_time?: number;
  end_time?: number;
  tasks?: Array<{ run_id: number; task_key: string; state?: RunState }>;
}

export async function getRun(runId: number | string): Promise<RunGet> {
  assertConfig();
  const res = await dbx(`/api/2.1/jobs/runs/get?run_id=${runId}`, { method: "GET" });
  if (!res.ok) throw new Error(`runs/get failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function getRunOutput(taskRunId: number | string): Promise<{ result?: string; error?: string }> {
  assertConfig();
  const res = await dbx(`/api/2.1/jobs/runs/get-output?run_id=${taskRunId}`, { method: "GET" });
  if (!res.ok) throw new Error(`runs/get-output failed (${res.status}): ${await res.text()}`);
  const j = await res.json();
  return { result: j?.notebook_output?.result, error: j?.error };
}

// List recent .xlsx files in the output Volume (fallback if the exit value is unavailable).
export async function listOutputs(): Promise<Array<{ path: string; name: string }>> {
  assertConfig();
  if (!OUTPUT_VOLUME) return [];
  const res = await dbx(`/api/2.0/fs/directories${encodePath(OUTPUT_VOLUME)}`, { method: "GET" });
  if (!res.ok) return [];
  const j = await res.json();
  const entries: any[] = j?.contents || [];
  return entries
    .filter((e) => !e.is_directory && String(e.path).toLowerCase().endsWith(".xlsx"))
    .map((e) => ({ path: e.path as string, name: String(e.path).split("/").pop() as string }));
}

// Stream a single file from the Volume via the Files API.
export async function downloadFile(absPath: string): Promise<Response> {
  assertConfig();
  return dbx(`/api/2.0/fs/files${encodePath(absPath)}`, { method: "GET" });
}
