"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download, Upload, Loader2, FileSpreadsheet, Play, Database, CheckCircle2,
  Search, ExternalLink, RotateCcw, Lock, RefreshCw, AlertTriangle,
} from "lucide-react";
import { useToast } from "../components/Toast";

type Phase = "idle" | "running" | "success" | "error";
const STAGES = ["Queued", "Running", "Completed"] as const;

export default function DgPage() {
  const { toast } = useToast();
  const [password, setPassword] = useState("");

  return (
    <div className="page">
      <div className="page-head">
        <h1>DG Document Creation</h1>
        <p className="tagline">Data Governance documentation — edl_qa</p>
        <p className="sub">Step 1: create tables from a spreadsheet. Step 2: generate DG documents for those tables. Step 3: review &amp; download.</p>
      </div>

      <Step1 password={password} toast={toast} />
      <Step2 password={password} toast={toast} />

      <section className="card">
        <div className="card-head"><span className="step-num"><Lock size={15} /></span><h2>Access (optional)</h2></div>
        <div className="gate">
          <span className="gate-ico"><Lock size={18} /></span>
          <div className="gate-field">
            <label>App password <span className="muted">(only if the deployment is gated)</span></label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="leave blank if not set" />
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Step 1: tables from Excel ──────────────────────────────────────────── */
function Step1({ password, toast }: { password: string; toast: (m: string, k?: any) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  async function run() {
    if (!file) return;
    setBusy(true); setLog([]); setDone(false);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/dg/upload", { method: "POST", headers: password ? { "x-app-password": password } : {}, body: fd });
      if (!res.ok || !res.body) { const t = await res.text(); throw new Error(t || `Failed (${res.status})`); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done: d, value } = await reader.read(); if (d) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const ln of lines) {
          if (ln === "__DONE__") { setDone(true); toast("Tables created", "success"); }
          else if (ln) setLog((L) => [...L, ln]);
        }
      }
      if (buf.trim()) setLog((L) => [...L, buf.trim()]);
    } catch (e: any) { setLog((L) => [...L, `✗ ${e?.message || e}`]); toast(e?.message || "Failed", "error"); }
    finally { setBusy(false); }
  }

  return (
    <section className="card">
      <div className="card-head"><span className="step-num">1</span><h2>Create tables from spreadsheet</h2></div>
      <p className="muted small">Download the template, fill it (Schema · Table · Column · Data Type — 100+ tables OK), then upload. Tables are created in <b>edl_qa</b>.</p>

      <div className="row" style={{ marginTop: 12 }}>
        <a className="btn secondary sm" href="/api/dg/template"><Download size={15} /> Download template</a>
      </div>

      <div className={`drop-zone ${dragging ? "drop-active" : ""}`} style={{ marginTop: 14 }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
        onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <Upload size={26} className="drop-ico" />
        <div className="drop-text">{file ? <strong>{file.name}</strong> : <>Drag &amp; drop your <strong>.xlsx</strong>, or <span className="link">browse</span></>}</div>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={run} disabled={!file || busy}>
          {busy ? <><Loader2 size={16} className="spin" /> Creating…</> : <><Database size={16} /> Upload &amp; create tables</>}
        </button>
        {done && <span className="badge ok"><CheckCircle2 size={13} /> done</span>}
      </div>

      {log.length > 0 && (
        <>
          <div className="logs-head">Logs</div>
          <div className="logs" ref={logRef}>{log.map((l, i) => <div key={i} className={`log-line ${l.startsWith("✗") ? "err" : l.startsWith("✓") ? "ok" : ""}`}>{l}</div>)}</div>
        </>
      )}
    </section>
  );
}

/* ── Step 2: DG document creation ───────────────────────────────────────── */
function Step2({ password, toast }: { password: string; toast: (m: string, k?: any) => void }) {
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selSchemas, setSelSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<{ schema: string; table: string }[]>([]);
  const [selTables, setSelTables] = useState<Set<string>>(new Set());
  const [tq, setTq] = useState("");
  const [desc, setDesc] = useState("");
  const [loadingSch, setLoadingSch] = useState(false);
  const [loadingTab, setLoadingTab] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState<number | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadSchemas(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);
  useEffect(() => { loadTables(selSchemas); /* eslint-disable-next-line */ }, [selSchemas]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs]);

  async function loadSchemas() {
    setLoadingSch(true);
    try { const r = await fetch("/api/dg/schemas", { cache: "no-store" }); const d = await r.json(); if (r.ok) setSchemas(d.schemas || []); else toast(d.error || "Failed to load schemas", "error"); }
    catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setLoadingSch(false); }
  }
  async function loadTables(schs: string[]) {
    if (!schs.length) { setTables([]); return; }
    setLoadingTab(true);
    try { const r = await fetch(`/api/dg/tables?schemas=${encodeURIComponent(schs.join(","))}`, { cache: "no-store" }); const d = await r.json(); if (r.ok) setTables(d.tables || []); }
    catch {} finally { setLoadingTab(false); }
  }
  function toggleSchema(s: string) { setSelSchemas((x) => x.includes(s) ? x.filter((y) => y !== s) : [...x, s]); }
  function toggleTable(key: string) { setSelTables((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; }); }

  const filteredTables = useMemo(() => tables.filter((t) => `${t.schema}.${t.table}`.toLowerCase().includes(tq.toLowerCase())), [tables, tq]);
  const log = (s: string) => setLogs((L) => [...L, `${new Date().toLocaleTimeString()}  ${s}`]);

  function startPolling(id: number) {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const r = await fetch(`/api/dg/status?runId=${id}`, { cache: "no-store" }); const d = await r.json();
        if (!r.ok) throw new Error(d.error || "status error");
        setStatus(d);
        if (d.message) log(`state: ${d.life_cycle_state}${d.message ? " — " + d.message : ""}`);
        else log(`state: ${d.life_cycle_state}`);
        if (d.done) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase(d.success ? "success" : "error");
          log(d.success ? "✓ completed" : `✗ ${d.result_state}`);
          if (d.success) toast("DG document ready", "success"); else toast(d.message || "Job failed", "error");
        }
      } catch (e: any) { if (pollRef.current) clearInterval(pollRef.current); setPhase("error"); log(`✗ ${e?.message || e}`); }
    };
    tick(); pollRef.current = setInterval(tick, 3000);
  }

  async function create() {
    const sch = selSchemas.join(",");
    const tbl = [...selTables].map((k) => k.split(".").slice(1).join(".")).join(","); // table part after schema
    if (!sch) { toast("Select at least one schema", "error"); return; }
    if (!selTables.size) { toast("Select at least one table", "error"); return; }
    if (!desc.trim()) { toast("Business description is required", "error"); return; }
    setPhase("running"); setStatus(null); setLogs([]); setRunId(null);
    log("submitting…");
    try {
      const r = await fetch("/api/dg/create", { method: "POST", headers: { "Content-Type": "application/json", ...(password ? { "x-app-password": password } : {}) }, body: JSON.stringify({ schemas: sch, tables: [...selTables].map((k) => k.split(".").slice(1).join(".")).join(","), description: desc }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed");
      setRunId(d.run_id); log(`triggered job · run ${d.run_id}`); startPolling(d.run_id);
    } catch (e: any) { setPhase("error"); log(`✗ ${e?.message || e}`); toast(e?.message || "Failed", "error"); }
  }
  function reset() { if (pollRef.current) clearInterval(pollRef.current); setPhase("idle"); setRunId(null); setStatus(null); setLogs([]); }

  const cur = phase === "success" ? 2 : phase === "running" ? (status?.life_cycle_state === "RUNNING" || status?.life_cycle_state === "TERMINATING" ? 1 : 0) : phase === "error" ? 1 : 0;
  const busy = phase === "running";

  return (
    <>
      <section className="card">
        <div className="card-head"><span className="step-num">2</span><h2>Generate DG document</h2>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={loadSchemas} title="Refresh"><RefreshCw size={16} className={loadingSch ? "spin" : ""} /></button>
        </div>

        <div className="row" style={{ gap: 10, marginBottom: 6 }}>
          <span className="muted small">Catalog</span><span className="tpill t-sick">{`edl_qa`}</span>
        </div>

        <label>Schema(s)</label>
        {loadingSch ? <div className="muted small">Loading…</div> : schemas.length === 0 ? <div className="muted small">No schemas found (check connection / refresh).</div> : (
          <div className="type-chips">{schemas.map((s) => <button key={s} className={`chip ${selSchemas.includes(s) ? "active" : ""}`} onClick={() => toggleSchema(s)}>{s}</button>)}</div>
        )}

        <label style={{ marginTop: 16 }}>Table(s) {selTables.size > 0 && <span className="muted">· {selTables.size} selected</span>}</label>
        <div className="search" style={{ maxWidth: 280 }}><Search size={14} /><input value={tq} onChange={(e) => setTq(e.target.value)} placeholder="Filter tables…" /></div>
        <div className="picklist">
          {!selSchemas.length ? <div className="muted small" style={{ padding: 10 }}>Select schema(s) first.</div>
            : loadingTab ? <div className="muted small" style={{ padding: 10 }}>Loading tables…</div>
            : filteredTables.length === 0 ? <div className="muted small" style={{ padding: 10 }}>No tables.</div>
            : filteredTables.map((t) => { const key = `${t.schema}.${t.table}`; return (
              <label key={key} className="pick-item">
                <input type="checkbox" checked={selTables.has(key)} onChange={() => toggleTable(key)} />
                <span className="mono">{key}</span>
              </label>
            ); })}
        </div>

        <label style={{ marginTop: 16 }}>Business description</label>
        <textarea className="ta" rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the business purpose of these tables…" />

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={create} disabled={busy}>{busy ? <><Loader2 size={16} className="spin" /> Running…</> : <><Play size={16} /> Create DG Document</>}</button>
          {(phase === "success" || phase === "error") && <button className="btn ghost sm" onClick={reset}><RotateCcw size={15} /> New run</button>}
          {runId && <span className="muted mono">run_id: {runId}</span>}
        </div>

        {phase !== "idle" && (
          <>
            <ol className="stepper" style={{ marginTop: 18 }}>
              {STAGES.map((label, i) => { const cls = phase === "success" ? "done" : phase === "error" ? (i < cur ? "done" : i === cur ? "err" : "todo") : (i < cur ? "done" : i === cur ? "active" : "todo"); return (
                <li key={label} className={cls}><span className="step-ico">{cls === "done" ? "✓" : cls === "err" ? "✕" : i + 1}</span><span className="step-name">{label}</span></li>
              ); })}
            </ol>
            <div className="row" style={{ marginTop: 10, gap: 10 }}>
              {status?.result_state && <span className={`badge ${status.success ? "ok" : "err"}`}>{status.result_state}</span>}
              {status?.runPageUrl && <a className="link" href={status.runPageUrl} target="_blank" rel="noreferrer">Databricks <ExternalLink size={13} /></a>}
            </div>
            {logs.length > 0 && (<><div className="logs-head">Logs</div><div className="logs" ref={logRef}>{logs.map((l, i) => <div key={i} className={`log-line ${l.includes("✗") ? "err" : l.includes("✓") ? "ok" : ""}`}>{l}</div>)}</div></>)}
          </>
        )}
      </section>

      {phase === "success" && (
        <section className="card">
          <div className="card-head"><span className="step-num">✓</span><h2>Result</h2></div>
          {status?.details && (
            <div className="meta">
              {Object.entries(status.details).filter(([k]) => k !== "mermaid").slice(0, 12).map(([k, v]) => (
                <div className="meta-row" key={k}><span className="meta-k">{k}</span><span className="meta-v">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span></div>
              ))}
            </div>
          )}
          {status?.outputPath ? (
            <div className="download-block">
              <a className="btn download" href={`/api/dg/download?path=${encodeURIComponent(status.outputPath)}`}><Download size={16} /> Download DG Excel</a>
              <div className="outpath mono">{status.outputPath}</div>
            </div>
          ) : <div className="muted small" style={{ marginTop: 14 }}>Completed. {status?.outputError ? <span className="err-text">{status.outputError}</span> : "No output path returned."}</div>}
        </section>
      )}
    </>
  );
}
