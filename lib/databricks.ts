// Minimal Databricks REST client used by the API routes (runs server-side only).
// The token lives in env vars and is never exposed to the browser.

// Sanitise env values: strip surrounding whitespace/newlines and accidental quotes,
// and a stray "Bearer " prefix. Pasting a token into a dashboard often appends a
// trailing newline or wraps it in quotes — Databricks then returns 403
// "Invalid access token", so we defend against that here.
function clean(v: string | undefined): string {
  return (v || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

const HOST = clean(process.env.DATABRICKS_HOST).replace(/\/+$/, "");
const TOKEN = clean(process.env.DATABRICKS_TOKEN);
const JOB_ID = clean(process.env.DATABRICKS_JOB_ID);
const OUTPUT_VOLUME = clean(process.env.OUTPUT_VOLUME).replace(/\/+$/, "");
// Volume folder the notebook reads its XML from (CONFIG["xml_folder"]). Uploads land here.
// Falls back to OUTPUT_VOLUME so a single-folder setup still works out of the box.
const INPUT_VOLUME = (clean(process.env.INPUT_VOLUME) || clean(process.env.OUTPUT_VOLUME)).replace(/\/+$/, "");

export function getInputVolume(): string {
  return INPUT_VOLUME;
}

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

// Cancel a running job run.
export async function cancelRun(runId: number | string): Promise<void> {
  assertConfig();
  const res = await dbx(`/api/2.1/jobs/runs/cancel`, {
    method: "POST",
    body: JSON.stringify({ run_id: Number(runId) }),
  });
  if (!res.ok) throw new Error(`runs/cancel failed (${res.status}): ${await res.text()}`);
}

export interface OutputFile { path: string; name: string; size: number; modified: number; }

// List recent .xlsx files in the output Volume (newest first) — powers the run history.
export async function listOutputs(): Promise<OutputFile[]> {
  assertConfig();
  if (!OUTPUT_VOLUME) return [];
  const res = await dbx(`/api/2.0/fs/directories${encodePath(OUTPUT_VOLUME)}`, { method: "GET" });
  if (!res.ok) return [];
  const j = await res.json();
  const entries: any[] = j?.contents || [];
  return entries
    .filter((e) => !e.is_directory && String(e.path).toLowerCase().endsWith(".xlsx"))
    .map((e) => ({
      path: e.path as string,
      name: String(e.path).split("/").pop() as string,
      size: Number(e.file_size ?? 0),
      modified: Number(e.last_modified ?? 0),
    }))
    .sort((a, b) => b.modified - a.modified);
}

// Stream a single file from the Volume via the Files API.
export async function downloadFile(absPath: string): Promise<Response> {
  assertConfig();
  return dbx(`/api/2.0/fs/files${encodePath(absPath)}`, { method: "GET" });
}

// Upload (PUT) a file straight into the input Volume via the Files API.
// The notebook then reads it by filename — no manual copy into the workspace needed.
export async function uploadFile(
  filename: string,
  data: Buffer | Uint8Array
): Promise<{ path: string }> {
  assertConfig();
  if (!INPUT_VOLUME) {
    throw new Error("INPUT_VOLUME (or OUTPUT_VOLUME) is not configured — cannot upload.");
  }
  // Strip any path components a browser might send; keep it a plain filename.
  const safeName = filename.replace(/^.*[\\/]/, "").trim();
  if (!safeName) throw new Error("Invalid filename.");
  const absPath = `${INPUT_VOLUME}/${safeName}`;
  const res = await dbx(`/api/2.0/fs/files${encodePath(absPath)}?overwrite=true`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: data,
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403 || /invalid access token/i.test(text)) {
      throw new Error(
        `Databricks rejected the token (${res.status}). The same DATABRICKS_TOKEN is used for ` +
          `Run/Status/Download, so this is an auth problem, not the upload path. Generate a fresh ` +
          `PAT and re-set DATABRICKS_TOKEN/DATABRICKS_HOST (no quotes or trailing spaces), then ` +
          `redeploy. Also confirm the token has write on ${INPUT_VOLUME}. — ${text}`
      );
    }
    throw new Error(`upload failed (${res.status}): ${text}`);
  }
  return { path: absPath };
}
