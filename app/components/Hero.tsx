"use client";

import { useEffect, useState } from "react";

export default function Hero() {
  const [greeting, setGreeting] = useState("Welcome");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);

  return (
    <div className="hero">
      <div className="hero-greeting">{greeting} 👋</div>
      <h1>Data Engineering Portal</h1>
      <p className="hero-tag">Powering D&amp;AI Teams, One Tool at a Time</p>
      <p className="hero-sub">Self-service tools for the Rogers Data Engineering team. Pick a tool to get started.</p>
    </div>
  );
}
