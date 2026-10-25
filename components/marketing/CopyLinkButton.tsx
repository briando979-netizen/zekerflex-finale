"use client";

import { copyText } from "@/lib/clipboard";

import { useState } from "react";

export function CopyLinkButton({
  path,
  label = "Deel deze pagina",
}: {
  path: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await copyText(`${window.location.origin}${path}`);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button type="button" onClick={copy} className="btn-ghost text-sm">
      {done ? "Link gekopieerd ✓" : label}
    </button>
  );
}
