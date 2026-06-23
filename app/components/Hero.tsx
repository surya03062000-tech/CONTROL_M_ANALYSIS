"use client";

import { useEffect, useState } from "react";
import { Share2, Workflow, Users } from "lucide-react";

export default function Hero() {
  const [greeting, setGreeting] = useState("Welcome");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);

  return (
    <div className="hero">
      <div className="hero-greeting">{greeting} 👋</div>
      <h1><span className="dai-badge light">D&amp;AI</span> <span className="hero-ops">Ops</span><span className="hero-central">Central</span></h1>
      <p className="hero-tag">One hub for Data &amp; AI Operations</p>
      <div className="hero-chips">
        <span className="hero-chip"><Share2 size={14} /> One hub</span>
        <span className="hero-chip"><Workflow size={14} /> Every workflow</span>
        <span className="hero-chip"><Users size={14} /> Data &amp; AI team</span>
      </div>
    </div>
  );
}
