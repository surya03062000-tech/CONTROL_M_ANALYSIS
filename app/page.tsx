import Link from "next/link";
import {
  Workflow, GitCompareArrows, FileSpreadsheet, FileText,
  CalendarDays, KeyRound, Gamepad2, ArrowRight, ExternalLink,
} from "lucide-react";

interface Tool {
  href: string; title: string; desc: string; icon: any; soon?: boolean; external?: boolean;
}

const TOOLS: Tool[] = [
  { href: "/control-m", title: "Control-M Analysis", icon: Workflow,
    desc: "Upload a workspace XML, run the lineage job, explore the dependency diagram, and download the Excel dashboard." },
  { href: "https://uno-game-jsys.onrender.com/", title: "Fun Zone — UNO", icon: Gamepad2, external: true,
    desc: "Heads-down for 5+ hours and feeling the grind? Grab the team for a quick 10-minute UNO break to recharge. Opens in a new tab." },
  { href: "#", title: "Drift Analysis", icon: GitCompareArrows, soon: true,
    desc: "Compare lineage and container definitions across runs to surface what changed over time." },
  { href: "#", title: "STM Generator", icon: FileSpreadsheet, soon: true,
    desc: "Generate Source-to-Target Mappings for ingestion and derived tables." },
  { href: "#", title: "DG / HLD Docs", icon: FileText, soon: true,
    desc: "Auto-create Data Governance and High-Level Design documents." },
  { href: "#", title: "Leave Tracker", icon: CalendarDays, soon: true,
    desc: "Track team leave and availability at a glance." },
  { href: "#", title: "Access Requests", icon: KeyRound, soon: true,
    desc: "Shortcuts and import links for common Rogers access requests." },
];

export default function Dashboard() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Data Engineering Portal</h1>
        <p className="tagline">Powering D&amp;AI Teams, One Tool at a Time</p>
        <p className="sub">Self-service tools for the Rogers Data Engineering team. Pick a tool to get started.</p>
      </div>

      <div className="tool-grid">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const card = (
            <>
              <div className="tool-ico"><Icon size={22} /></div>
              <div className="tool-body">
                <div className="tool-title">
                  {t.title}
                  {t.soon && <span className="soon">soon</span>}
                </div>
                <p className="tool-desc">{t.desc}</p>
              </div>
              {!t.soon && (t.external ? <ExternalLink size={18} className="tool-arrow" /> : <ArrowRight size={18} className="tool-arrow" />)}
            </>
          );
          if (t.soon) return <div key={t.title} className="tool-card disabled">{card}</div>;
          if (t.external) return <a key={t.title} href={t.href} target="_blank" rel="noreferrer" className="tool-card">{card}</a>;
          return <Link key={t.title} href={t.href} className="tool-card">{card}</Link>;
        })}
      </div>
    </div>
  );
}
