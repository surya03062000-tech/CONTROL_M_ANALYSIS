import { NextRequest, NextResponse } from "next/server";
import { runNow, type NotebookParams } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function gate(req: NextRequest): boolean {
  const pw = process.env.APP_PASSWORD || "";
  if (!pw) return true;
  return req.headers.get("x-app-password") === pw;
}

export async function POST(req: NextRequest) {
  try {
    if (!gate(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();

    // Map the form fields → notebook widget names (must match the notebook's widgets).
    const params: NotebookParams = {
      "01_xml_filename": String(body.xmlFilename || "").trim(),
      "02_folder_filter": String(body.folderFilter || "").trim(),
      "03_input_mode": String(body.inputMode || "job_name").trim(),
      "04_input_job_names": String(body.jobNames || "").trim(),
      "05_input_table_names": String(body.tableNames || "").trim(),
      "06_table_match_mode": String(body.tableMatchMode || "exact").trim(),
      "07_direction": String(body.direction || "predecessor").trim(),
      "08_max_depth": String(body.maxDepth ?? "0").trim(),
    };

    if (!params["01_xml_filename"]) {
      return NextResponse.json({ error: "XML filename is required." }, { status: 400 });
    }
    if (params["03_input_mode"] === "job_name" && !params["04_input_job_names"]) {
      return NextResponse.json({ error: "Job name(s) required in job_name mode." }, { status: 400 });
    }
    if (params["03_input_mode"] === "table_name" && !params["05_input_table_names"]) {
      return NextResponse.json({ error: "Table name(s) required in table_name mode." }, { status: 400 });
    }

    const { run_id } = await runNow(params);
    return NextResponse.json({ run_id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
