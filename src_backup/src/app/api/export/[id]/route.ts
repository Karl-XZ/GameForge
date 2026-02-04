import { NextResponse } from "next/server";
import { loadGameRecord } from "@/lib/store";
import { buildZipBuffer } from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const record = await loadGameRecord(params.id);
  if (!record) {
    return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });
  }

  const buffer = await buildZipBuffer(record);
  const filename = `game-${record.id}.zip`;

  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
