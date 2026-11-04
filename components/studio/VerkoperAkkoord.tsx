"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, btn } from "@/components/studio/ui";
import { VERKOOP_COMMISSIE_PCT, VERKOPER_UITBETALEN_VANAF_CENTS, VERKOPER_VAST_NA_DAGEN, VERKOPER_VERZENDT_BINNEN_WERKDAGEN } from "@/lib/shop/verkoper-core";

// Studio → Verkopen: de verkoopvoorwaarden in gewone taal, en akkoord geven.

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

const VOORWAARDEN = [
  `Je verkoopt alleen nieuwe producten die je zelf mag verkopen, met een eerlijke foto, naam en prijs (inclusief btw).`,
  `Elk product gaat eerst langs ZekerFlex. We mogen een product weigeren of uit de shop halen als het niet past of klachten krijgt.`,
  `De koper betaalt aan ZekerFlex. Jij verstuurt binnen ${VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen en vult de track-en-trace in.`,
  `De koper heeft 14 dagen bedenktijd. Retouren en garantie regel jij met de koper; ZekerFlex helpt als het misgaat.`,
  `ZekerFlex houdt ${VERKOOP_COMMISSIE_PCT}% commissie in over het verkoopbedrag. Er is geen abonnement en er zijn geen andere kosten.`,
  `${VERKOPER_VAST_NA_DAGEN} dagen na de bestelling staat de verkoop vast. We betalen maandelijks uit op je rekening, vanaf ${euro(VERKOPER_UITBETALEN_VANAF_CENTS)}.`,
  `ZekerFlex moet verkopen op het platform jaarlijks doorgeven aan de Belastingdienst (DAC7). Daarvoor gebruiken we je bedrijfsgegevens en je KVK-nummer.`,
];

export function VerkoperAkkoord() {
  const router = useRouter();
  const [vink, setVink] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const verstuur = async (e: FormEvent) => {
    e.preventDefault();
    if (!vink) {
      setFout("Vink aan dat je akkoord gaat met de verkoopvoorwaarden.");
      return;
    }
    setFout("");
    setBezig(true);
    try {
      const res = await fetch("/api/werkgever/verkopen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ akkoord: true }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFout(data?.error?.message ?? "Dat is niet gelukt. Probeer het opnieuw.");
        return;
      }
      router.refresh();
    } catch {
      setFout("Geen verbinding. Controleer je internet en probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  };

  return (
    <Card title="De afspraken">
      <ul className="space-y-2.5 text-sm leading-relaxed text-[#303030]">
        {VOORWAARDEN.map((v) => (
          <li key={v} className="flex gap-3">
            <span aria-hidden className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1a1a1a]" />
            <span>{v}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={verstuur} className="mt-5 border-t border-[#ebebeb] pt-4">
        <label className="flex items-start gap-3 text-sm text-[#303030]">
          <input type="checkbox" checked={vink} onChange={(e) => setVink(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#1a1a1a]" />
          <span>Ik ga namens mijn bedrijf akkoord met deze verkoopvoorwaarden.</span>
        </label>
        {fout && (
          <p role="alert" className="mt-3 text-sm font-semibold text-[#b42318]">
            {fout}
          </p>
        )}
        <button type="submit" disabled={bezig} className={`${btn.primary} mt-4`}>
          {bezig ? "Bezig…" : "Akkoord, ik wil verkopen"}
        </button>
      </form>
    </Card>
  );
}
