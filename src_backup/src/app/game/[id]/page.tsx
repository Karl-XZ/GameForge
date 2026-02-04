import { notFound } from "next/navigation";
import { loadGameRecord } from "@/lib/store";
import { buildTextAdventureHtml, buildSideScrollerHtml } from "@/lib/export";
import { GameFrame } from "@/components/GameFrame";

export const dynamic = "force-dynamic";

export default async function GamePage({ params }: { params: { id: string } }) {
  const record = await loadGameRecord(params.id);
  if (!record) return notFound();

  const assetBase = `/api/assets/${record.id}/`;
  const html = record.mode === "text-adventure"
    ? buildTextAdventureHtml(record, assetBase)
    : buildSideScrollerHtml(record, assetBase);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">试玩：{record.outline?.title ?? record.plan?.title ?? record.id}</h1>
        <p className="text-sm text-text/60 mt-1">Game ID: {record.id}</p>
      </header>
      <GameFrame html={html} />
    </main>
  );
}
