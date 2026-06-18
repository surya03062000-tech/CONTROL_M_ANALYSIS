import { Database, ExternalLink, ShieldAlert } from "lucide-react";

interface Category { n: number; title: string; desc: string; href: string; }

const CATEGORIES: Category[] = [
  {
    n: 1,
    title: "1 to 1 billion records",
    desc: "Standard production history-load notebook for tables up to ~1 billion records.",
    href: "https://adb-8827699102150749.9.azuredatabricks.net/editor/notebooks/74444877660053?o=8827699102150749",
  },
  {
    n: 2,
    title: "More than 1 billion & Delta",
    desc: "Production history-load notebook for very large (> 1 billion) tables and Delta loads.",
    href: "https://adb-8827699102150749.9.azuredatabricks.net/editor/notebooks/74444877660051?o=8827699102150749#command/5618313297577598",
  },
];

export default function HistoryLoadPage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>History Load — Production</h1>
        <p className="sub">Open the production history-load notebooks directly in Rogers Databricks.</p>
      </div>

      <div className="callout warn" role="note">
        <ShieldAlert size={20} />
        <div>
          <strong>Access required.</strong> You must have access to the <strong>Rogers Databricks (Dev access)</strong>{" "}
          to open these notebooks. Each link below opens Rogers Databricks <strong>directly</strong> in a new tab.
        </div>
      </div>

      <div className="tool-grid">
        {CATEGORIES.map((c) => (
          <a key={c.n} href={c.href} target="_blank" rel="noreferrer" className="tool-card">
            <div className="tool-ico"><Database size={22} /></div>
            <div className="tool-body">
              <div className="tool-title">{c.n}. {c.title}</div>
              <p className="tool-desc">{c.desc}</p>
            </div>
            <ExternalLink size={18} className="tool-arrow" />
          </a>
        ))}
      </div>
    </div>
  );
}
