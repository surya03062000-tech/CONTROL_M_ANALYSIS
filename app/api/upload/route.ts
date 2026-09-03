import { NextRequest, NextResponse } from "next/server";
import { uploadFile, getInputVolume } from "@/lib/databricks";

export const dynamic = "force-dynamic";
// Vercel's Node.js Serverless Functions hard-cap the request body at 4.5 MB
// (FUNCTION_PAYLOAD_TOO_LARGE) — real Control-M workspace XML exports routinely
// exceed that, which is why uploads were failing. Edge Functions don't have that
// fixed cap (the body is streamed rather than buffered by the platform in front
// of the function), so this route runs on the Edge runtime instead.
export const runtime = "edge";

function gate(req: NextRequest): boolean {
  const pw = process.env.APP_PASSWORD || "";
  if (!pw) return true;
  return req.headers.get("x-app-password") === pw;
}

// POST a multipart form with a single `file` (the Control-M XML). It is streamed
// straight into the input Volume via the Databricks Files API; the notebook then
// reads it by filename. Returns the uploaded path + the filename (without .xml)
// to pre-fill the run form.
export async function POST(req: NextRequest) {
  try {
    if (!gate(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const f = file as File;
    if (!f.name.toLowerCase().endsWith(".xml")) {
      return NextResponse.json({ error: "Please upload a .xml file." }, { status: 400 });
    }

    // Uint8Array rather than Buffer — the Edge runtime doesn't guarantee the
    // Node Buffer global, and fetch()/uploadFile() accept Uint8Array natively.
    const buf = new Uint8Array(await f.arrayBuffer());
    const { path } = await uploadFile(f.name, buf);
    const filename = f.name.replace(/\.xml$/i, ""); // notebook widget wants the name w/o .xml

    return NextResponse.json({
      path,
      filename,
      size: buf.length,
      volume: getInputVolume(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
