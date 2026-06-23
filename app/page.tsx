import Link from "next/link";
import {
  Workflow, Database, GitCompareArrows, FileSpreadsheet, FileText,
  CalendarDays, KeyRound, Gamepad2, ArrowRight, ExternalLink, Clock,
} from "lucide-react";
import Hero from "./components/Hero";

interface Tool {
  href: string; title: string; desc: string; icon: any; color: string; soon?: boolean; external?: boolean;
}

const WORK: Tool[] = [
  { href: "/control-m", title: "Control-M Analysis", icon: Workflow, color: "#DA291C",
    desc: "Upload a workspace XML, run the lineage job, explore the dependency diagram, and download the Excel dashboard." },
  { href: "/history-load", title: "History Load (Prod)", icon: Database, color: "#2563eb",
    desc: "Open the production history-load notebooks in Rogers Databricks. Dev access required." },
  { href: "/leave", title: "Leave Tracker", icon: CalendarDays, color: "#16a34a",
    desc: "Sign in to record your leave on a calendar; admins manage employees, view a monthly dashboard, and configure email alerts." },
  { href: "/dg", title: "DG Document Creation", icon: FileText, color: "#7c3aed",
    desc: "Create tables from a spreadsheet, then generate Data Governance documents for them and download the Excel." },
];

const FUN: Tool[] = [
  { href: "https://uno-game-jsys.onrender.com/", title: "Fun Zone — UNO", icon: Gamepad2, color: "#7c3aed", external: true,
    desc: "Heads-down for 5+ hours and feeling the grind? Grab the team for a quick 10-minute UNO break to recharge. Opens in a new tab." },
];

const SOON: Tool[] = [
  { href: "#", title: "Drift Analysis", icon: GitCompareArrows, color: "#0891b2", soon: true,
    desc: "Compare lineage and container definitions across runs to surface what changed over time." },
  { href: "#", title: "STM Generator", icon: FileSpreadsheet, color: "#0891b2", soon: true,
    desc: "Generate Source-to-Target Mappings for ingestion and derived tables." },
  { href: "#", title: "HLD Docs", icon: FileText, color: "#0891b2", soon: true,
    desc: "Auto-create High-Level Design documents." },
  { href: "#", title: "Access Requests", icon: KeyRound, color: "#0891b2", soon: true,
    desc: "Shortcuts and import links for common Rogers access requests." },
];

function Card({ t }: { t: Tool }) {
  const Icon = t.icon;
  const inner = (
    <>
      <div className="tool-ico"><Icon size={22} /></div>
      <div className="tool-body">
        <div className="tool-title">
          {t.title}
          {t.soon && <><span className="soon">soon</span><Clock size={14} className="soon-ico" /></>}
        </div>
        <p className="tool-desc">{t.desc}</p>
      </div>
      {!t.soon && (t.external ? <ExternalLink size={18} className="tool-arrow" /> : <ArrowRight size={18} className="tool-arrow" />)}
    </>
  );
  const style = { ["--tool" as any]: t.color };
  if (t.soon) return <div className="tool-card disabled" style={style}>{inner}</div>;
  if (t.external) return <a className="tool-card" style={style} href={t.href} target="_blank" rel="noreferrer">{inner}</a>;
  return <Link className="tool-card" style={style} href={t.href}>{inner}</Link>;
}

export default function Dashboard() {
  return (
    <div className="page">
      <Hero />

      <div className="section-title">Workspace tools</div>
      <div className="tool-grid">{WORK.map((t) => <Card key={t.title} t={t} />)}</div>

      <div className="section-title">Fun</div>
      <div className="tool-grid">{FUN.map((t) => <Card key={t.title} t={t} />)}</div>

      <div className="section-title">Coming soon</div>
      <div className="tool-grid">{SOON.map((t) => <Card key={t.title} t={t} />)}</div>
    </div>
  );
}
