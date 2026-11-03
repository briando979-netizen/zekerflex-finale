"use client";

import Link from "next/link";
import { useState } from "react";
import type { ErrorGroup } from "@/lib/ops/error-journal";
import { kanBouwerOplossen } from "@/lib/bouwer/fout-opdracht";

// Knop in het foutenlogboek (components/admin/ErrorJournalPanel.tsx): geeft de
// melding als opdracht aan de Bouwer. Er gaat alleen het id mee; de server bouwt
// de opdracht. Niet bij meldingen die tekst van bezoekers kunnen bevatten.

export function BouwerFixKnop({ group }: { group: ErrorGroup }) {
  const [stand, setStand] = useState<"klaar" | "bezig" | "gestart">("klaar");
  const [fout, setFout] = useState<string | null>(null);

  if (!kanBouwerOplossen(group)) return null;

  if (stand === "gestart") {
    return (
      <Link href="/admin/zekerflex-ai" className="a-button text-xs">
        Bouwer bezig: bekijk
      </Link>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className="a-button text-xs"
        disabled={stand === "bezig"}
        title="De Bouwer zoekt de oorzaak en stelt een wijziging voor; jij keurt die goed in ZekerFlex AI → Bouwer."
        onClick={async () => {
          setStand("bezig");
          setFout(null);
          try {
            const res = await fetch("/api/admin/bouwer/fout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: group.id }),
            });
            if (!res.ok) {
              const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string };
              throw new Error((typeof d.error === "string" ? d.error : d.error?.message) || "Starten mislukt");
            }
            setStand("gestart");
          } catch (e) {
            setFout(e instanceof Error ? e.message : "Starten mislukt");
            setStand("klaar");
          }
        }}
      >
        {stand === "bezig" ? "Starten…" : "Laat de Bouwer dit oplossen"}
      </button>
      {fout && (
        <span role="alert" className="max-w-[16rem] text-[11px]" style={{ color: "var(--a-crit, #F07C6B)" }}>
          {fout}
        </span>
      )}
    </span>
  );
}
