import { NextResponse } from "next/server";
import { deleteGameRecord, loadGameRecord, saveGameRecord } from "@/lib/store";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const record = await loadGameRecord(params.id);
  if (!record) {
    return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, record });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const record = await loadGameRecord(params.id);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const body = await req.json();
    const patch: any = {};

    if (body.outline) patch.outline = body.outline;
    if (body.scenes) patch.scenes = body.scenes;
    if (body.plan) {
      patch.plan = body.plan;
      const assets = Array.isArray(body.plan?.assets) ? body.plan.assets : [];
      const assetMeta: Record<string, { type: string; needsCutout: boolean; file: string }> = {};
      for (const asset of assets) {
        const id = String(asset.id ?? "").trim() || `asset-${Object.keys(assetMeta).length + 1}`;
        const file = `asset-${slugify(id)}.png`;
        assetMeta[id] = {
          type: String(asset.type ?? "other"),
          needsCutout: !!asset.needsCutout,
          file,
        };
      }
      patch.assetMeta = assetMeta;
    }
    if (typeof body.gameHtml === "string") patch.gameHtml = body.gameHtml;

    const saved = await saveGameRecord(params.id, patch);
    return NextResponse.json({ ok: true, record: saved ?? record });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const record = await loadGameRecord(params.id);
  if (!record) {
    return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });
  }
  await deleteGameRecord(params.id);
  return NextResponse.json({ ok: true });
}
