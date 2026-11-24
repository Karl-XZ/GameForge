import { NextResponse } from "next/server";
import { loadVersion, snapshotGame } from "@/lib/versions";
import { buildZipBuffer } from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const selected=new URL(req.url).searchParams.get("version");
  const version=selected?await loadVersion(params.id,selected):await snapshotGame(params.id).catch(()=>null);
  const record=version?.record;
  if (!record) {
    return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });
  }

  const buffer = await buildZipBuffer(record, version!);
  const filename = `game-${record.id}.zip`;

  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
