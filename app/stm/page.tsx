import { FileSpreadsheet, ExternalLink, ShieldAlert, Clock } from "lucide-react";

interface Cat { n: number; title: string; desc: string; href?: string; soon?: boolean; }

const CATEGORIES: Cat[] = [
  {
    n: 1,
    title: "Oracle → EDL Generator",
    desc: "Generates STM for Oracle → raw → rawstd, and rawstd → curated layer.",
    href: "https://adb-8827699102150749.9.azuredatabricks.net/editor/notebooks/4260686831449685?o=8827699102150749",
  },
  { n: 2, title: "SFTP → EDL Generator", desc: "Generates STM for SFTP → raw → rawstd, and rawstd → curated layer.", soon: true },
  { n: 3, title: "Derived STM Generator", desc: "Generates STM for derived tables.", soon: true },
];

export default function StmPage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>STM Generator</h1>
        <p className="sub">Generate Source-to-Target Mappings — open the production generator notebooks directly in Rogers Databricks.</p>
      </div>

      <div className="callout warn" role="note">
        <ShieldAlert size={20} />
        <div>
          <strong>Access required.</strong> You must have access to the <strong>Rogers Databricks (Dev access)</strong>{" "}
          to open these notebooks. Each available link opens Rogers Databricks <strong>directly</strong> in a new tab.
        </div>
      </div>

      <div className="tool-grid">
        {CATEGORIES.map((c) => {
          const style = { ["--tool" as any]: "#0891b2" };
          const inner = (
            <>
              <div className="tool-ico"><FileSpreadsheet size={22} /></div>
              <div className="tool-body">
                <div className="tool-title">{c.n}. {c.title}{c.soon && <><span className="soon">soon</span><Clock size={14} className="soon-ico" /></>}</div>
                <p className="tool-desc">{c.desc}</p>
              </div>
              {!c.soon && <ExternalLink size={18} className="tool-arrow" />}
            </>
          );
          if (c.soon) return <div key={c.n} className="tool-card disabled" style={style}>{inner}</div>;
          return <a key={c.n} className="tool-card" style={style} href={c.href} target="_blank" rel="noreferrer">{inner}</a>;
        })}
      </div>
    </div>
  );
}
