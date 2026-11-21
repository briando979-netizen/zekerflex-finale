"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PARTNER_VOORWAARDEN_PAD, PARTNER_VOORWAARDEN_VERSIE } from "@/lib/uitzend/voorwaarden";

/**
 * Beheer → Bedrijf: "Uitzendpartner" (POST /api/admin/uitzendpartner, lib/uitzend/partners.ts). Een uitzendpartner is
 * de werkgever bij zijn eigen klussen: werkers vragen bij hem een uitzendcontract aan, hij betaalt het loon en ZekerFlex
 * stuurt alleen de factuur voor de platformkosten. Zet hem pas aan na een controle van de inschrijving als uitlener.
 * De stand komt na het opslaan van de server (sinds), niet uit de klik zelf. Zelfde opzet als EigenTestSchakelaar.
 */
export function UitzendPartnerSchakelaar({ id, sinds: beginSinds }: { id: string; sinds: string | null }) {
  const router = useRouter();
  const [sinds, setSinds] = useState<string | null>(beginSinds);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const aan = sinds !== null;

  async function schakel() {
    setBezig(true);
    setFout(null);
    const r = await fetch("/api/admin/uitzendpartner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, aan: !aan }),
    }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { sinds?: string | null; error?: { message?: string } } | null;
    if (r?.ok && d) {
      setSinds(d.sinds ?? null);
      router.refresh();
    } else {
      setFout(d?.error?.message ?? "Opslaan lukte niet. Probeer het opnieuw.");
    }
    setBezig(false);
  }

  const datum = sinds ? new Date(sinds).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <div className="mt-2 text-xs" style={{ color: "var(--a-text)" }}>
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={aan} disabled={bezig} onChange={() => void schakel()} />
        <span className="font-medium">Uitzendpartner (het bureau is de werkgever)</span>
      </label>
      <p className="mt-1" style={{ color: "var(--a-mute)" }}>
        {aan
          ? `Sinds ${datum}: de klussen van dit bedrijf zijn uitzendklussen op naam van het bureau. Werkers vragen er een uitzendcontract aan, het bureau betaalt het loon; ZekerFlex stuurt alleen de factuur voor de platformkosten.`
          : `Uit: een gewoon bedrijf. Zet dit pas aan als je de eisen uit artikel 3 hebt gecontroleerd (KVK, registratie als uitlener, SNA-keurmerk of Wtta-toelating, cao, verzekering) en het bureau akkoord gaf op de partnervoorwaarden, versie ${PARTNER_VOORWAARDEN_VERSIE}.`}
      </p>
      <a href={PARTNER_VOORWAARDEN_PAD} target="_blank" rel="noopener" className="mt-1 inline-block underline" style={{ color: "var(--a-accent-ink)" }}>
        Partnervoorwaarden voor uitzendbureaus
      </a>
      {fout && (
        <p role="alert" className="mt-1" style={{ color: "var(--a-crit, #b42318)" }}>
          {fout}
        </p>
      )}
    </div>
  );
}
