import { notFound } from "next/navigation";
import { loadGameRecord } from "@/lib/store";
import { buildSideScrollerHtml, buildTextAdventureHtml } from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GamePage({ params }: { params: { id: string } }) {
  const id = params.id;
  const record = await loadGameRecord(id);
  if (!record) return notFound();

  const assetBase = `/api/assets/${id}/`;

  let html = "";
  if (record.mode === "text-adventure") {
    html = buildTextAdventureHtml(record, assetBase );
  } else {
    html = buildSideScrollerHtml(record, assetBase );
  }

  if (!html || html.trim().length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-xl font-semibold">Game not ready</h1>
        <p className="mt-2 text-sm text-text/70">
          This game has not generated playable HTML yet. Please generate the required steps first and refresh.
        </p>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", margin: 0, padding: 0 }}>
      <iframe
        title={`game-${id}`}
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"
        style={{ width: "100%", height: "100%", border: "none" }}
      />
    </div>
  );
}
