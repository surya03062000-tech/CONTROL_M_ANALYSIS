# Control-M Analyzer — Trigger Website (Vercel + Databricks Jobs)

A small Next.js app you deploy on **Vercel**. It lets anyone:

1. Fill in the same parameters as the notebook widgets,
2. **Trigger** the Control-M Analyzer Databricks **Job**,
3. Watch the **run status** live on the page,
4. **Download** the generated `.xlsx` once the run succeeds.

The Databricks token stays on the server (API routes only) — it is never sent to the browser.

```
Browser ──POST /api/run──▶  Databricks  jobs/run-now
   ▲                                   │ run_id
   │  poll /api/status ◀──────────────┘
   │        └─ runs/get  +  runs/get-output (exit value = output path)
   └──GET /api/download──▶ Databricks  Files API  ──▶  streams the .xlsx
```

---

## 1. Create the Databricks Job (one time)

The website triggers an **existing** job by its numeric ID, so create it first.

### Option A — Databricks UI
1. Upload / import `v8_github_source.py` into your workspace as a notebook.
2. **Workflows → Create Job** → add a **Notebook** task pointing at that notebook.
3. Under **Parameters**, add these keys (values can stay empty — the website overrides them):
   `01_xml_filename, 02_folder_filter, 03_input_mode, 04_input_job_names,`
   `05_input_table_names, 06_table_match_mode, 07_direction, 08_max_depth`
4. Pick a cluster, **Create**, then copy the **Job ID** (top-right of the job page).

### Option B — Databricks CLI
Edit `databricks-job.json` (set `notebook_path`, `existing_cluster_id`), then:
```bash
databricks jobs create --json @databricks-job.json
# → { "job_id": 123456789012345 }   ← copy this
```

> The notebook already ends with `dbutils.notebook.exit(output_file)`, so the job run
> returns the exact output `.xlsx` path. The website reads it via `runs/get-output`.

---

## 2. Get a Databricks token

User Settings → **Developer → Access tokens → Generate**. The identity needs:
- permission to **run** the job, and
- **read** on the output Volume (`/Volumes/edl_qa/qa_agent/control_m`) for the Files API.

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
| `APP_PASSWORD` | *(optional)* a shared password to gate the UI |

`OUTPUT_VOLUME` **must match** `CONFIG["output_volume"]` in the notebook (used to sandbox downloads).

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

```
app/
  page.tsx              UI: form + live status + download button
  layout.tsx, globals.css
  api/
    run/route.ts        POST → jobs/run-now (maps form → widget params)
    status/route.ts     GET  → runs/get (+ runs/get-output on success)
    download/route.ts   GET  → Files API stream of the .xlsx
lib/databricks.ts       server-only Databricks REST client
databricks-job.json     job definition for the CLI
.env.example            env var template
```

## Notes / troubleshooting
- **401 from Databricks** → token expired or lacks job/Files permission.
- **Download 403 “Path not allowed”** → the output path is outside `OUTPUT_VOLUME`.
- **Job succeeds but no download button** → the notebook didn’t hit `dbutils.notebook.exit`
  (check the run’s logs); the path comes from `runs/get-output`.
- **Files API 404** → confirm the workspace has Unity Catalog **Volumes** Files API enabled
  and the path exists.
