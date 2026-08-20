"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Upload, Loader2, Search, Share2, Download, RefreshCw, Lock, GitBranch,
  AlertTriangle, Table2, Eye, Link2, ShieldCheck, X, Zap, Database,
} from "lucide-react";
import { useToast } from "../components/Toast";
import TiltCard from "../components/TiltCard";

const MermaidDiagram = dynamic(() => import("../MermaidDiagram"), { ssr: false });

type Dir = "upstream" | "downstream" | "both" | "overall";
interface VFile { path: string; name: string; size: number; modified: number }
interface Dataset { dataset: string; edges: number; loaded_at: string }
interface Quality {
  totalRows: number; validEdges: number; skipped: number; missingSourceTable: number;
  missingTargetTable: number; emptyRows: number; missingApp: number; missingSchema: number;
  missingDatabase: number; duplicateEdges: number; selfReferences: number; cyclePairs: number;
  issues: { row: number; issue: string; detail: string }[];
}
interface Edge {
  app: string; cycle?: boolean;
  source_db: string; source_schema: string; source_table: string;
  target_db: string; target_schema: string; target_table: string;
}
interface SchemaCount {
  schema: string; stgCount: number; appCount: number; totalCount: number;
  stgTables: string[]; appTables: string[];
}
interface TraceResp {
  seeds: string[]; direction: Dir; depth: number;
  counts: { nodes: number; edges: number; levels: number; apps: number; shared: number; backEdges: number };
  truncated?: boolean; nodes: any[]; edges: Edge[]; mermaid: string;
  idMap: Record<string, string>; appColors: Record<string, string>;
  schemas?: SchemaCount[];
  ambiguous?: boolean; matches?: string[]; error?: string;
}

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtDate = (ms: number) => { try { return new Date(ms).toLocaleString(); } catch { return "—"; } };
// On-screen table lists are capped for readability (schemas can have 40+ tables);
// the Excel export always has the full list.
const tableList = (names: string[], max = 8) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} … +${names.length - max} more`;

export default function LineagePage() {
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [storing, setStoring] = useState(false);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [qualityFor, setQualityFor] = useState("");
  const [showIssues, setShowIssues] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<VFile[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [ref, setRef] = useState("");
  const [meta, setMeta] = useState<{ total: number; rows: number; apps: string[]; counts: any } | null>(null);
  const [tables, setTables] = useState<{ id: string; isTarget: boolean }[]>([]);
  const [scopeAll, setScopeAll] = useState(false);

  const [q, setQ] = useState("");
  const [seeds, setSeeds] = useState<string[]>([]);
  const [direction, setDirection] = useState<Dir>("upstream");
  const [depth, setDepth] = useState(0);
  const [selApps, setSelApps] = useState<string[]>([]);
  const [layout, setLayout] = useState<"LR" | "TB">("LR");
  const [group, setGroup] = useState<"none" | "schema" | "app">("none");
  const [colorBy, setColorBy] = useState<"role" | "app">("role");
  const [tracing, setTracing] = useState(false);
  const [result, setResult] = useState<TraceResp | null>(null);
  const [ambiguous, setAmbiguous] = useState<string[] | null>(null);
  const bootstrapped = useRef(false);

  useEffect(() => { loadSources(); }, []);
  useEffect(() => { if (ref) loadTables(ref, scopeAll); }, [ref, scopeAll]);

  async function loadSources() {
    try {
      const r = await fetch("/api/lineage/files", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) return;
      setFiles(d.files || []); setDatasets(d.datasets || []);
      if (!ref) {
        const url = new URL(window.location.href);
        const p = url.searchParams.get("path");
        const first = d.datasets?.[0] ? `delta:${d.datasets[0].dataset}` : d.files?.[0]?.path;
        if (p) setRef(p); else if (first) setRef(first);
      }
    } catch {}
  }
  async function loadTables(r0: string, all: boolean) {
    setResult(null); setAmbiguous(null);
    try {
      const r = await fetch(`/api/lineage/tables?path=${encodeURIComponent(r0)}&scope=${all ? "all" : "targets"}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to read dataset");
      setTables(d.tables || []); setMeta({ total: d.total, rows: d.rows, apps: d.apps || [], counts: d.counts });
      // #23 deep link: restore a trace from the URL once the dataset is loaded
      if (!bootstrapped.current) {
        bootstrapped.current = true;
        const url = new URL(window.location.href);
        const t = url.searchParams.get("table");
        if (t) {
          const dir = (url.searchParams.get("direction") as Dir) || "upstream";
          setDirection(dir); setQ(t);
          runTrace(t.split(",").map((x) => x.trim()).filter(Boolean), { direction: dir, ref: r0 });
        }
      }
    } catch (e: any) { toast(e?.message || "Failed", "error"); setTables([]); setMeta(null); }
  }

  function sendFile(mode: "preview" | "upload" | "store") {
    if (!file) return;
    if (mode === "preview") setPreviewing(true);
    else if (mode === "store") setStoring(true);
    else { setUploading(true); setUploadPct(0); }
    const fd = new FormData(); fd.append("file", file); fd.append("mode", mode);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/lineage/upload");
    if (password) xhr.setRequestHeader("x-app-password", password);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && mode === "upload") setUploadPct(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      setPreviewing(false); setUploading(false); setStoring(false);
      try {
        const d = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setQuality(d.quality); setQualityFor(d.name || file.name);
          if (mode === "preview") toast(`Preview — ${d.quality.validEdges} edge(s), ${d.quality.skipped} skipped`, "info");
          else if (mode === "store") {
            toast(`Indexed ${d.stored} edge(s) into Delta`, "success");
            loadSources().then(() => setRef(`delta:${d.dataset}`));
          } else {
            toast(`Uploaded to Volume — ${d.quality.validEdges} edge(s)`, "success");
            setUploadPct(100);
            loadSources().then(() => setRef(d.path));
          }
        } else {
          toast(d.error || (mode === "store" ? "Store failed" : "Upload failed"), "error");
          if (d.quality) { setQuality(d.quality); setQualityFor(file.name); }
          if (mode === "upload") setUploadPct(0);
        }
      } catch { toast("Request failed", "error"); setUploadPct(0); }
    };
    xhr.onerror = () => { setPreviewing(false); setUploading(false); setStoring(false); setUploadPct(0); toast("Network error", "error"); };
    xhr.send(fd);
  }

  const runTrace = useCallback(async (tbls: string[], over?: { direction?: Dir; ref?: string }) => {
    const useRef0 = over?.ref ?? ref;
    const dir = over?.direction ?? direction;
    if (!useRef0) { toast("Upload or select a dataset first", "error"); return; }
    if (!tbls.length) { toast("Enter a table name", "error"); return; }
    setTracing(true); setResult(null); setAmbiguous(null);
    try {
      const p = new URLSearchParams({
        path: useRef0, table: tbls.join(","), direction: dir,
        depth: String(depth), layout, group, colorBy,
      });
      if (selApps.length) p.set("apps", selApps.join(","));
      const r = await fetch(`/api/lineage/trace?${p}`, { cache: "no-store" });
      const d: TraceResp = await r.json();
      if (!r.ok) throw new Error(d.error || "Trace failed");
      if (d.ambiguous) { setAmbiguous(d.matches || []); toast("Multiple matches — pick one", "info"); }
      else {
        setResult(d); setSeeds(d.seeds);
        const url = new URL(window.location.href);
        url.searchParams.set("path", useRef0);
        url.searchParams.set("table", d.seeds.join(","));
        url.searchParams.set("direction", dir);
        window.history.replaceState({}, "", url.toString());
      }
    } catch (e: any) { toast(e?.message || "Failed", "error"); }
    finally { setTracing(false); }
  }, [ref, direction, depth, layout, group, colorBy, selApps, toast]);

  const suggestions = useMemo(() => {
    const s = q.split(",").pop()!.trim().toUpperCase();
    if (!s) return [];
    return tables.filter((t) => t.id.includes(s)).slice(0, 8);
  }, [q, tables]);

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href).then(
      () => toast("Link copied", "success"), () => toast("Copy failed", "error"));
  };

  const qualityBad = quality && (quality.skipped > 0 || quality.duplicateEdges > 0 || quality.selfReferences > 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Data Lineage</h1>
        <p className="tagline">Trace a table back to its sources</p>
        <p className="sub">Upload the lineage workbook, then trace any table through its full chain — filter by application, control depth, compare tables, and download the diagram.</p>
      </div>

      {/* 1 · Upload */}
      <section className="card">
        <div className="card-head"><span className="step-num">1</span><h2>Upload lineage workbook</h2></div>
        <p className="muted small">Stored in the Databricks Volume and indexed into a Delta table. Preview first to check data quality.</p>

        <div className="row" style={{ marginTop: 12 }}>
          <a className="btn secondary sm" href="/api/lineage/template"><Download size={15} /> Download template</a>
        </div>

        <div className={`drop-zone ${dragging ? "drop-active" : ""}`} style={{ marginTop: 14 }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setQuality(null); } }}
          onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { setFile(e.target.files?.[0] || null); setUploadPct(0); setQuality(null); }} />
          <Upload size={26} className="drop-ico" />
          <div className="drop-text">{file ? <strong>{file.name}</strong> : <>Drag &amp; drop your <strong>.xlsx</strong>, or <span className="link">browse</span></>}</div>
          {file && <div className="muted small">{fmtBytes(file.size)}</div>}
        </div>
        {(uploading || uploadPct > 0) && <div className="progress" style={{ marginTop: 12 }}><div className="progress-bar" style={{ width: `${uploadPct}%` }} /></div>}

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={() => sendFile("preview")} disabled={!file || previewing || uploading || storing}>
            {previewing ? <><Loader2 size={16} className="spin" /> Checking…</> : <><Eye size={16} /> Preview &amp; check</>}
          </button>
          <button className="btn primary" onClick={() => sendFile("upload")} disabled={!file || uploading || previewing || storing}>
            {uploading ? <><Loader2 size={16} className="spin" /> Uploading… {uploadPct}%</> : <><Upload size={16} /> Upload to Volume</>}
          </button>
          <button className="btn secondary" onClick={() => sendFile("store")} disabled={!file || uploading || previewing || storing}>
            {storing ? <><Loader2 size={16} className="spin" /> Storing…</> : <><Database size={16} /> Store to Delta</>}
          </button>
          <button className="icon-btn" onClick={loadSources} title="Refresh"><RefreshCw size={16} /></button>
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>
          <b>Preview</b> checks the sheet without saving · <b>Upload</b> saves the workbook to the Databricks Volume · <b>Store</b> indexes the rows into the Delta lineage table.
        </div>

        {quality && (
          <div style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong style={{ fontSize: 14 }}>Data quality — {qualityFor}</strong>
              {qualityBad ? <span className="badge err">{quality.skipped + quality.duplicateEdges + quality.selfReferences} issue(s)</span> : <span className="badge ok">clean</span>}
            </div>
            <div className="stats five" style={{ marginTop: 12 }}>
              <QTile n={quality.validEdges} label="Valid edges" c="#16a34a" />
              <QTile n={quality.skipped} label="Skipped rows" c={quality.skipped ? "#d97706" : "#64748b"} />
              <QTile n={quality.duplicateEdges} label="Duplicates" c={quality.duplicateEdges ? "#d97706" : "#64748b"} />
              <QTile n={quality.selfReferences} label="Self refs" c={quality.selfReferences ? "#dc2626" : "#64748b"} />
              <QTile n={quality.cyclePairs} label="Cycles" c={quality.cyclePairs ? "#7c3aed" : "#64748b"} />
            </div>
            <div className="muted small" style={{ marginTop: 8 }}>
              {quality.totalRows} data row(s) · {quality.missingSourceTable} missing source table · {quality.missingTargetTable} missing target table · {quality.missingApp} missing application
            </div>
            {quality.issues.length > 0 && (
              <>
                <button className="linkbtn" style={{ marginTop: 8 }} onClick={() => setShowIssues((v) => !v)}>
                  {showIssues ? "Hide" : "Show"} skipped rows ({quality.issues.length})
                </button>
                {showIssues && (
                  <div className="ltable-wrap" style={{ marginTop: 8, maxHeight: 240 }}>
                    <table className="ltable"><thead><tr><th>Row</th><th>Issue</th><th>Detail</th></tr></thead>
                      <tbody>{quality.issues.map((i, k) => <tr key={k}><td>{i.row}</td><td>{i.issue}</td><td className="mono">{i.detail}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {(datasets.length > 0 || files.length > 0) && (
          <>
            <label style={{ marginTop: 18 }}>Active dataset</label>
            <select value={ref} onChange={(e) => setRef(e.target.value)}>
              {datasets.map((d) => <option key={d.dataset} value={`delta:${d.dataset}`}>◆ {d.dataset} — {d.edges} edges (Delta)</option>)}
              {files.map((f) => <option key={f.path} value={f.path}>{f.name} — {fmtDate(f.modified)}</option>)}
            </select>
            {meta && (
              <div className="muted small" style={{ marginTop: 8 }}>
                {meta.rows} edge(s) · {meta.counts?.tables} table(s) · {meta.counts?.targets} target(s) · {meta.counts?.roots} root(s) · {meta.counts?.leaves} leaf table(s)
              </div>
            )}
          </>
        )}
      </section>

      {/* 2 · Trace */}
      <section className="card">
        <div className="card-head"><span className="step-num">2</span><h2>Trace</h2></div>

        <div className="grid">
          <div className="full">
            <label>Table(s) <span className="muted">— comma-separate two tables to compare their chains</span></label>
            <div className="search" style={{ maxWidth: "none" }}>
              <Search size={14} />
              <input style={{ width: "100%" }} value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runTrace(q.split(",").map((x) => x.trim()).filter(Boolean)); }}
                placeholder="e.g. WLS_DLR_RES_FIN_CLLDS_DLY_STG" disabled={!ref} />
            </div>
            <label className="row" style={{ gap: 8, marginTop: 8, cursor: "pointer", textTransform: "none" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={scopeAll} onChange={(e) => setScopeAll(e.target.checked)} />
              <span className="muted small">Include source-only tables in suggestions</span>
            </label>
            {suggestions.length > 0 && (
              <div className="picklist" style={{ maxHeight: 190 }}>
                {suggestions.map((t) => (
                  <button key={t.id} className="pick-item" style={{ width: "100%", textAlign: "left", background: "none", border: 0, borderBottom: "1px solid var(--line)", cursor: "pointer" }}
                    onClick={() => { setQ(t.id); runTrace([t.id]); }}>
                    <Table2 size={14} /> <span className="mono">{t.id}</span>
                    {!t.isTarget && <span className="tpill t-sick" style={{ marginLeft: "auto" }}>source only</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label>Direction</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value as Dir)}>
              <option value="upstream">upstream (sources)</option>
              <option value="downstream">downstream (impact)</option>
              <option value="both">both (upstream + downstream)</option>
              <option value="overall">Overall Analysis</option>
            </select>
          </div>
          <div>
            <label>Depth</label>
            <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
              <option value={0}>unlimited</option>
              <option value={1}>1 level</option>
              <option value={2}>2 levels</option>
              <option value={3}>3 levels</option>
              <option value={5}>5 levels</option>
            </select>
          </div>
          <div>
            <label>Layout</label>
            <select value={layout} onChange={(e) => setLayout(e.target.value as any)}>
              <option value="LR">left → right</option>
              <option value="TB">top → bottom</option>
            </select>
          </div>
          <div>
            <label>Group by</label>
            <select value={group} onChange={(e) => setGroup(e.target.value as any)}>
              <option value="none">none</option>
              <option value="schema">schema</option>
              <option value="app">application</option>
            </select>
          </div>
          <div>
            <label>Colour by</label>
            <select value={colorBy} onChange={(e) => setColorBy(e.target.value as any)}>
              <option value="role">role (seed / chain)</option>
              <option value="app">application</option>
            </select>
          </div>

          {!!meta?.apps.length && (
            <div className="full">
              <label>Applications <span className="muted">(blank = all)</span></label>
              <div className="type-chips">
                {meta.apps.map((a) => (
                  <button key={a} className={`chip ${selApps.includes(a) ? "active" : ""}`}
                    onClick={() => setSelApps((x) => x.includes(a) ? x.filter((y) => y !== a) : [...x, a])}>{a}</button>
                ))}
                {selApps.length > 0 && <button className="chip" onClick={() => setSelApps([])}>clear</button>}
              </div>
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={() => runTrace(q.split(",").map((x) => x.trim()).filter(Boolean))} disabled={tracing || !ref}>
            {tracing ? <><Loader2 size={16} className="spin" /> Tracing…</> : <><GitBranch size={16} /> Trace lineage</>}
          </button>
          <button className="btn ghost sm" onClick={() => { setDirection("downstream"); runTrace(q.split(",").map((x) => x.trim()).filter(Boolean), { direction: "downstream" }); }} disabled={tracing || !ref}>
            <Zap size={15} /> Impact analysis
          </button>
        </div>

        {ambiguous && (
          <div className="note" style={{ marginTop: 14, background: "var(--warn-bg)", color: "var(--warn)", border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)" }}>
            <AlertTriangle size={14} /> Multiple matches — pick one:
            <div className="type-chips" style={{ marginTop: 10 }}>
              {ambiguous.map((m) => <button key={m} className="chip" onClick={() => { setQ(m); runTrace([m]); }}>{m}</button>)}
            </div>
          </div>
        )}
      </section>

      {/* 3 · Results */}
      {result && (
        <section className="card">
          <div className="card-head">
            <span className="step-num">✓</span>
            <h2>{result.seeds.length > 1 ? `${result.seeds.length} tables` : result.seeds[0]}</h2>
            <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={copyLink} title="Copy shareable link"><Link2 size={16} /></button>
          </div>

          <div className="stats five">
            <QTile n={result.counts.nodes} label="Tables" c="#DA291C" />
            <QTile n={result.counts.edges} label="Relationships" c="#2563eb" />
            <QTile n={result.counts.levels} label="Levels" c="#7c3aed" />
            <QTile n={result.counts.apps} label="Applications" c="#0891b2" />
            <QTile n={result.seeds.length > 1 ? result.counts.shared : result.counts.backEdges} label={result.seeds.length > 1 ? "Shared" : "Cycle edges"} c="#d97706" />
          </div>

          {result.truncated && <div className="note" style={{ marginTop: 12, background: "var(--warn-bg)", color: "var(--warn)", border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)" }}><AlertTriangle size={14} /> Large graph — truncated. Reduce depth or filter by application.</div>}

          {!!result.schemas?.length && (
            <div style={{ marginTop: 18 }}>
              <strong style={{ fontSize: 14 }}>Target Table: <span className="mono">{result.seeds.join(", ")}</span></strong>
              <div className="muted small" style={{ marginTop: 2 }}>Dependency tables by schema (staging vs application), excluding the target itself.</div>
              <div className="ltable-wrap" style={{ marginTop: 10 }}>
                <table className="ltable">
                  <thead><tr><th>Schema</th><th>Category</th><th>Count</th><th>Tables</th></tr></thead>
                  <tbody>
                    {result.schemas.flatMap((s) => {
                      const rows: React.ReactNode[] = [];
                      if (s.stgCount > 0) rows.push(
                        <tr key={s.schema + "-stg"}>
                          <td className="mono">{s.schema}</td>
                          <td><span className="tpill t-sick">Stg tables</span></td>
                          <td>{s.stgCount}</td>
                          <td className="muted small">{tableList(s.stgTables)}</td>
                        </tr>
                      );
                      if (s.appCount > 0) rows.push(
                        <tr key={s.schema + "-app"}>
                          <td className="mono">{s.schema}</td>
                          <td><span className="tpill t-planned">App tables</span></td>
                          <td>{s.appCount}</td>
                          <td className="muted small">{tableList(s.appTables)}</td>
                        </tr>
                      );
                      return rows;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* legend (#12) */}
          <div className="lin-legend">
            <span><i style={{ background: "#DA291C" }} /> seed table</span>
            {result.seeds.length > 1 && <span><i style={{ background: "#FFE0B2", border: "1px solid #B45309" }} /> shared by both</span>}
            {colorBy === "app"
              ? Object.entries(result.appColors).map(([a, c]) => <span key={a}><i style={{ background: c }} /> {a}</span>)
              : <span><i style={{ background: "#FCE9E7", border: "1px solid #E3B4AF" }} /> related table</span>}
            {!!result.counts.backEdges && <span><i className="dashed" /> cycle edge (dotted)</span>}
            <span className="muted">· click a node to trace it</span>
          </div>

          <MermaidDiagram code={result.mermaid} idMap={result.idMap}
            onNodeClick={(id) => { setQ(id); runTrace([id]); }} />

          <div className="row" style={{ marginTop: 16 }}>
            <a className="btn download" href={`/api/lineage/export?path=${encodeURIComponent(ref)}&table=${encodeURIComponent(result.seeds.join(","))}&direction=${result.direction}&depth=${depth}${selApps.length ? `&apps=${encodeURIComponent(selApps.join(","))}` : ""}`}>
              <Download size={16} /> Download lineage (Excel)
            </a>
            <span className="muted small">Diagram PNG / SVG is in the toolbar above.</span>
          </div>

          <div className="ltable-wrap" style={{ marginTop: 18 }}>
            <table className="ltable">
              <thead><tr><th>Applications</th><th>Source database</th><th>Source schema</th><th>Source table</th><th>Target database</th><th>Target schema</th><th>Target table</th></tr></thead>
              <tbody>
                {result.edges.map((e, i) => (
                  <tr key={i}>
                    <td>{e.app || "—"}</td>
                    <td>{e.source_db || "—"}</td><td>{e.source_schema || "—"}</td><td className="mono">{e.source_table}</td>
                    <td>{e.target_db || "—"}</td><td>{e.target_schema || "—"}</td>
                    <td className="mono">{e.target_table}{e.cycle && <span className="tpill t-comp-off" style={{ marginLeft: 6 }}>cycle</span>}</td>
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

function QTile({ n, label, c }: { n: number; label: string; c: string }) {
  return (
    <TiltCard as="div" className="stat" style={{ ["--tool" as any]: c }}>
      <div className="stat-ico" style={{ background: c }}><Share2 size={16} /></div>
      <div className="stat-val">{n}</div>
      <div className="stat-lbl">{label}</div>
    </TiltCard>
  );
}
