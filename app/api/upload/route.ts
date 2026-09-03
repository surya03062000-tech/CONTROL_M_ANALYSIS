import { NextRequest, NextResponse } from "next/server";
import { uploadFile, uploadFileTo, downloadFile, deleteFile, getInputVolume } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Finalize can mean downloading + re-uploading many chunks for a big file.
export const maxDuration = 300;

function gate(req: NextRequest): boolean {
  const pw = process.env.APP_PASSWORD || "";
  if (!pw) return true;
  return req.headers.get("x-app-password") === pw;
}

// Vercel rejects any single request body past a small fixed size on BOTH the
// Node.js and Edge runtimes (413 FUNCTION_PAYLOAD_TOO_LARGE) — a real Control-M
// workspace XML export routinely exceeds it. So the client never sends the
// whole file in one request: it POSTs the file as many small chunks
// (action=chunk), each landing as a temp part in the input Volume, then POSTs
// action=finalize, which downloads every part back (an outbound call to
// Databricks — not subject to Vercel's inbound body limit), concatenates them,
// and PUTs the combined file to its real destination. Works for any file size.
const PART_DIR = ".uploads";

function safeUploadId(id: string): string {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new Error("Invalid upload id.");
  return id;
}
const partName = (i: number) => `${String(i).padStart(6, "0")}.part`;

export async function POST(req: NextRequest) {
  try {
    if (!gate(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const volume = getInputVolume();
    if (!volume) {
      return NextResponse.json({ error: "INPUT_VOLUME (or OUTPUT_VOLUME) is not configured — cannot upload." }, { status: 500 });
    }

    const form = await req.formData();
    const action = String(form.get("action") || "chunk");
    const uploadId = safeUploadId(String(form.get("uploadId") || ""));
    const partsVolume = `${volume}/${PART_DIR}/${uploadId}`;

    if (action === "chunk") {
      const idx = Number(form.get("chunkIndex"));
      const file = form.get("file");
      if (!Number.isInteger(idx) || idx < 0) {
        return NextResponse.json({ error: "Invalid chunk index." }, { status: 400 });
      }
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "No chunk data provided." }, { status: 400 });
      }
      const buf = Buffer.from(await (file as File).arrayBuffer());
      await uploadFileTo(partsVolume, partName(idx), buf);
      return NextResponse.json({ ok: true, chunkIndex: idx });
    }

    if (action === "finalize") {
      const filenameRaw = String(form.get("filename") || "");
      const totalChunks = Number(form.get("totalChunks"));
      if (!filenameRaw.toLowerCase().endsWith(".xml")) {
        return NextResponse.json({ error: "Please upload a .xml file." }, { status: 400 });
      }
      if (!Number.isInteger(totalChunks) || totalChunks <= 0) {
        return NextResponse.json({ error: "Invalid chunk count." }, { status: 400 });
      }

      const parts: Buffer[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const res = await downloadFile(`${partsVolume}/${partName(i)}`);
        if (!res.ok) {
          return NextResponse.json(
            { error: `Upload incomplete — missing chunk ${i + 1}/${totalChunks}. Please retry the upload.` },
            { status: 400 }
          );
        }
        parts.push(Buffer.from(await res.arrayBuffer()));
      }
      const combined = Buffer.concat(parts);
      const { path } = await uploadFile(filenameRaw, combined);
      const filename = filenameRaw.replace(/\.xml$/i, ""); // notebook widget wants the name w/o .xml

      // Best-effort cleanup of the temp parts — awaited (a serverless instance
      // can freeze right after the response is sent, so fire-and-forget here
      // isn't reliable), but each delete swallows its own error so one failure
      // can't fail the request; the upload has already succeeded at this point.
      await Promise.all(
        Array.from({ length: totalChunks }, (_, i) => deleteFile(`${partsVolume}/${partName(i)}`).catch(() => {}))
      );

      return NextResponse.json({ path, filename, size: combined.length, volume });
    }

    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
