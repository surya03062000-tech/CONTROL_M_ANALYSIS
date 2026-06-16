"use client";

import { useEffect, useRef, useState } from "react";

// Load mermaid once, lazily, on the client only (it touches browser APIs).
let mermaidPromise: Promise<any> | null = null;
async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        theme: "neutral",
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis" },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

export default function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setErr("");
    (async () => {
      try {
        const mermaid = await getMermaid();
        const id = "mmd-" + Math.random().toString(36).slice(2);
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (err) {
    return (
      <div className="err-text">
        Couldn’t render the diagram in-browser ({err}). Use the “Open in Mermaid Live” link instead.
      </div>
    );
  }
  return <div className="mermaid-host" ref={ref} aria-label="Dependency diagram" />;
}
