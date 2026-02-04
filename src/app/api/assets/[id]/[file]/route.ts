import { NextResponse } from "next/server";
import { readAssetFile } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string; file: string } }) {
  try {
    const buffer = await readAssetFile(params.id, params.file);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "Asset not found" }, { status: 404 });
  }
}
