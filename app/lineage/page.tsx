"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Upload, Loader2, Search, Share2, Download, FileSpreadsheet, RefreshCw,
  Lock, GitBranch, AlertTriangle, Table2,
} from "lucide-react";
import { useToast } from "../components/Toast";

const MermaidDiagram = dynamic(() => import("../MermaidDiagram"), { ssr: false });

type Dir = "upstream" | "downstream" | "both";
interface VFile { path: string; name: string; size: number; modified: number }
interface Edge {
  app: string; source_db: string; source_schema: string; source_table: string;
  target_db: string; target_schema: string; target_table: string;
}
interface TraceResp {
  seed: string; direction: Dir;
  counts: { nodes: number; edges: number; levels: number };
  truncated?: boolean;
  nodes: { id: string; table: string; schema: string; db: string; level: number; seed?: boolean }[];
  edges: Edge[];
  mermaid: string;
  ambiguous?: boolean; matches?: string[];
  error?: string;
}

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtDate = (ms: number) => { try { return new Date(ms).toLocaleString(); } catch { return "—"; } };

export default function LineagePage() {
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<VFile[]>([]);
  const [activePath, setActivePath] = useState("");
  const [meta, setMeta] = useState<{ total: number; rows: number; apps: string[] } | null>(null);
  const [tables, setTables] = useState<{ id: string; table: string; schema: string; db: string }[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  const [q, setQ] = useState("");
  const [direction, setDirection] = useState<Dir>("upstream");
  const [tracing, setTracing] = useState(false);
  const [result, setResult] = useState<TraceResp | null>(null);
  const [ambiguous, setAmbiguous] = useState<string[] | null>(null);

  useEffect(() => { loadFiles(); }, []);
  useEffect(() => { if (activePath) loadTables(activePath); }, [activePath]);

  async function loadFiles() {
    try {
      const r = await fetch("/api/lineage/files", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) {
        setFiles(d.files || []);
        if (!activePath && d.files?.length) setActivePath(d.files[0].path);
      }
    } catch {}
  }
  async function loadTables(path: string) {
    setLoadingTables(true); setResult(null); setAmbiguous(null);
    try {
      const r = await fetch(`/api/lineage/tables?path=${encodeURIComponent(path)}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to read workbook");
      setTables(d.tables || []); setMeta({ total: d.total, rows: d.rows, apps: d.apps || [] });
    } catch (e: any) { toast(e?.message || "Failed", "error"); setTables([]); setMeta(null); }
    finally { setLoadingTables(false); }
  }

  function upload() {
    if (!file) return;
    setUploading(true); setUploadPct(0);
    const fd = new FormData(); fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/lineage/upload");
    if (password) xhr.setRequestHeader("x-app-password", password);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      setUploading(false);
      try {
        const d = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          toast(`Uploaded — ${d.rows} lineage row(s)`, "success");
          setUploadPct(100); setActivePath(d.path); loadFiles();
        } else { toast(d.error || "Upload failed", "error"); setUploadPct(0); }
      } catch { toast("Upload failed", "error"); setUploadPct(0); }
    };
    xhr.onerror = () => { setUploading(false); setUploadPct(0); toast("Network error during upload", "error"); };
    xhr.send(fd);
  }

  async function runTrace(tableOverride?: string) {
    const table = (tableOverride ?? q).trim();
    if (!activePath) { toast("Upload or select a lineage workbook first", "error"); return; }
    if (!table) { toast("Enter a target table name", "error"); return; }
    setTracing(true); setResult(null); setAmbiguous(null);
    try {
      const r = await fetch(`/api/lineage/trace?path=${encodeURIComponent(activePath)}&table=${encodeURIComponent(table)}&direction=${direction}`, { cache: "no-store" });
      const d: TraceResp = await r.json();
      if (!r.ok) throw new Error(d.error || "Trace failed");
      if (d.ambiguous) { setAmbiguous(d.matches || []); toast("Multiple matches — pick one", "info"); }
      else { setResult(d); if (tableOverride) setQ(tableOverride); }
    } catch (e: any) { toast(e?.message || "Failed", "error"); }
    finally { setTracing(false); }
  }

  const suggestions = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (!s) return [];
    return tables.filter((t) => t.id.includes(s)).slice(0, 8);
  }, [q, tables]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Data Lineage</h1>
        <p className="tagline">Trace a table back to its sources</p>
        <p className="sub">Upload the lineage workbook (Applications · Target database/schema/table · Source database/schema/table), then search a target table to see its full upstream chain — and download the diagram.</p>
      </div>

      {/* 1 · Upload */}
      <section className="card">
        <div className="card-head"><span className="step-num">1</span><h2>Upload lineage workbook</h2></div>
        <p className="muted small">The file is streamed straight into the Databricks Volume, then parsed into a lineage graph.</p>

        <div className={`drop-zone ${dragging ? "drop-active" : ""}`} style={{ marginTop: 14 }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
          onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { setFile(e.target.files?.[0] || null); setUploadPct(0); }} />
          <Upload size={26} className="drop-ico" />
          <div className="drop-text">{file ? <strong>{file.name}</strong> : <>Drag &amp; drop your <strong>.xlsx</strong>, or <span className="link">browse</span></>}</div>
          {file && <div className="muted small">{fmtBytes(file.size)}</div>}
        </div>
        {(uploading || uploadPct > 0) && <div className="progress" style={{ marginTop: 12 }}><div className="progress-bar" style={{ width: `${uploadPct}%` }} /></div>}

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={upload} disabled={!file || uploading}>
            {uploading ? <><Loader2 size={16} className="spin" /> Uploading… {uploadPct}%</> : <><Upload size={16} /> Upload to Volume</>}
          </button>
          <button className="icon-btn" onClick={loadFiles} title="Refresh files"><RefreshCw size={16} /></button>
        </div>

        {files.length > 0 && (
          <>
            <label style={{ marginTop: 16 }}>Active workbook</label>
            <select value={activePath} onChange={(e) => setActivePath(e.target.value)}>
              {files.map((f) => <option key={f.path} value={f.path}>{f.name} — {fmtDate(f.modified)}</option>)}
            </select>
            {meta && <div className="muted small" style={{ marginTop: 8 }}>{meta.rows} lineage row(s) · {meta.total} target table(s){meta.apps.length ? ` · ${meta.apps.length} application(s)` : ""}</div>}
          </>
        )}
      </section>

      {/* 2 · Trace */}
      <section className="card">
        <div className="card-head"><span className="step-num">2</span><h2>Trace a table</h2></div>
        <p className="muted small">Enter a <b>target table</b> — the tool walks back through its sources, and their sources, recursively.</p>

        <div className="grid" style={{ marginTop: 12 }}>
          <div className="full">
            <label>Target table</label>
            <div className="search" style={{ maxWidth: "none" }}>
              <Search size={14} />
              <input style={{ width: "100%" }} value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runTrace(); }}
                placeholder="e.g. WLS_DLR_RES_FIN_CLLDS_DLY_STG" disabled={loadingTables || !activePath} />
            </div>
            {suggestions.length > 0 && (
              <div className="picklist" style={{ maxHeight: 190 }}>
                {suggestions.map((t) => (
                  <button key={t.id} className="pick-item" style={{ width: "100%", textAlign: "left", background: "none", border: 0, borderBottom: "1px solid var(--line)", cursor: "pointer" }}
                    onClick={() => { setQ(t.id); runTrace(t.id); }}>
                    <Table2 size={14} /> <span className="mono">{t.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label>Direction</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value as Dir)}>
              <option value="upstream">upstream (sources)</option>
              <option value="downstream">downstream (targets)</option>
              <option value="both">both</option>
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={() => runTrace()} disabled={tracing || !activePath}>
            {tracing ? <><Loader2 size={16} className="spin" /> Tracing…</> : <><GitBranch size={16} /> Trace lineage</>}
          </button>
        </div>

        {ambiguous && (
          <div className="note" style={{ marginTop: 14, background: "var(--warn-bg)", color: "var(--warn)", border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)" }}>
            <AlertTriangle size={14} /> Multiple matches — pick one:
            <div className="type-chips" style={{ marginTop: 10 }}>
              {ambiguous.map((m) => <button key={m} className="chip" onClick={() => runTrace(m)}>{m}</button>)}
            </div>
          </div>
        )}
      </section>

      {/* 3 · Results */}
      {result && (
        <section className="card">
          <div className="card-head"><span className="step-num">✓</span><h2>Lineage — {result.seed}</h2></div>

          <div className="stats">
            <Stat n={result.counts.nodes} label="Tables" c="#DA291C" />
            <Stat n={result.counts.edges} label="Relationships" c="#2563eb" />
            <Stat n={result.counts.levels} label="Levels" c="#7c3aed" />
            <Stat n={new Set(result.edges.map((e) => e.app).filter(Boolean)).size} label="Applications" c="#0891b2" />
          </div>

          {result.truncated && <div className="note" style={{ marginTop: 12, background: "var(--warn-bg)", color: "var(--warn)", border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)" }}><AlertTriangle size={14} /> Large graph — diagram truncated.</div>}

          <MermaidDiagram code={result.mermaid} />

          <div className="row" style={{ marginTop: 16 }}>
            <a className="btn download" href={`/api/lineage/export?path=${encodeURIComponent(activePath)}&table=${encodeURIComponent(result.seed)}&direction=${result.direction}`}>
              <Download size={16} /> Download lineage (Excel)
            </a>
            <span className="muted small">Diagram PNG / SVG download is in the toolbar above.</span>
          </div>

          <div className="ltable-wrap" style={{ marginTop: 18 }}>
            <table className="ltable">
              <thead><tr><th>Applications</th><th>Source database</th><th>Source schema</th><th>Source table</th><th>Target database</th><th>Target schema</th><th>Target table</th></tr></thead>
              <tbody>
                {result.edges.map((e, i) => (
                  <tr key={i}>
                    <td>{e.app || "—"}</td>
                    <td>{e.source_db || "—"}</td><td>{e.source_schema || "—"}</td><td className="mono">{e.source_table}</td>
                    <td>{e.target_db || "—"}</td><td>{e.target_schema || "—"}</td><td className="mono">{e.target_table}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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

function Stat({ n, label, c }: { n: number; label: string; c: string }) {
  return <div className="stat"><div className="stat-ico" style={{ background: c }}><Share2 size={16} /></div><div className="stat-val">{n}</div><div className="stat-lbl">{label}</div></div>;
}
