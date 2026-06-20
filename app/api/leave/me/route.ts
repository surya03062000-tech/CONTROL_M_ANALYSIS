import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/leaveAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  return NextResponse.json({ session });
}
