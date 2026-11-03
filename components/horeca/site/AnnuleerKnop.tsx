"use client";

import { useState } from "react";

// De gast bevestigt het annuleren met een knop (een linkscanner die de pagina
// opent, annuleert dus niets).
export function AnnuleerKnop({ slug, token }: { slug: string; token: string }) {
  const [stand, setStand] = useState<"" | "bezig" | "klaar">("");
  const [fout, setFout] = useState("");
  if (stand === "klaar") {
    return (
      <p role="status" className="rounded-[1.75rem] bg-white p-6 font-semibold shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
        Je reservering is geannuleerd. Jammer dat je niet komt, hopelijk tot een andere keer!
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {fout && (
        <p role="alert" className="rounded-2xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
          {fout}
        </p>
      )}
      <button
        type="button"
        disabled={stand === "bezig"}
        onClick={async () => {
          setStand("bezig");
          setFout("");
          const r = await fetch(`/api/horeca/site/${slug}/annuleren`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
          const d = r ? ((await r.json().catch(() => ({}))) as { error?: { message?: string } }) : {};
          if (r?.ok) setStand("klaar");
          else {
            setStand("");
            setFout(d.error?.message ?? "Annuleren lukte niet. Bel ons even.");
          }
        }}
        className="w-full rounded-full bg-[#B91C1C] py-4 font-bold text-white disabled:opacity-60"
      >
        {stand === "bezig" ? "Bezig…" : "Ja, annuleer mijn reservering"}
      </button>
    </div>
  );
}
