import { NextResponse } from "next/server";
import { listGames } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const games = await listGames();
  const summary = games.map((g) => ({
    id: g.id,
    mode: g.mode,
    status: g.status,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    title: g.outline?.title ?? g.plan?.title ?? "",
  }));
  return NextResponse.json({ ok: true, games: summary });
}
