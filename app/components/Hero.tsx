"use client";

import { useEffect, useRef, useState } from "react";
import { Share2, Workflow, Users } from "lucide-react";

// Subtle mouse-follow parallax: the watermark swirl drifts one way, the text
// drifts a few px the other way. Pure CSS custom properties, no library —
// no-ops on touch (no mousemove there) and is neutralized under
// prefers-reduced-motion / no-hover (see .hero rules in globals.css).
export default function Hero() {
  const [greeting, setGreeting] = useState("Welcome");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;  // -0.5..0.5
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--px", `${(px * 24).toFixed(1)}px`);
    el.style.setProperty("--py", `${(py * 24).toFixed(1)}px`);
    el.style.setProperty("--cx", `${(px * -6).toFixed(1)}px`);
    el.style.setProperty("--cy", `${(py * -6).toFixed(1)}px`);
  }
  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--px", "0px"); el.style.setProperty("--py", "0px");
    el.style.setProperty("--cx", "0px"); el.style.setProperty("--cy", "0px");
  }

  return (
    <div className="hero" ref={ref} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="hero-content">
        <div className="hero-greeting">{greeting} 👋</div>
        <h1><span className="dai-badge light">D&amp;AI</span> <span className="hero-ops">Ops</span><span className="hero-central">Central</span></h1>
        <p className="hero-tag">One hub for Data &amp; AI Operations</p>
        <div className="hero-chips">
          <span className="hero-chip"><Share2 size={14} /> One hub</span>
          <span className="hero-chip"><Workflow size={14} /> Every workflow</span>
          <span className="hero-chip"><Users size={14} /> Data &amp; AI team</span>
        </div>
      </div>
    </div>
  );
}
