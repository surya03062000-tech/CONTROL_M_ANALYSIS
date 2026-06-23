"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download, Upload, Loader2, FileSpreadsheet, Play, Database, CheckCircle2, Search,
  ExternalLink, RotateCcw, Lock, RefreshCw, Ban, Eye, History, X, ChevronDown,
} from "lucide-react";
import { useToast } from "../components/Toast";

type Phase = "idle" | "running" | "success" | "error";
const STAGES = ["Queued", "Running", "Completed"] as const;
type VFile = { path: string; name: string; size: number; modified: number };
const fmtDate = (ms: number) => { try { return new Date(ms).toLocaleString(); } catch { return "—"; } };

export default function DgPage() {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  return (
    <div className="page">
      <div className="page-head">
        <h1>DG Document Creation</h1>
        <p className="tagline">Data Governance documentation — edl_qa</p>
        <p className="sub">Step 1: create tables from a spreadsheet. Step 2: generate DG documents. Step 3: review &amp; download.</p>
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
interface RowResult { schema: string; table: string; status: string; detail: string; cols: number; }
function Step1({ password, toast }: { password: string; toast: (m: string, k?: any) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [rows, setRows] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [showLog, setShowLog] = useState(false);
  const [uploads, setUploads] = useState<VFile[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadUploads(); }, []);
  async function loadUploads() { try { const r = await fetch("/api/dg/uploads", { cache: "no-store" }); const d = await r.json(); if (r.ok) setUploads(d.files || []); } catch {} }

  async function run() {
    if (!file) return;
    setBusy(true); setLog([]); setRows([]); setProgress(null); setSummary(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/dg/upload", { method: "POST", headers: password ? { "x-app-password": password } : {}, body: fd });
      if (!res.ok || !res.body) { throw new Error((await res.text()) || `Failed (${res.status})`); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const ln of lines) {
          if (!ln.trim()) continue;
          let e: any; try { e = JSON.parse(ln); } catch { continue; }
          if (e.t === "log") setLog((L) => [...L, e.line]);
          else if (e.t === "row") setRows((R) => [...R, e]);
          else if (e.t === "progress") setProgress({ done: e.done, total: e.total });
          else if (e.t === "summary") setSummary(e);
          else if (e.t === "done") { /* finished */ }
        }
      }
      toast("Table creation finished", "success"); loadUploads();
    } catch (e: any) { setLog((L) => [...L, `✗ ${e?.message || e}`]); toast(e?.message || "Failed", "error"); }
    finally { setBusy(false); }
  }

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="card">
      <div className="card-head"><span className="step-num">1</span><h2>Create tables from spreadsheet</h2></div>
      <p className="muted small">Download the template, fill it (Schema · Table · Column · Data Type — 100+ tables OK), then upload. Tables are created in <b>edl_qa</b>.</p>

      <div className="row" style={{ marginTop: 12 }}><a className="btn secondary sm" href="/api/dg/template"><Download size={15} /> Download template</a></div>

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
        {progress && <span className="muted small">{progress.done}/{progress.total} tables</span>}
      </div>

      {progress && (progress.done < progress.total || busy) && <div className="progress" style={{ marginTop: 12 }}><div className="progress-bar" style={{ width: `${pct}%` }} /></div>}

      {summary && (
        <div className="stats five" style={{ marginTop: 16 }}>
          <Tile n={summary.schemas} label="Schemas" c="#334155" />
          <Tile n={summary.created} label="Created" c="#16a34a" />
          <Tile n={summary.altered} label="Altered" c="#2563eb" />
          <Tile n={summary.existing} label="Unchanged" c="#64748b" />
          <Tile n={summary.errors} label="Errors" c={summary.errors ? "#dc2626" : "#64748b"} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="ltable-wrap" style={{ marginTop: 16 }}>
          <table className="ltable">
            <thead><tr><th>Schema.Table</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}><td className="mono">{r.schema}.{r.table}</td>
                <td><span className={`tpill ${r.status === "created" ? "t-planned" : r.status === "altered" ? "t-sick" : r.status === "error" ? "t-holiday" : "t-unplanned"}`}>{r.status}</span></td>
                <td className="muted small">{r.detail}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {log.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button className="linkbtn" onClick={() => setShowLog((v) => !v)}><ChevronDown size={13} /> {showLog ? "Hide" : "Show"} logs ({log.length})</button>
          {showLog && <div className="logs" style={{ marginTop: 8 }}>{log.map((l, i) => <div key={i} className={`log-line ${l.startsWith("✗") ? "err" : l.startsWith("✓") ? "ok" : ""}`}>{l}</div>)}</div>}
        </div>
      )}

      {uploads.length > 0 && (
        <details className="source" style={{ marginTop: 16 }}>
          <summary><History size={13} /> Recent uploads ({uploads.length})</summary>
          <div className="hist" style={{ marginTop: 10 }}>
            {uploads.map((u) => (
              <div key={u.path} className="hist-item"><FileSpreadsheet size={16} className="hist-ico" />
                <div className="hist-meta"><div className="hist-name">{u.name}</div><div className="muted small">{fmtDate(u.modified)}</div></div></div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
function Tile({ n, label, c }: { n: number; label: string; c: string }) {
  return <div className="stat"><div className="stat-ico" style={{ background: c }}><Database size={16} /></div><div className="stat-val">{n ?? 0}</div><div className="stat-lbl">{label}</div></div>;
}

/* ── Step 2: DG document creation ───────────────────────────────────────── */
function Step2({ password, toast }: { password: string; toast: (m: string, k?: any) => void }) {
  const [schemas, setSchemas] = useState<string[]>([]);
  const [schemaQ, setSchemaQ] = useState("");
  const [selSchemas, setSelSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<{ schema: string; table: string }[]>([]);
  const [selTables, setSelTables] = useState<Set<string>>(new Set());
  const [tq, setTq] = useState("");
  const [desc, setDesc] = useState("");
  const [perDesc, setPerDesc] = useState<Record<string, string>>({});
  const [showPer, setShowPer] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<Record<string, string>>({});
  const [loadingSch, setLoadingSch] = useState(false);
  const [loadingTab, setLoadingTab] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState<number | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [recent, setRecent] = useState<VFile[]>([]);
  const [preview, setPreview] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSchemas(); loadRecent();
    try { setPresets(JSON.parse(localStorage.getItem("dg-desc-presets") || "{}")); } catch {}
    try { const r = JSON.parse(localStorage.getItem("dg-run") || "null"); if (r?.runId) { setRunId(r.runId); setPhase("running"); startPolling(r.runId); } } catch {}
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { loadTables(selSchemas); /* eslint-disable-next-line */ }, [selSchemas]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs]);

  async function loadSchemas() { setLoadingSch(true); try { const r = await fetch("/api/dg/schemas", { cache: "no-store" }); const d = await r.json(); if (r.ok) setSchemas(d.schemas || []); else toast(d.error || "Failed to load schemas", "error"); } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setLoadingSch(false); } }
  async function loadTables(schs: string[]) { if (!schs.length) { setTables([]); return; } setLoadingTab(true); try { const r = await fetch(`/api/dg/tables?schemas=${encodeURIComponent(schs.join(","))}`, { cache: "no-store" }); const d = await r.json(); if (r.ok) setTables(d.tables || []); } catch {} finally { setLoadingTab(false); } }
  async function loadRecent() { try { const r = await fetch("/api/dg/runs", { cache: "no-store" }); const d = await r.json(); if (r.ok) setRecent(d.files || []); } catch {} }

  function toggleSchema(s: string) { setSelSchemas((x) => x.includes(s) ? x.filter((y) => y !== s) : [...x, s]); }
  function toggleTable(key: string) { setSelTables((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; }); }
  function selectAllInView(keys: string[]) { setSelTables((s) => { const n = new Set(s); const allSel = keys.every((k) => n.has(k)); keys.forEach((k) => allSel ? n.delete(k) : n.add(k)); return n; }); }

  const filteredSchemas = useMemo(() => schemas.filter((s) => s.toLowerCase().includes(schemaQ.toLowerCase())), [schemas, schemaQ]);
  const filteredTables = useMemo(() => tables.filter((t) => `${t.schema}.${t.table}`.toLowerCase().includes(tq.toLowerCase())), [tables, tq]);
  const filteredKeys = filteredTables.map((t) => `${t.schema}.${t.table}`);
  const log = (s: string) => setLogs((L) => [...L, `${new Date().toLocaleTimeString()}  ${s}`]);

  function startPolling(id: number) {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const r = await fetch(`/api/dg/status?runId=${id}`, { cache: "no-store" }); const d = await r.json();
        if (!r.ok) throw new Error(d.error || "status error");
        setStatus(d); log(`state: ${d.life_cycle_state}${d.message ? " — " + d.message : ""}`);
        if (d.done) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase(d.success ? "success" : "error");
          try { localStorage.removeItem("dg-run"); } catch {}
          if (d.success) { toast("DG document ready", "success"); loadRecent(); } else toast(d.message || "Job failed", "error");
        }
      } catch (e: any) { if (pollRef.current) clearInterval(pollRef.current); setPhase("error"); log(`✗ ${e?.message || e}`); }
    };
    tick(); pollRef.current = setInterval(tick, 3000);
  }

  async function create() {
    const sch = selSchemas.join(",");
    const tbl = [...selTables].join(",");
    if (!sch) { toast("Select at least one schema", "error"); return; }
    if (!selTables.size) { toast("Select at least one table", "error"); return; }
    if (desc.trim().length < 10) { toast("Business description must be at least 10 characters", "error"); return; }
    // per-table overrides → JSON payload, else plain string
    const overrides = [...selTables].filter((k) => perDesc[k]?.trim());
    const descPayload = overrides.length ? JSON.stringify({ _default: desc.trim(), ...Object.fromEntries(overrides.map((k) => [k, perDesc[k].trim()])) }) : desc.trim();
    setPhase("running"); setStatus(null); setLogs([]); setRunId(null); log("submitting…");
    try {
      const r = await fetch("/api/dg/create", { method: "POST", headers: { "Content-Type": "application/json", ...(password ? { "x-app-password": password } : {}) }, body: JSON.stringify({ schemas: sch, tables: tbl, description: descPayload }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed");
      setRunId(d.run_id); log(`triggered job · run ${d.run_id}`);
      try { localStorage.setItem("dg-run", JSON.stringify({ runId: d.run_id, at: Date.now() })); } catch {}
      startPolling(d.run_id);
    } catch (e: any) { setPhase("error"); log(`✗ ${e?.message || e}`); toast(e?.message || "Failed", "error"); }
  }
  async function cancel() { if (!runId) return; try { const r = await fetch("/api/dg/cancel", { method: "POST", headers: { "Content-Type": "application/json", ...(password ? { "x-app-password": password } : {}) }, body: JSON.stringify({ runId }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); toast("Cancel requested", "info"); } catch (e: any) { toast(e?.message || "Failed", "error"); } }
  function reset() { if (pollRef.current) clearInterval(pollRef.current); setPhase("idle"); setRunId(null); setStatus(null); setLogs([]); try { localStorage.removeItem("dg-run"); } catch {} }

  function savePreset() { if (!presetName.trim() || desc.trim().length < 10) { toast("Enter a name and a description (10+ chars)", "error"); return; } const p = { ...presets, [presetName.trim()]: desc.trim() }; setPresets(p); try { localStorage.setItem("dg-desc-presets", JSON.stringify(p)); } catch {} setPresetName(""); toast("Preset saved", "success"); }
  async function openPreview(path: string, name: string) { try { const r = await fetch(`/api/dg/preview?path=${encodeURIComponent(path)}`, { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); setPreview({ name, headers: d.headers || [], rows: d.rows || [] }); } catch (e: any) { toast(e?.message || "Preview failed", "error"); } }

  const cur = phase === "success" ? 2 : phase === "running" ? (status?.life_cycle_state === "RUNNING" || status?.life_cycle_state === "TERMINATING" ? 1 : 0) : phase === "error" ? 1 : 0;
  const busy = phase === "running";

  return (
    <>
      <section className="card">
        <div className="card-head"><span className="step-num">2</span><h2>Generate DG document</h2>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={loadSchemas} title="Refresh"><RefreshCw size={16} className={loadingSch ? "spin" : ""} /></button>
        </div>

        <div className="row" style={{ gap: 10, marginBottom: 10 }}><span className="muted small">Catalog</span><span className="tpill t-sick">edl_qa</span></div>

        <label>Schema(s)</label>
        {schemas.length > 6 && <div className="search" style={{ maxWidth: 260, marginBottom: 8 }}><Search size={14} /><input value={schemaQ} onChange={(e) => setSchemaQ(e.target.value)} placeholder="Filter schemas…" /></div>}
        {loadingSch ? <div className="muted small">Loading…</div> : filteredSchemas.length === 0 ? <div className="muted small">No schemas.</div> : (
          <div className="type-chips">{filteredSchemas.map((s) => <button key={s} className={`chip ${selSchemas.includes(s) ? "active" : ""}`} onClick={() => toggleSchema(s)}>{s}</button>)}</div>
        )}

        <div className="row" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <label style={{ margin: 0 }}>Table(s) {selTables.size > 0 && <span className="muted">· {selTables.size} selected</span>}</label>
          {!!filteredKeys.length && <button className="linkbtn" onClick={() => selectAllInView(filteredKeys)}>{filteredKeys.every((k) => selTables.has(k)) ? "Clear shown" : "Select all shown"}</button>}
        </div>
        <div className="search" style={{ maxWidth: 280, marginTop: 6 }}><Search size={14} /><input value={tq} onChange={(e) => setTq(e.target.value)} placeholder="Filter tables…" /></div>
        <div className="picklist">
          {!selSchemas.length ? <div className="muted small" style={{ padding: 10 }}>Select schema(s) first.</div>
            : loadingTab ? <div className="muted small" style={{ padding: 10 }}>Loading tables…</div>
            : filteredTables.length === 0 ? <div className="muted small" style={{ padding: 10 }}>No tables.</div>
            : filteredTables.map((t) => { const key = `${t.schema}.${t.table}`; return (
              <label key={key} className="pick-item"><input type="checkbox" checked={selTables.has(key)} onChange={() => toggleTable(key)} /><span className="mono">{key}</span></label>
            ); })}
        </div>

        <label style={{ marginTop: 16 }}>Business description <span className="muted">(applies to all, min 10 chars)</span></label>
        <textarea className="ta" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the business purpose of these tables…" />
        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          {Object.keys(presets).length > 0 && (
            <select style={{ width: "auto" }} defaultValue="" onChange={(e) => { if (e.target.value) setDesc(presets[e.target.value]); }}>
              <option value="">Load preset…</option>
              {Object.keys(presets).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <input style={{ maxWidth: 180 }} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" />
          <button className="btn ghost sm" onClick={savePreset}>Save preset</button>
        </div>

        {selTables.size > 0 && (
          <details className="source" style={{ marginTop: 12 }} open={showPer} onToggle={(e) => setShowPer((e.target as HTMLDetailsElement).open)}>
            <summary>Per-table descriptions (optional)</summary>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {[...selTables].map((k) => (
                <div key={k}><label className="mono" style={{ textTransform: "none" }}>{k}</label>
                  <input value={perDesc[k] || ""} onChange={(e) => setPerDesc((p) => ({ ...p, [k]: e.target.value }))} placeholder="(uses the description above if blank)" /></div>
              ))}
            </div>
          </details>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={create} disabled={busy}>{busy ? <><Loader2 size={16} className="spin" /> Running…</> : <><Play size={16} /> Create DG Document</>}</button>
          {busy && runId && <button className="btn danger sm" onClick={cancel}><Ban size={14} /> Cancel</button>}
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
            <div className="meta">{Object.entries(status.details).filter(([k]) => k !== "mermaid").slice(0, 12).map(([k, v]) => (
              <div className="meta-row" key={k}><span className="meta-k">{k}</span><span className="meta-v">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span></div>))}</div>
          )}
          {status?.outputPath ? (
            <div className="download-block">
              <div className="row">
                <a className="btn download" href={`/api/dg/download?path=${encodeURIComponent(status.outputPath)}`}><Download size={16} /> Download DG Excel</a>
                <button className="btn ghost sm" onClick={() => openPreview(status.outputPath, status.outputPath.split("/").pop())}><Eye size={15} /> Preview</button>
              </div>
              <div className="outpath mono">{status.outputPath}</div>
            </div>
          ) : <div className="muted small" style={{ marginTop: 14 }}>Completed. {status?.outputError ? <span className="err-text">{status.outputError}</span> : "No output path returned."}</div>}
        </section>
      )}

      <section className="card">
        <div className="card-head"><span className="step-num"><History size={15} /></span><h2>Recent DG documents</h2>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={loadRecent} title="Refresh"><RefreshCw size={16} /></button>
        </div>
        {recent.length === 0 ? <div className="muted small">No DG documents yet.</div> : (
          <div className="hist">{recent.map((f) => (
            <div key={f.path} className="hist-item"><FileSpreadsheet size={18} className="hist-ico" />
              <div className="hist-meta"><div className="hist-name">{f.name}</div><div className="muted small">{fmtDate(f.modified)}</div></div>
              <button className="btn ghost sm" onClick={() => openPreview(f.path, f.name)}><Eye size={14} /></button>
              <a className="btn sm download" href={`/api/dg/download?path=${encodeURIComponent(f.path)}`}><Download size={14} /></a></div>
          ))}</div>
        )}
      </section>

      {preview && (
        <div className="modal-scrim" onClick={() => setPreview(null)}>
          <div className="modal" style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><strong>{preview.name}</strong><button className="icon-btn" onClick={() => setPreview(null)}><X size={16} /></button></div>
            <div className="modal-body">
              <div className="ltable-wrap" style={{ maxHeight: "60vh" }}>
                <table className="ltable"><thead><tr>{preview.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                  <tbody>{preview.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
              </div>
              {preview.rows.length === 0 && <div className="muted small">No rows.</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
