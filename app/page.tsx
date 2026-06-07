"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "job_name" | "table_name";
type Phase = "idle" | "submitting" | "running" | "success" | "error";

interface StatusResp {
  life_cycle_state?: string;
  result_state?: string;
  message?: string;
  runPageUrl?: string;
  done?: boolean;
  success?: boolean;
  outputPath?: string | null;
  outputError?: string | null;
  error?: string;
}

export default function Page() {
  // ── form state ────────────────────────────────────────────────────────────
  const [xmlFilename, setXmlFilename] = useState("2026-04-25 7-41 PM Complete Workspace (1)");
  const [folderFilter, setFolderFilter] = useState("");
  const [inputMode, setInputMode] = useState<Mode>("job_name");
  const [jobNames, setJobNames] = useState("BIDW_MAZ_DRVD_APP_IFRS_RECON_V21_RRE_PRODUCT_RECON");
  const [tableNames, setTableNames] = useState("");
  const [tableMatchMode, setTableMatchMode] = useState("exact");
  const [direction, setDirection] = useState("predecessor");
  const [maxDepth, setMaxDepth] = useState("0");
  const [password, setPassword] = useState("");

  // ── run state ───────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function submit() {
    setError(""); setStatus(null); setRunId(null); setPhase("submitting");
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-password": password },
        body: JSON.stringify({
          xmlFilename, folderFilter, inputMode, jobNames, tableNames,
          tableMatchMode, direction, maxDepth,
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

  return (
    <div className="wrap">
      <div className="header">
        <div className="logo">⛓️</div>
        <h1>Control-M Lineage Analyzer</h1>
      </div>
      <p className="sub">Trigger the Databricks job, watch it run, and download the generated Excel dashboard.</p>

      {/* ── Parameters ── */}
      <div className="card">
        <h2>Parameters</h2>
        <div className="grid">
          <div className="full">
            <label>XML filename (no “.xml” needed)</label>
            <input value={xmlFilename} onChange={(e) => setXmlFilename(e.target.value)}
                   placeholder="2026-04-25 7-41 PM Complete Workspace (1)" />
            <div className="hint">Must already exist in the Control-M Volume folder.</div>
          </div>

          <div>
            <label>Input mode</label>
            <select value={inputMode} onChange={(e) => setInputMode(e.target.value as Mode)}>
              <option value="job_name">job_name</option>
              <option value="table_name">table_name</option>
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

          {inputMode === "job_name" ? (
            <div className="full">
              <label>Job name(s) — comma separated</label>
              <input value={jobNames} onChange={(e) => setJobNames(e.target.value)}
                     placeholder="JOB_A, JOB_B" />
            </div>
          ) : (
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
            </>
          )}

          <div>
            <label>Folder filter (blank = all folders)</label>
            <input value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} placeholder="(all)" />
          </div>

          <div>
            <label>Max depth (0 = unlimited)</label>
            <input value={maxDepth} onChange={(e) => setMaxDepth(e.target.value)} inputMode="numeric" />
          </div>

          <div className="full">
            <label>App password (only if the deployment is gated)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="leave blank if not set" />
          </div>
        </div>

        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? "Running…" : "▶  Run job"}
          </button>
          {runId && <span className="muted mono">run_id: {runId}</span>}
        </div>
      </div>

      {/* ── Status ── */}
      {(phase !== "idle") && (
        <div className="card">
          <h2>Run status</h2>
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
              {status?.message && <div className="muted" style={{ marginTop: 4, fontSize: 12.5 }}>{status.message}</div>}
            </div>
            {status?.runPageUrl && (
              <a className="link" href={status.runPageUrl} target="_blank" rel="noreferrer">Open in Databricks ↗</a>
            )}
          </div>

          <div className="steps">
            {["Queued", "Running", "Done"].map((_, i) => (
              <div key={i} className={`step ${i < stepIdx ? "done" : i === stepIdx ? "active" : ""}`} />
            ))}
          </div>

          {phase === "success" && status?.outputPath && (
            <div style={{ marginTop: 18 }}>
              <a className="btn download" href={`/api/download?path=${encodeURIComponent(status.outputPath)}`}>
                ⬇  Download Excel
              </a>
              <div className="outpath mono">{status.outputPath}</div>
            </div>
          )}

          {phase === "success" && !status?.outputPath && (
            <div className="muted" style={{ marginTop: 14 }}>
              Job succeeded but no output path was returned.
              {status?.outputError ? <div className="err-text">{status.outputError}</div> : null}
            </div>
          )}

          {error && <div className="err-text" style={{ marginTop: 14 }}>⚠ {error}</div>}
        </div>
      )}

      <div className="footer">Control-M Analyzer v8 · Databricks Jobs API · deploy on Vercel</div>
    </div>
  );
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
