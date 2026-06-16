"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const MermaidDiagram = dynamic(() => import("./MermaidDiagram"), { ssr: false });

type Mode = "job_name" | "table_name" | "folder_name";
type Phase = "idle" | "submitting" | "running" | "success" | "error";

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

interface StatusResp {
  life_cycle_state?: string;
  result_state?: string;
  message?: string;
  runPageUrl?: string;
  done?: boolean;
  success?: boolean;
  outputPath?: string | null;
  outputError?: string | null;
  flow?: Flow | null;
  error?: string;
}

export default function Page() {
  // ── form state ────────────────────────────────────────────────────────────
  const [xmlFilename, setXmlFilename] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [inputMode, setInputMode] = useState<Mode>("job_name");
  const [jobNames, setJobNames] = useState("");
  const [tableNames, setTableNames] = useState("");
  const [tableMatchMode, setTableMatchMode] = useState("exact");
  const [direction, setDirection] = useState("predecessor");
  const [password, setPassword] = useState("");

  // ── upload state ────────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadErr, setUploadErr] = useState("");

  // ── run state ───────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function upload() {
    if (!file) return;
    setUploadErr(""); setUploadMsg(""); setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-app-password": password },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setXmlFilename(data.filename || "");
      setUploadMsg(`Uploaded to ${data.path} (${fmtBytes(data.size)})`);
    } catch (e: any) {
      setUploadErr(e?.message || String(e));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setError(""); setStatus(null); setRunId(null); setPhase("submitting");
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-password": password },
        body: JSON.stringify({
          xmlFilename, folderFilter, inputMode, jobNames, tableNames,
          tableMatchMode, direction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start job");
      setRunId(data.run_id);
      setPhase("running");
      startPolling(data.run_id);
    } catch (e: any) {
      setError(e?.message || String(e)); setPhase("error");
    }
  }

  function startPolling(id: number) {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const res = await fetch(`/api/status?runId=${id}`, { cache: "no-store" });
        const data: StatusResp = await res.json();
        if (!res.ok) throw new Error(data.error || "status error");
        setStatus(data);
        if (data.done) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase(data.success ? "success" : "error");
          if (!data.success) setError(data.message || data.result_state || "Job failed");
        }
      } catch (e: any) {
        if (pollRef.current) clearInterval(pollRef.current);
        setError(e?.message || String(e)); setPhase("error");
      }
    };
    tick();
    pollRef.current = setInterval(tick, 3000);
  }

  const busy = phase === "submitting" || phase === "running";
  const life = status?.life_cycle_state || (phase === "submitting" ? "STARTING" : "");
  const stepIdx = lifeToStep(phase, life);
  const flow = status?.flow || null;

  return (
    <div className="wrap">
      <header className="header">
        <div className="logo">⛓️</div>
        <div>
          <h1>Control-M Lineage Analyzer</h1>
          <p className="sub">
            Upload a Control-M workspace export, run the Databricks lineage job, then explore the
            dependency diagram and download the Excel dashboard.
          </p>
        </div>
      </header>

      {/* ── 1 · Upload XML to the Volume ── */}
      <section className="card">
        <div className="card-head">
          <span className="step-num">1</span>
          <h2>Upload workspace XML</h2>
        </div>
        <p className="muted small">
          The file is streamed straight into the Databricks input Volume — the job reads it by name,
          no manual copy needed.
        </p>

        <div className="uploader">
          <label className="filepick">
            <input
              type="file"
              accept=".xml"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setUploadMsg(""); setUploadErr(""); }}
            />
            <span className="filepick-btn">Choose .xml file</span>
            <span className="filepick-name">{file ? file.name : "No file selected"}</span>
          </label>
          <button className="btn" onClick={upload} disabled={!file || uploading}>
            {uploading ? "Uploading…" : "⬆  Upload to Volume"}
          </button>
        </div>

        {uploadMsg && <div className="note ok">✓ {uploadMsg}</div>}
        {uploadErr && <div className="note err">⚠ {uploadErr}</div>}
      </section>

      {/* ── 2 · Parameters ── */}
      <section className="card">
        <div className="card-head">
          <span className="step-num">2</span>
          <h2>Run parameters</h2>
        </div>
        <div className="grid">
          <div className="full">
            <label>XML filename (no “.xml” needed)</label>
            <input value={xmlFilename} onChange={(e) => setXmlFilename(e.target.value)}
                   placeholder="e.g. MAZ_DRVD_APP_VST" />
            <div className="hint">Auto-filled after upload, or type a file that already exists in the Volume.</div>
          </div>

          <div>
            <label>Input mode</label>
            <select value={inputMode} onChange={(e) => setInputMode(e.target.value as Mode)}>
              <option value="job_name">job_name</option>
              <option value="table_name">table_name</option>
              <option value="folder_name">folder_name</option>
            </select>
          </div>

          <div>
            <label>Direction</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="predecessor">predecessor</option>
              <option value="successor">successor</option>
              <option value="both">both</option>
            </select>
          </div>

          {inputMode === "job_name" && (
            <>
              <div className="full">
                <label>Job name(s) — comma separated</label>
                <input value={jobNames} onChange={(e) => setJobNames(e.target.value)}
                       placeholder="JOB_A, JOB_B" />
              </div>
              <div className="full">
                <label>Folder filter (blank = all folders)</label>
                <input value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} placeholder="(all)" />
              </div>
            </>
          )}

          {inputMode === "table_name" && (
            <>
              <div>
                <label>Table name(s) — comma separated</label>
                <input value={tableNames} onChange={(e) => setTableNames(e.target.value)}
                       placeholder="MY_TABLE" />
              </div>
              <div>
                <label>Table match mode</label>
                <select value={tableMatchMode} onChange={(e) => setTableMatchMode(e.target.value)}>
                  <option value="exact">exact</option>
                  <option value="contains">contains</option>
                </select>
              </div>
              <div className="full">
                <label>Folder filter (blank = all folders)</label>
                <input value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} placeholder="(all)" />
              </div>
            </>
          )}

          {inputMode === "folder_name" && (
            <div className="full">
              <label>Folder (seed) — required</label>
              <input value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}
                     placeholder="e.g. BIDW_MAZ_DRVD_APP_VST_PRD" />
              <div className="hint">In folder_name mode every job in this folder is used as the seed.</div>
            </div>
          )}

          <div className="full">
            <label>App password (only if the deployment is gated)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                   placeholder="leave blank if not set" />
          </div>
        </div>

        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? "Running…" : "▶  Run analysis"}
          </button>
          {runId && <span className="muted mono">run_id: {runId}</span>}
        </div>
      </section>

      {/* ── 3 · Status ── */}
      {phase !== "idle" && (
        <section className="card">
          <div className="card-head">
            <span className="step-num">3</span>
            <h2>Run status</h2>
          </div>
          <div className="status">
            <span className={`dot ${dotClass(phase)}`} />
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 10 }}>
                <strong>{prettyPhase(phase, life)}</strong>
                {status?.result_state && (
                  <span className={`badge ${status.success ? "ok" : "err"}`}>{status.result_state}</span>
                )}
                {!status?.result_state && busy && <span className="badge run">{life || "STARTING"}</span>}
              </div>
              {status?.message && <div className="muted small" style={{ marginTop: 4 }}>{status.message}</div>}
            </div>
            {status?.runPageUrl && (
              <a className="link" href={status.runPageUrl} target="_blank" rel="noreferrer">Open in Databricks ↗</a>
            )}
          </div>

          <div className="steps">
            {["Queued", "Running", "Done"].map((lbl, i) => (
              <div key={lbl} className={`step ${i < stepIdx ? "done" : i === stepIdx ? "active" : ""}`} />
            ))}
          </div>

          {error && <div className="note err" style={{ marginTop: 14 }}>⚠ {error}</div>}
        </section>
      )}

      {/* ── 4 · Results: flow summary + diagram + download ── */}
      {phase === "success" && (
        <section className="card">
          <div className="card-head">
            <span className="step-num">✓</span>
            <h2>Lineage results</h2>
          </div>

          {flow && (
            <div className="stats">
              <Stat label="Jobs" value={flow.jobs} />
              <Stat label="Containers" value={flow.containers} />
              <Stat label="Diagram nodes" value={flow.nodes} />
              <Stat label="Edges" value={flow.edges} />
            </div>
          )}

          {flow && (
            <div className="meta">
              <MetaRow k="Mode" v={flow.input_mode} />
              <MetaRow k="Direction" v={flow.direction} />
              <MetaRow k="Folder" v={flow.folder_filter || "(all)"} />
              <MetaRow k="Seed jobs" v={(flow.input_jobs || []).join(", ") || "—"} />
              {!!flow.omitted && <MetaRow k="Omitted (truncated)" v={String(flow.omitted)} />}
            </div>
          )}

          {flow?.mermaid ? (
            <div className="diagram-block">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 className="block-title">Dependency diagram</h3>
                {flow.mermaid_url && (
                  <a className="link" href={flow.mermaid_url} target="_blank" rel="noreferrer">
                    Open in Mermaid Live ↗
                  </a>
                )}
              </div>
              <div className="diagram">
                <MermaidDiagram code={flow.mermaid} />
              </div>
              <details className="source">
                <summary>Show Mermaid source</summary>
                <pre className="mono">{flow.mermaid}</pre>
              </details>
            </div>
          ) : (
            <div className="muted small" style={{ marginTop: 8 }}>
              No diagram was returned for this run.
            </div>
          )}

          {status?.outputPath ? (
            <div className="download-block">
              <a className="btn download"
                 href={`/api/download?path=${encodeURIComponent(status.outputPath)}`}>
                ⬇  Download Excel dashboard
              </a>
              <div className="outpath mono">{status.outputPath}</div>
            </div>
          ) : (
            <div className="muted small" style={{ marginTop: 14 }}>
              Job succeeded but no output path was returned.
              {status?.outputError ? <div className="err-text">{status.outputError}</div> : null}
            </div>
          )}
        </section>
      )}

      <footer className="footer">Control-M Analyzer · Databricks Jobs API · deployed on Vercel</footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="stat">
      <div className="stat-val">{value ?? "—"}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  );
}
function MetaRow({ k, v }: { k: string; v?: string }) {
  return (
    <div className="meta-row">
      <span className="meta-k">{k}</span>
      <span className="meta-v">{v || "—"}</span>
    </div>
  );
}

function fmtBytes(n?: number) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function dotClass(phase: Phase) {
  if (phase === "running" || phase === "submitting") return "run";
  if (phase === "success") return "ok";
  if (phase === "error") return "err";
  return "idle";
}
function prettyPhase(phase: Phase, life: string) {
  if (phase === "submitting") return "Starting job…";
  if (phase === "success") return "Completed";
  if (phase === "error") return "Failed";
  if (phase === "running") return `Running (${life || "…"})`;
  return "Idle";
}
function lifeToStep(phase: Phase, life: string): number {
  if (phase === "success" || phase === "error") return 2;
  if (life === "RUNNING" || life === "TERMINATING") return 1;
  return 0;
}
