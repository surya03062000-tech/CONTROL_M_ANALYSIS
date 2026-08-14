import { FileSpreadsheet, ExternalLink, ShieldAlert, Info } from "lucide-react";

interface Cat { n: number; title: string; flow: string; desc: string; href?: string; soon?: boolean }

const CATEGORIES: Cat[] = [
  {
    n: 1,
    title: "Oracle → EDL Generator",
    flow: "Oracle → raw → rawstd → curated",
    desc: "Generates the STM for Oracle sources: Oracle → raw → rawstd, and rawstd → curated layer.",
    href: "https://adb-8827699102150749.9.azuredatabricks.net/editor/notebooks/4260686831449685?o=8827699102150749",
  },
  {
    n: 2,
    title: "SFTP → EDL Generator",
    flow: "SFTP → raw → rawstd → curated",
    desc: "Generates the STM for SFTP file feeds: SFTP → raw → rawstd, and rawstd → curated layer.",
    href: "https://adb-8827699102150749.9.azuredatabricks.net/editor/notebooks/221606423485514?o=8827699102150749",
  },
  {
    n: 3,
    title: "Azure Storage → Curated (FSM ADLS)",
    flow: "Azure Storage → raw → rawstd → curated",
    desc: "Generates the STM for Azure Storage (ADLS) sources: Azure Storage → raw → rawstd → curated layer.",
    href: "https://adb-8827699102150749.9.azuredatabricks.net/editor/notebooks/221606423485515?o=8827699102150749",
  },
  {
    n: 4,
    title: "Derived STM Generator",
    flow: "Derived tables",
    desc: "Generates the STM for derived tables (STM_GENERATOR_AUTOMATION).",
    href: "https://adb-8827699102150749.9.azuredatabricks.net/editor/notebooks/4260686831449215?o=8827699102150749",
  },
];

export default function StmPage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>STM Generator</h1>
        <p className="sub">Generate Source-to-Target Mappings — open the generator notebooks directly in Rogers Databricks.</p>
      </div>

      <div className="callout warn" role="note">
        <ShieldAlert size={20} />
        <div>
          <strong>Access required.</strong> You must have access to the <strong>Rogers Databricks (Dev access)</strong>{" "}
          to open these notebooks. Each link opens Rogers Databricks <strong>directly</strong> in a new tab.
        </div>
      </div>

      <div className="callout info" role="note">
        <Info size={20} />
        <div>
          <strong>Please note.</strong> Each notebook is a working sample built for one project. If your project is
          structured differently, copy the notebook and adjust the code to suit your project&apos;s source systems,
          schemas and target layers before generating the STM.
        </div>
      </div>

      <div className="tool-grid">
        {CATEGORIES.map((c) => {
          const style = { ["--tool" as any]: "#0891b2" };
          const inner = (
            <>
              <div className="tool-ico"><FileSpreadsheet size={22} /></div>
              <div className="tool-body">
                <div className="tool-title">{c.n}. {c.title}</div>
                <p className="tool-desc">{c.desc}</p>
                <div className="flow-pill">{c.flow}</div>
              </div>
              <ExternalLink size={18} className="tool-arrow" />
            </>
          );
          return <a key={c.n} className="tool-card" style={style} href={c.href} target="_blank" rel="noreferrer">{inner}</a>;
        })}
      </div>
    </div>
  );
}
