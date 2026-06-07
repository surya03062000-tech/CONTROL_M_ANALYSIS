import { NextRequest, NextResponse } from "next/server";
import { downloadFile } from "@/lib/databricks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OUTPUT_VOLUME = (process.env.OUTPUT_VOLUME || "").replace(/\/+$/, "");

export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get("path");
    if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

    // Safety: only allow downloads from the configured output Volume.
    if (OUTPUT_VOLUME && !path.startsWith(OUTPUT_VOLUME)) {
      return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
    }

    const res = await downloadFile(path);
    if (!res.ok || !res.body) {
      return NextResponse.json(
        { error: `Download failed (${res.status}): ${await res.text()}` },
        { status: 502 }
      );
    }

    const name = path.split("/").pop() || "output.xlsx";
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
