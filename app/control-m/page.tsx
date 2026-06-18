"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Upload, Play, Download, Clock, History, RotateCcw, RefreshCw,
  CircleHelp, ExternalLink, FileSpreadsheet, Loader2, Ban, Lock,
  Workflow, Boxes, CircleDot, Share2,
} from "lucide-react";
import { useToast } from "../components/Toast";

const MermaidDiagram = dynamic(() => import("../MermaidDiagram"), { ssr: false });

type Mode = "job_name" | "table_name" | "folder_name";
type Phase = "idle" | "submitting" | "running" | "success" | "error";

interface Flow {
  output_path?: string; xml_filename?: string; input_mode?: string; direction?: string;
  folder_filter?: string; input_jobs?: string[]; jobs?: number; containers?: number;
  nodes?: number; edges?: number; omitted?: number; llm_calls?: number;
  mermaid?: string; mermaid_url?: string;
}
interface StatusResp {
  life_cycle_state?: string; result_state?: string; message?: string; runPageUrl?: string;
  done?: boolean; success?: boolean; outputPath?: string | null; outputError?: string | null;
  flow?: Flow | null; error?: string;
}
interface OutputFile { path: string; name: string; size: number; modified: number; }

const STAGES = ["Queued", "Running", "Finalizing", "Completed"] as const;

