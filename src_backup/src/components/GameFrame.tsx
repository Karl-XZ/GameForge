"use client";

import * as React from "react";

export function GameFrame({ html }: { html: string }) {
  return (
    <iframe
      title="game-preview"
      srcDoc={html}
      className="w-full min-h-[80vh] rounded-2xl border border-border bg-black"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
