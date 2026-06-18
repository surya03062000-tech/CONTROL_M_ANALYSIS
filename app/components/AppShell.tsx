"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Workflow, Database, GitCompareArrows, FileSpreadsheet, FileText,
  CalendarDays, KeyRound, Gamepad2, Menu, X, ExternalLink,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import InstallButton from "./InstallButton";
import { ToastProvider } from "./Toast";

interface NavItem { href: string; label: string; icon: any; soon?: boolean; external?: boolean; }

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/control-m", label: "Control-M Analysis", icon: Workflow },
  { href: "/history-load", label: "History Load (Prod)", icon: Database },
  { href: "https://uno-game-jsys.onrender.com/", label: "Fun Zone — UNO", icon: Gamepad2, external: true },
  { href: "#", label: "Drift Analysis", icon: GitCompareArrows, soon: true },
  { href: "#", label: "STM Generator", icon: FileSpreadsheet, soon: true },
  { href: "#", label: "DG / HLD Docs", icon: FileText, soon: true },
  { href: "#", label: "Leave Tracker", icon: CalendarDays, soon: true },
  { href: "#", label: "Access Requests", icon: KeyRound, soon: true },
];

function RogersLogo() {
  return (
    <svg viewBox="0 0 48 48" className="rogers-mark-svg" role="img" aria-label="Rogers">
      <g fill="#DA291C">
        <path d="M24 24 C19 13 27 4 39 9 C35 15 30 19 26 24 Z" transform="rotate(0 24 24)" />
        <path d="M24 24 C19 13 27 4 39 9 C35 15 30 19 26 24 Z" transform="rotate(120 24 24)" />
        <path d="M24 24 C19 13 27 4 39 9 C35 15 30 19 26 24 Z" transform="rotate(240 24 24)" />
      </g>
    </svg>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <ToastProvider>
      <div className={`shell ${open ? "nav-open" : ""}`}>
        <aside className="sidebar">
          <div className="side-brand">
            <RogersLogo />
            <div className="side-brand-text">
              <span className="rogers-word">ROGERS</span>
              <span className="brand-tag">Data Engineering</span>
            </div>
          </div>
          <div className="side-tagline">Powering D&amp;AI Teams, One Tool at a Time</div>

          <nav className="side-nav">
            {NAV.map((n) => {
              const active = n.href === pathname;
              const Icon = n.icon;
              const inner = (
                <>
                  <Icon size={18} className="nav-ico" />
                  <span>{n.label}</span>
                  {n.soon && <span className="soon">soon</span>}
                  {n.external && <ExternalLink size={13} className="ext-ico" />}
                </>
              );
              if (n.soon) return <span key={n.label} className="nav-item disabled">{inner}</span>;
              if (n.external) return (
                <a key={n.label} href={n.href} target="_blank" rel="noreferrer" className="nav-item"
                   onClick={() => setOpen(false)}>
                  {inner}
                </a>
              );
              return (
                <Link key={n.label} href={n.href} className={`nav-item ${active ? "active" : ""}`}
                      onClick={() => setOpen(false)}>
                  {inner}
                </Link>
              );
            })}
          </nav>

          <div className="side-foot">Data Engineering Portal · v1</div>
        </aside>

        <div className="main-col">
          <header className="topbar">
            <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
            <span className="app-tagline">Powering D&amp;AI Teams, One Tool at a Time</span>
            <div className="topbar-spacer" />
            <InstallButton />
            <ThemeToggle />
          </header>
          <main className="content">{children}</main>
          <footer className="app-foot">
            Powered by <strong>Surya Alagarsamy</strong>
          </footer>
        </div>

        <button className="scrim" aria-hidden={!open} tabIndex={-1} onClick={() => setOpen(false)} />
      </div>
    </ToastProvider>
  );
}