export default function ControlMPage() {
  const { toast } = useToast();

  // form
  const [xmlFilename, setXmlFilename] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [inputMode, setInputMode] = useState<Mode>("job_name");
  const [jobNames, setJobNames] = useState("");
  const [tableNames, setTableNames] = useState("");
  const [tableMatchMode, setTableMatchMode] = useState("exact");
  const [direction, setDirection] = useState("predecessor");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  // upload
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // run
  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // timer
  const [startTime, setStartTime] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // history
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const busy = phase === "submitting" || phase === "running";
  const life = status?.life_cycle_state || (phase === "submitting" ? "STARTING" : "");
  const curStage = currentStage(phase, life);
  const flow = status?.flow || null;

  const startPolling = useCallback((id: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const res = await fetch(`/api/status?runId=${id}`, { cache: "no-store" });
        const data: StatusResp = await res.json();
        if (!res.ok) throw new Error(data.error || "status error");
        setStatus(data);
        if (data.done) {
          if (pollRef.current) clearInterval(pollRef.current);
          setNow(Date.now());
          setPhase(data.success ? "success" : "error");
          if (data.success) { toast("Analysis complete ✓", "success"); loadOutputs(); }
          else { setError(data.message || data.result_state || "Job failed"); toast(data.message || "Job failed", "error"); }
        }
      } catch (e: any) {
        if (pollRef.current) clearInterval(pollRef.current);
        setError(e?.message || String(e)); setPhase("error");
      }
    };
    tick();
    pollRef.current = setInterval(tick, 3000);
  }, [toast]);

  // restore form + in-flight run on mount
  useEffect(() => {
    try {
      const f = JSON.parse(localStorage.getItem("cm-form") || "null");
      if (f) {
        setXmlFilename(f.xmlFilename ?? ""); setFolderFilter(f.folderFilter ?? "");
        setInputMode(f.inputMode ?? "job_name"); setJobNames(f.jobNames ?? "");
        setTableNames(f.tableNames ?? ""); setTableMatchMode(f.tableMatchMode ?? "exact");
        setDirection(f.direction ?? "predecessor");
      }
    } catch {}
    try {
      const r = JSON.parse(localStorage.getItem("cm-run") || "null");
      if (r?.runId) {
        setRunId(r.runId); setStartTime(r.startedAt || Date.now());
        setPhase("running"); startPolling(r.runId);
      }
    } catch {}
    setHydrated(true);
    loadOutputs();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // remember inputs (not the password)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem("cm-form", JSON.stringify({
        xmlFilename, folderFilter, inputMode, jobNames, tableNames, tableMatchMode, direction,
      }));
    } catch {}
  }, [hydrated, xmlFilename, folderFilter, inputMode, jobNames, tableNames, tableMatchMode, direction]);

  // run timer
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [busy]);

  async function loadOutputs() {
    setHistLoading(true);
    try {
      const res = await fetch("/api/outputs", { headers: { "x-app-password": password }, cache: "no-store" });
      const d = await res.json();
      if (res.ok) setOutputs(d.files || []);
    } catch {} finally { setHistLoading(false); }
  }

  function pickFile(f: File | null) {
    setFile(f); setUploadPct(0);
  }

  function upload() {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xml")) { toast("Please choose a .xml file", "error"); return; }
    setUploadPct(0); setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    if (password) xhr.setRequestHeader("x-app-password", password);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      setUploading(false);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setXmlFilename(data.filename || "");
          setUploadPct(100);
          toast(`Uploaded ${file.name}`, "success");
        } else { toast(data.error || "Upload failed", "error"); setUploadPct(0); }
      } catch { toast("Upload failed", "error"); setUploadPct(0); }
    };
    xhr.onerror = () => { setUploading(false); setUploadPct(0); toast("Network error during upload", "error"); };
    xhr.send(fd);
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!xmlFilename.trim()) e.xmlFilename = "XML filename is required.";
    if (inputMode === "job_name" && !jobNames.trim()) e.jobNames = "Enter at least one job name.";
    if (inputMode === "table_name" && !tableNames.trim()) e.tableNames = "Enter at least one table name.";
    if (inputMode === "folder_name" && !folderFilter.trim()) e.folderFilter = "Folder is required in folder_name mode.";
    return e;
  }

  async function submit() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast("Please fix the highlighted fields", "error"); return; }

    setError(""); setStatus(null); setRunId(null); setPhase("submitting");
    setStartTime(Date.now()); setNow(Date.now());
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-password": password },
        body: JSON.stringify({ xmlFilename, folderFilter, inputMode, jobNames, tableNames, tableMatchMode, direction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start job");
      setRunId(data.run_id); setPhase("running");
      try { localStorage.setItem("cm-run", JSON.stringify({ runId: data.run_id, startedAt: Date.now() })); } catch {}
      toast(`Job started (run ${data.run_id})`, "info");
      startPolling(data.run_id);
    } catch (e: any) {
      setError(e?.message || String(e)); setPhase("error"); toast(e?.message || "Failed to start", "error");
    }
  }

  async function cancel() {
    if (!runId) return;
    try {
      const res = await fetch("/api/cancel", {
        method: "POST", headers: { "Content-Type": "application/json", "x-app-password": password },
        body: JSON.stringify({ runId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Cancel failed");
      toast("Cancel requested", "info");
    } catch (e: any) { toast(e?.message || "Cancel failed", "error"); }
  }

  function newRun() {
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase("idle"); setRunId(null); setStatus(null); setError(""); setStartTime(null);
    try { localStorage.removeItem("cm-run"); } catch {}
  }

  const elapsed = startTime ? Math.max(0, now - startTime) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Control-M Lineage Analysis</h1>
        <p className="sub">Upload a Control-M workspace export, run the Databricks lineage job, then explore the dependency diagram and download the Excel dashboard.</p>
      </div>

      {/* 1 · Upload */}
      <section className="card">
        <div className="card-head"><span className="step-num">1</span><h2>Upload workspace XML</h2></div>
        <p className="muted small">Streamed straight into the Databricks input Volume — the job reads it by name, no manual copy needed.</p>

        <div
          className={`drop-zone ${dragging ? "drop-active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
          onClick={() => fileInputRef.current?.click()}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
        >
          <input ref={fileInputRef} type="file" accept=".xml" hidden
                 onChange={(e) => pickFile(e.target.files?.[0] || null)} />
          <Upload size={26} className="drop-ico" />
          <div className="drop-text">
            {file ? <strong>{file.name}</strong> : <>Drag & drop your <strong>.xml</strong> here, or <span className="link">browse</span></>}
          </div>
          {file && <div className="muted small">{fmtBytes(file.size)}</div>}
        </div>

        {uploading || uploadPct > 0 ? (
          <div className="progress"><div className="progress-bar" style={{ width: `${uploadPct}%` }} /></div>
        ) : null}

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn secondary" onClick={upload} disabled={!file || uploading}>
            {uploading ? <><Loader2 size={16} className="spin" /> Uploading… {uploadPct}%</> : <><Upload size={16} /> Upload to Volume</>}
          </button>
        </div>
      </section>

      {/* 2 · Parameters */}
      <section className="card">
        <div className="card-head"><span className="step-num">2</span><h2>Run parameters</h2></div>
        <div className="grid">
          <div className="full">
            <label>XML filename (no “.xml” needed) <Help text="The workspace export file in the Volume. Auto-filled after upload." /></label>
            <input className={errors.xmlFilename ? "err" : ""} value={xmlFilename}
                   onChange={(e) => setXmlFilename(e.target.value)} placeholder="e.g. MAZ_DRVD_APP_VST" />
            {errors.xmlFilename && <div className="field-err">{errors.xmlFilename}</div>}
          </div>

          <div>
            <label>Input mode <Help text="job_name: seed from job(s). table_name: seed from table(s). folder_name: seed from every job in a folder." /></label>
            <select value={inputMode} onChange={(e) => setInputMode(e.target.value as Mode)}>
              <option value="job_name">job_name</option>
              <option value="table_name">table_name</option>
              <option value="folder_name">folder_name</option>
            </select>
          </div>

          <div>
            <label>Direction <Help text="predecessor = upstream, successor = downstream, both = full chain." /></label>
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
                <input className={errors.jobNames ? "err" : ""} value={jobNames}
                       onChange={(e) => setJobNames(e.target.value)} placeholder="JOB_A, JOB_B" />
                {errors.jobNames && <div className="field-err">{errors.jobNames}</div>}
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
                <input className={errors.tableNames ? "err" : ""} value={tableNames}
                       onChange={(e) => setTableNames(e.target.value)} placeholder="MY_TABLE" />
                {errors.tableNames && <div className="field-err">{errors.tableNames}</div>}
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
              <label>Folder (seed) — required <Help text="Every job in this folder is used as the seed." /></label>
              <input className={errors.folderFilter ? "err" : ""} value={folderFilter}
                     onChange={(e) => setFolderFilter(e.target.value)} placeholder="e.g. BIDW_MAZ_DRVD_APP_VST_PRD" />
              {errors.folderFilter && <div className="field-err">{errors.folderFilter}</div>}
            </div>
          )}

          <div className="full">
            <div className="gate">
              <span className="gate-ico"><Lock size={18} /></span>
              <div className="gate-field">
                <label>App password <span className="muted">(only if the deployment is gated)</span></label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="leave blank if not set" />
              </div>
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? <><Loader2 size={16} className="spin" /> Running…</> : <><Play size={16} /> Run analysis</>}
          </button>
          {phase === "success" || phase === "error" ? (
            <button className="btn ghost" onClick={newRun}><RotateCcw size={15} /> New run</button>
          ) : null}
          {runId && <span className="muted mono">run_id: {runId}</span>}
        </div>
      </section>

      {/* 3 · Status */}
      {phase !== "idle" && (
        <section className="card">
          <div className="card-head"><span className="step-num">3</span><h2>Run status</h2>
            {busy && <span className="timer"><Clock size={14} /> {fmtElapsed(elapsed)}</span>}
          </div>

          <div className="status">
            <span className={`dot ${dotClass(phase)}`} />
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 10 }}>
                <strong>{prettyPhase(phase, life)}</strong>
                {status?.result_state && <span className={`badge ${status.success ? "ok" : "err"}`}>{status.result_state}</span>}
                {!status?.result_state && busy && <span className="badge run">{life || "STARTING"}</span>}
              </div>
              {status?.message && <div className="muted small" style={{ marginTop: 4 }}>{status.message}</div>}
            </div>
            {busy && runId && <button className="btn danger sm" onClick={cancel}><Ban size={14} /> Cancel</button>}
            {status?.runPageUrl && <a className="link" href={status.runPageUrl} target="_blank" rel="noreferrer">Databricks <ExternalLink size={13} /></a>}
          </div>

          <ol className="stepper">
            {STAGES.map((label, i) => {
              const cls = stageClass(phase, curStage, i);
              return (
                <li key={label} className={cls}>
                  <span className="step-ico">{cls === "done" ? "✓" : cls === "err" ? "✕" : i + 1}</span>
                  <span className="step-name">{label}</span>
                </li>
              );
            })}
          </ol>

          <div className="stage-hint">
            {phase === "success" ? <>All steps completed ✓</>
              : phase === "error" ? <>Failed at <b>{STAGES[curStage]}</b></>
              : <>Now: <b>{STAGES[curStage]}</b>{curStage < STAGES.length - 1 && <> · Next: <b>{STAGES[curStage + 1]}</b></>}</>}
          </div>

          {error && <div className="note err" style={{ marginTop: 14 }}>⚠ {error}</div>}
        </section>
      )}

      {/* 4 · Results */}
      {phase === "success" && (
        <section className="card">
          <div className="card-head"><span className="step-num">✓</span><h2>Lineage results</h2></div>

          {flow && (
            <div className="stats">
              <Stat label="Jobs" value={flow.jobs} icon={Workflow} color="#DA291C" />
              <Stat label="Containers" value={flow.containers} icon={Boxes} color="#2563eb" />
              <Stat label="Diagram nodes" value={flow.nodes} icon={CircleDot} color="#7c3aed" />
              <Stat label="Edges" value={flow.edges} icon={Share2} color="#0891b2" />
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
            <MermaidDiagram code={flow.mermaid} liveUrl={flow.mermaid_url} />
          ) : (
            <div className="muted small" style={{ marginTop: 8 }}>No diagram was returned for this run.</div>
          )}

          {status?.outputPath ? (
            <div className="download-block">
              <a className="btn download" href={`/api/download?path=${encodeURIComponent(status.outputPath)}`}>
                <Download size={16} /> Download Excel dashboard
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

      {/* 5 · History */}
      <section className="card">
        <div className="card-head">
          <span className="step-num"><History size={15} /></span>
          <h2>Recent outputs</h2>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={loadOutputs} aria-label="Refresh" title="Refresh">
            <RefreshCw size={16} className={histLoading ? "spin" : ""} />
          </button>
        </div>
        {histLoading && outputs.length === 0 ? (
          <div className="hist">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton skel-row" />)}
          </div>
        ) : outputs.length === 0 ? (
          <div className="empty">
            <div className="empty-ico"><FileSpreadsheet size={22} /></div>
            <div className="empty-title">No outputs yet</div>
            <div className="empty-sub">Run an analysis to generate an Excel dashboard, or enter the app password and refresh.</div>
          </div>
        ) : (
          <div className="hist">
            {outputs.map((o) => (
              <div key={o.path} className="hist-item">
                <FileSpreadsheet size={18} className="hist-ico" />
                <div className="hist-meta">
                  <div className="hist-name">{o.name}</div>
                  <div className="muted small">{fmtDate(o.modified)} · {fmtBytes(o.size)}</div>
                </div>
                <a className="btn sm download" href={`/api/download?path=${encodeURIComponent(o.path)}`}>
                  <Download size={14} /> Download
                </a>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, icon: Icon, color }: { label: string; value?: number; icon: any; color: string }) {
  return (
    <div className="stat">
      <div className="stat-ico" style={{ background: color }}><Icon size={18} /></div>
      <div className="stat-val">{value ?? "—"}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  );
}
function MetaRow({ k, v }: { k: string; v?: string }) {
  return <div className="meta-row"><span className="meta-k">{k}</span><span className="meta-v">{v || "—"}</span></div>;
}
function Help({ text }: { text: string }) {
  return <span className="help" tabIndex={0} aria-label={text} data-tip={text}><CircleHelp size={13} /></span>;
}

function fmtBytes(n?: number) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtElapsed(ms: number) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
function fmtDate(ms: number) {
  if (!ms) return "—";
  try { return new Date(ms).toLocaleString(); } catch { return "—"; }
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
function currentStage(phase: Phase, life: string): number {
  if (phase === "success") return 3;
  if (phase === "submitting") return 0;
  if (phase === "running") { if (life === "RUNNING") return 1; if (life === "TERMINATING") return 2; return 0; }
  if (phase === "error") { if (life === "TERMINATING") return 2; return 1; }
  return 0;
}
function stageClass(phase: Phase, cur: number, i: number): "done" | "active" | "err" | "todo" {
  if (phase === "success") return "done";
  if (phase === "error") return i < cur ? "done" : i === cur ? "err" : "todo";
  return i < cur ? "done" : i === cur ? "active" : "todo";
}
