# Control-M Analyzer — Trigger Website (Vercel + Databricks Jobs)

A small Next.js app you deploy on **Vercel**. It lets anyone:

1. **Upload** a Control-M workspace XML straight into the Databricks input Volume,
2. Fill in the same parameters as the notebook widgets (`job_name` / `table_name` / `folder_name`),
3. **Trigger** the Control-M Analyzer Databricks **Job**,
4. Watch the **run status** live on the page,
5. **Explore the dependency diagram** (rendered Mermaid) + flow summary once it succeeds,
6. **Download** the generated `.xlsx` dashboard.

The Databricks token stays on the server (API routes only) — it is never sent to the browser.

```
Browser ──POST /api/upload──▶ Databricks Files API  (PUT into the input Volume)
        ──POST /api/run────▶  Databricks  jobs/run-now
   ▲                                   │ run_id
   │  poll /api/status ◀──────────────┘
   │        └─ runs/get  +  runs/get-output (exit value = JSON: path + Mermaid + summary)
   └──GET /api/download──▶ Databricks  Files API  ──▶  streams the .xlsx
```

---

## 1. Create the Databricks Job (one time)

The website triggers an **existing** job by its numeric ID, so create it first.

### Option A — Databricks UI
1. Upload / import `databricks_code_control_m_analysis.py` into your workspace as a notebook.
2. **Workflows → Create Job** → add a **Notebook** task pointing at that notebook.
3. Under **Parameters**, add these keys (values can stay empty — the website overrides them):
   `01_xml_filename, 02_folder_filter, 03_input_mode, 04_input_job_names,`
   `05_input_table_names, 06_table_match_mode, 07_direction, 08_max_depth`
   `03_input_mode` accepts `job_name`, `table_name`, or `folder_name`. `08_max_depth` is no
   longer exposed in the UI — the website always sends `0` (unlimited).
4. Pick a cluster, **Create**, then copy the **Job ID** (top-right of the job page).

### Option B — Databricks CLI
Edit `databricks-job.json` (set `notebook_path`, `existing_cluster_id`), then:
```bash
databricks jobs create --json @databricks-job.json
# → { "job_id": 123456789012345 }   ← copy this
```

> The notebook ends with `dbutils.notebook.exit(<json>)`, returning the output `.xlsx` path,
> the Mermaid diagram source + live URL, and a small flow summary. The website reads this via
> `runs/get-output` to render the diagram and download the file. (A bare path string still works.)

---

## 2. Get a Databricks token

User Settings → **Developer → Access tokens → Generate**. The identity needs:
- permission to **run** the job,
- **read** on the output Volume (`/Volumes/edl_qa/qa_agent/control_m`) for downloads, and
- **write** on the input Volume (same path by default) so the website can upload the XML.

(For production, a **Service Principal** OAuth token is preferable to a personal PAT.)

---

## 3. Configure environment variables

Copy `.env.example` → `.env.local` and fill in:

| Var | Example |
|---|---|
| `DATABRICKS_HOST` | `https://adb-1234567890123456.7.azuredatabricks.net` |
| `DATABRICKS_TOKEN` | `dapi...` |
| `DATABRICKS_JOB_ID` | `123456789012345` |
| `OUTPUT_VOLUME` | `/Volumes/edl_qa/qa_agent/control_m` |
| `INPUT_VOLUME` | `/Volumes/edl_qa/qa_agent/control_m` *(where uploads land; defaults to `OUTPUT_VOLUME`)* |
| `APP_PASSWORD` | *(optional)* a shared password to gate the UI |

`OUTPUT_VOLUME` **must match** `CONFIG["output_volume"]` in the notebook (used to sandbox downloads).
`INPUT_VOLUME` **must match** `CONFIG["xml_folder"]` (where the notebook reads the XML from).

---

## 4. Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

---

## 5. Deploy to Vercel

```bash
npm i -g vercel
vercel            # first run links/creates the project
vercel --prod     # deploy
```
Then add the same env vars in **Vercel → Project → Settings → Environment Variables**
(Production + Preview), and redeploy. Done.

> Vercel function default timeout is plenty here — the page **polls** every 3 s rather than
> holding a long request, so a 5–10 min Databricks run is fine on the Hobby plan.

---

## Files

The app is structured as a small **portal**: the dashboard (`/`) lists tools, and the
Control-M analyzer lives at **`/control-m`**. Other tools (Drift Analysis, STM, docs,
etc.) are stubbed as "coming soon" cards for the roadmap.

```
app/
  layout.tsx              root layout: Inter font, metadata, theme bootstrap, AppShell
  page.tsx                Dashboard — tool launcher cards
  icon.svg                Rogers favicon
  globals.css             full theme (light + dark, Rogers red)
  control-m/page.tsx      Analyzer: drag-drop upload, validation, run + timer + cancel,
                          refresh-safe runs, results, and recent-outputs history
  MermaidDiagram.tsx      diagram viewer: pan/zoom, fullscreen, PNG/SVG export, node search
  components/
    AppShell.tsx          sidebar nav + topbar (+ ToastProvider)
    ThemeToggle.tsx       light/dark toggle (persisted)
    Toast.tsx             toast notifications
  api/
    upload/route.ts       POST → Files API PUT of the XML into the input Volume
    run/route.ts          POST → jobs/run-now (maps form → widget params)
    status/route.ts       GET  → runs/get (+ runs/get-output; parses the JSON exit payload)
    cancel/route.ts       POST → jobs/runs/cancel
    outputs/route.ts      GET  → recent .xlsx outputs in the Volume (run history)
    download/route.ts     GET  → Files API stream of the .xlsx
lib/databricks.ts         server-only Databricks REST client (run/status/upload/cancel/list/download)
databricks-job.json       job definition for the CLI
.env.example              env var template
```

## Notes / troubleshooting
- **401 from Databricks** → token expired or lacks job/Files permission.
- **Upload fails (403/404)** → the token needs **write** on `INPUT_VOLUME` and the Files API
  (`/api/2.0/fs/files`) must be enabled for the Volume.
- **Download 403 “Path not allowed”** → the output path is outside `OUTPUT_VOLUME`.
- **Job succeeds but no diagram / download** → the notebook didn’t hit `dbutils.notebook.exit`
  (check the run’s logs); the path + diagram come from `runs/get-output`.
- **Diagram won’t render in-browser** → use the **Open in Mermaid Live** link instead; very large
  graphs are truncated by `CONFIG["mermaid_max_nodes"]` in the notebook.
- **Files API 404** → confirm the workspace has Unity Catalog **Volumes** Files API enabled
  and the path exists.
