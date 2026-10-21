"use client";

import { useState } from "react";

/** Admin: merge duplicate 1-on-1 conversations into one per pair of people. */
export function MergeDuplicateChats() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    if (
      !window.confirm(
        "Dubbele gesprekken samenvoegen?\n\nPer twee personen blijft één gesprek over. Alle berichten uit de dubbele gesprekken worden daarin op tijd gezet; daarna worden de lege dubbelen verwijderd.",
      )
    ) {
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/chat/merge-duplicates", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setNote(
        res.ok
          ? d.merged > 0
            ? `Klaar: ${d.merged} dubbele gesprekken samengevoegd (${d.pairs} personen-paren, ${d.messagesMoved} berichten verplaatst). Ververs de pagina.`
            : "Er waren geen dubbele gesprekken."
          : (d?.error?.message ?? "Samenvoegen mislukt."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button type="button" onClick={() => void run()} disabled={busy} className="btn-ghost text-sm disabled:opacity-50">
        {busy ? "Bezig…" : "Dubbele gesprekken samenvoegen"}
      </button>
      {note && <span className="text-neutralx-600">{note}</span>}
    </div>
  );
}
