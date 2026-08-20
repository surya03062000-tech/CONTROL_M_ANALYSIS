"use client";

import { useEffect, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2, Scan, Image as ImageIcon,
  FileCode2, Search, ExternalLink, Loader2,
} from "lucide-react";

// Load mermaid module once (client-side only). Theme is applied per render so it
// can follow the app's light/dark mode. htmlLabels:false keeps labels as SVG text
// so PNG export via canvas doesn't taint / drop labels.
let mermaidPromise: Promise<any> | null = null;
async function getMermaid() {
  if (!mermaidPromise) mermaidPromise = import("mermaid").then((m) => m.default);
  return mermaidPromise;
}

// Re-skin the notebook's gold/blue palette to Rogers colours.
function rogersTheme(code: string): string {
  return code
    .replace(/classDef inputJob[^\n;]*/g, "classDef inputJob fill:#DA291C,stroke:#7a0d06,stroke-width:2px,color:#ffffff")
    .replace(/classDef chainJob[^\n;]*/g, "classDef chainJob fill:#FCE9E7,stroke:#E3B4AF,color:#3a3a3a");
}

export default function MermaidDiagram({
  code, liveUrl, idMap, onNodeClick,
}: {
  code: string; liveUrl?: string;
  idMap?: Record<string, string>;              // mermaid node id -> real id
  onNodeClick?: (id: string) => void;          // #6 click a node to drill in
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const twRef = useRef<any>(null);
  const [err, setErr] = useState("");
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // follow the app theme
  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // render the diagram (re-runs on code or theme change)
  useEffect(() => {
    let cancelled = false;
    setErr(""); setReady(false);
    (async () => {
      try {
        const mermaid = await getMermaid();
        mermaid.initialize({
          startOnLoad: false, securityLevel: "loose",
          theme: theme === "dark" ? "dark" : "neutral",
          // Mermaid's own defaults (maxEdges: 500, maxTextSize: 50_000 chars)
          // refuse to render large lineages outright — real graphs here can
          // legitimately have 500+ relationships, so raise both well past
          // what DEFAULT_MAX_NODES in lib/lineage.ts can produce.
          maxEdges: 20000,
          maxTextSize: 4_000_000,
          flowchart: { useMaxWidth: false, htmlLabels: false, curve: "basis" },
        });
        const id = "mmd-" + Math.random().toString(36).slice(2);
        const { svg } = await mermaid.render(id, rogersTheme(code));
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
        setReady(true);
        // fit the whole diagram into view once it's laid out in the DOM
        requestAnimationFrame(() => requestAnimationFrame(() => fitToView(0)));
      } catch (e: any) { if (!cancelled) setErr(e?.message || String(e)); }
    })();
    return () => { cancelled = true; };
  }, [code, theme]);

  // make nodes clickable (drill into a table's lineage)
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !ready || !onNodeClick || !idMap) return;
    const nodes = Array.from(host.querySelectorAll("g.node")) as SVGGElement[];
    const cleanups: (() => void)[] = [];
    for (const el of nodes) {
      // mermaid ids look like "flowchart-<nodeId>-<n>"
      const raw = el.id || "";
      const key = Object.keys(idMap).find((k) => raw.includes(k));
      if (!key) continue;
      const handler = (ev: Event) => { ev.stopPropagation(); onNodeClick(idMap[key]); };
      el.style.cursor = "pointer";
      el.addEventListener("click", handler);
      cleanups.push(() => el.removeEventListener("click", handler));
    }
    return () => cleanups.forEach((c) => c());
  }, [ready, idMap, onNodeClick]);

  // highlight nodes matching the search query
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const q = query.trim().toLowerCase();
    host.querySelectorAll("g.node").forEach((n) => {
      const hit = q.length > 0 && (n.textContent || "").toLowerCase().includes(q);
      n.classList.toggle("mm-hit", hit);
    });
  }, [query, ready]);

  // close fullscreen on Escape
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  function svgEl(): SVGSVGElement | null { return hostRef.current?.querySelector("svg") || null; }

  // Compute a "fit width/height, centered" transform ourselves rather than relying
  // on react-zoom-pan-pinch's zoomToElement (which measures the target element at
  // call time and, on large diagrams, can land on a scale below the wrapper's
  // minScale — the transform then gets silently clamped without re-centering,
  // which is what produced the "too zoomed in / off-centre" symptom on big graphs).
  function fitToView(animationTime = 200) {
    const svg = svgEl();
    const wrapper = hostRef.current?.closest(".mm-wrapper") as HTMLElement | null;
    const api = twRef.current;
    if (!svg || !wrapper || !api?.setTransform) return;
    const vb = svg.viewBox?.baseVal;
    const rect = svg.getBoundingClientRect();
    const svgW = (vb && vb.width) || rect.width;
    const svgH = (vb && vb.height) || rect.height;
    const wrapW = wrapper.clientWidth, wrapH = wrapper.clientHeight;
    if (!svgW || !svgH || !wrapW || !wrapH) return;
    const MIN_SCALE = 0.02, MAX_SCALE = 2;
    const pad = 0.94; // small margin so nothing is flush against the edge
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(wrapW / svgW, wrapH / svgH) * pad));
    const x = (wrapW - svgW * scale) / 2;
    const y = (wrapH - svgH * scale) / 2;
    api.setTransform(x, y, scale, animationTime);
  }

  function downloadSvg() {
    const svg = svgEl(); if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${data}`], { type: "image/svg+xml" });
    triggerDownload(URL.createObjectURL(blob), "control-m-lineage.svg");
  }

  function downloadPng() {
    const svg = svgEl(); if (!svg) return;
    const vb = svg.viewBox?.baseVal;
    const rect = svg.getBoundingClientRect();
    const w = Math.max(1, Math.round(vb && vb.width ? vb.width : rect.width));
    const h = Math.max(1, Math.round(vb && vb.height ? vb.height : rect.height));
    const scale = 2;
    const data = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * scale; canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = theme === "dark" ? "#0f141d" : "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => { if (b) triggerDownload(URL.createObjectURL(b), "control-m-lineage.png"); });
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data);
  }

  if (err) {
    return (
      <div className="err-text" style={{ marginTop: 12 }}>
        Couldn’t render the diagram in-browser ({err}).{liveUrl && <> Use <a className="link" href={liveUrl} target="_blank" rel="noreferrer">Mermaid Live</a> instead.</>}
      </div>
    );
  }

  return (
    <div className={`diagram-block ${full ? "mm-full" : ""}`}>
      <div className="diagram-toolbar">
        <div className="legend">
          <span><i className="lg seed" /> seed job</span>
          <span><i className="lg chain" /> chain job</span>
        </div>
        <div className="search">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find node…" />
        </div>
      </div>

      <div className="diagram-stage">
        <TransformWrapper ref={twRef} initialScale={1} minScale={0.02} maxScale={8} centerOnInit
          wheel={{ step: 0.12 }} doubleClick={{ disabled: true }}>
          {({ zoomIn, zoomOut }) => (
            <>
              <div className="zoom-bar">
                <button className="icon-btn" onClick={() => zoomIn()} aria-label="Zoom in" title="Zoom in"><ZoomIn size={16} /></button>
                <button className="icon-btn" onClick={() => zoomOut()} aria-label="Zoom out" title="Zoom out"><ZoomOut size={16} /></button>
                <button className="icon-btn" onClick={() => fitToView(250)} aria-label="Fit" title="Fit to screen"><Scan size={16} /></button>
                <span className="zoom-sep" />
                <button className="icon-btn" onClick={downloadPng} aria-label="Download PNG" title="Download PNG"><ImageIcon size={16} /></button>
                <button className="icon-btn" onClick={downloadSvg} aria-label="Download SVG" title="Download SVG"><FileCode2 size={16} /></button>
                {liveUrl && <a className="icon-btn" href={liveUrl} target="_blank" rel="noreferrer" aria-label="Mermaid Live" title="Open in Mermaid Live"><ExternalLink size={16} /></a>}
                <button className="icon-btn" onClick={() => { setFull((v) => !v); requestAnimationFrame(() => requestAnimationFrame(() => fitToView(200))); }}
                        aria-label="Fullscreen" title="Fullscreen">
                  {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
              <TransformComponent wrapperClass="mm-wrapper" contentClass="mm-content">
                <div className="mermaid-host" ref={hostRef} aria-label="Dependency diagram" />
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
        {!ready && (
          <div className="diagram-loading"><Loader2 size={18} className="spin" /> Rendering diagram…</div>
        )}
      </div>

      <details className="source">
        <summary>Show Mermaid source</summary>
        <pre className="mono">{code}</pre>
      </details>
    </div>
  );
}

function triggerDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
