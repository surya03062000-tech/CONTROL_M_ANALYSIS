"use client";

import { useEffect, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2, Scan, Image as ImageIcon,
  FileCode2, Search, ExternalLink,
} from "lucide-react";

// Load mermaid once, client-side only. htmlLabels:false keeps labels as SVG text
// so PNG export via canvas doesn't taint / drop labels.
let mermaidPromise: Promise<any> | null = null;
async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false, securityLevel: "loose", theme: "neutral",
        flowchart: { useMaxWidth: false, htmlLabels: false, curve: "basis" },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

// Re-skin the notebook's gold/blue palette to Rogers colours.
function rogersTheme(code: string): string {
  return code
    .replace(/classDef inputJob[^\n;]*/g, "classDef inputJob fill:#DA291C,stroke:#7a0d06,stroke-width:2px,color:#ffffff")
    .replace(/classDef chainJob[^\n;]*/g, "classDef chainJob fill:#FCE9E7,stroke:#E3B4AF,color:#3a3a3a");
}

export default function MermaidDiagram({ code, liveUrl }: { code: string; liveUrl?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);

  // render the diagram
  useEffect(() => {
    let cancelled = false;
    setErr(""); setReady(false);
    (async () => {
      try {
        const mermaid = await getMermaid();
        const id = "mmd-" + Math.random().toString(36).slice(2);
        const { svg } = await mermaid.render(id, rogersTheme(code));
        if (!cancelled && hostRef.current) { hostRef.current.innerHTML = svg; setReady(true); }
      } catch (e: any) { if (!cancelled) setErr(e?.message || String(e)); }
    })();
    return () => { cancelled = true; };
  }, [code]);

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

  function svgEl(): SVGSVGElement | null {
    return hostRef.current?.querySelector("svg") || null;
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
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
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

      <TransformWrapper initialScale={1} minScale={0.2} maxScale={8} centerOnInit
        wheel={{ step: 0.12 }} doubleClick={{ disabled: true }}>
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="zoom-bar">
              <button className="icon-btn" onClick={() => zoomIn()} aria-label="Zoom in" title="Zoom in"><ZoomIn size={16} /></button>
              <button className="icon-btn" onClick={() => zoomOut()} aria-label="Zoom out" title="Zoom out"><ZoomOut size={16} /></button>
              <button className="icon-btn" onClick={() => resetTransform()} aria-label="Fit" title="Fit"><Scan size={16} /></button>
              <span className="zoom-sep" />
              <button className="icon-btn" onClick={downloadPng} aria-label="Download PNG" title="Download PNG"><ImageIcon size={16} /></button>
              <button className="icon-btn" onClick={downloadSvg} aria-label="Download SVG" title="Download SVG"><FileCode2 size={16} /></button>
              {liveUrl && <a className="icon-btn" href={liveUrl} target="_blank" rel="noreferrer" aria-label="Mermaid Live" title="Open in Mermaid Live"><ExternalLink size={16} /></a>}
              <button className="icon-btn" onClick={() => { setFull((v) => !v); setTimeout(() => resetTransform(), 60); }}
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
