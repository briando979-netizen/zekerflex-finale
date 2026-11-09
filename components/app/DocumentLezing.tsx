"use client";

import { fill, type AuthDict } from "@/lib/i18n/auth";

// ---------------------------------------------------------------------------
// De MRZ van een documentfoto laten lezen (POST /api/onboarding/document-lezen)
// en tonen wat er gelezen is. Gedeeld door het verificatieformulier en de
// ID-scan van ZekerFlex (components/app/IdScan.tsx).
// ---------------------------------------------------------------------------

/** Wat de server van de foto las (lib/kyc/mrz-lezen.ts voorScherm), klaar voor het scherm. */
export interface Lezing {
  status: "bezig" | "klaar" | "fout";
  gevonden?: boolean;
  geldig?: boolean;
  verlopen?: boolean;
  documentnummer?: string | null;
  vervaldatum?: string | null;
  soort?: "PASSPORT" | "ID_CARD" | "OTHER" | null;
  naam?: string;
  melding?: string;
}

interface Antwoord {
  gevonden?: boolean;
  geldig?: boolean;
  verlopen?: boolean;
  documentnummer?: string | null;
  vervaldatum?: string | null;
  soort?: "PASSPORT" | "ID_CARD" | "OTHER" | null;
  voornamen?: string | null;
  achternaam?: string | null;
  error?: { message?: string };
}

/** yyyy-mm-dd → dd-mm-jjjj (gewone tekst, geen tijdzone nodig) */
export const datumNl = (iso: string) => {
  const [j, m, d] = iso.split("-");
  return `${d}-${m}-${j}`;
};

const titel = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\S)/g, (_m, voor: string, l: string) => voor + l.toUpperCase());

/** Een goede lezing: de controlecijfers kloppen en het document is niet verlopen. */
export const goedGelezen = (l: Lezing | null): boolean => Boolean(l && l.status === "klaar" && l.geldig && !l.verlopen);

/**
 * Stuurt één foto naar de server en geeft terug wat er gelezen is. Gooit nooit.
 * Met `overdracht` (de telefoon na een QR-code, niet ingelogd) via /api/id-overdracht/lezen.
 */
export async function leesDocumentFoto(file: File, t: AuthDict["onb"], overdracht?: { code: string; toestel: string }): Promise<Lezing> {
  try {
    const body = new FormData();
    body.set("foto", file);
    if (overdracht) {
      body.set("code", overdracht.code);
      // alleen het toestel dat de link als eerste opende (lib/kyc/overdracht.ts)
      body.set("toestel", overdracht.toestel);
    }
    const res = await fetch(overdracht ? "/api/id-overdracht/lezen" : "/api/onboarding/document-lezen", { method: "POST", body });
    const data = (await res.json().catch(() => ({}))) as Antwoord;
    if (!res.ok) return { status: "fout", melding: data.error?.message ?? t.lezenOnzeker };
    const naam = [data.voornamen, data.achternaam]
      .filter((s): s is string => Boolean(s))
      .map(titel)
      .join(" ");
    return {
      status: "klaar",
      gevonden: Boolean(data.gevonden),
      geldig: Boolean(data.geldig),
      verlopen: Boolean(data.verlopen),
      documentnummer: data.documentnummer ?? null,
      vervaldatum: data.vervaldatum ?? null,
      soort: data.soort ?? null,
      ...(naam ? { naam } : {}),
    };
  } catch {
    return { status: "fout", melding: t.lezenOnzeker };
  }
}

/** Laat direct zien wat er van het document gelezen is: goed, verlopen, of opnieuw fotograferen. */
export function DocumentLezing({ lezing, t }: { lezing: Lezing; t: AuthDict["onb"] }) {
  if (lezing.status === "bezig") {
    return <p className="rounded-lg bg-paper-soft px-3 py-2.5 text-xs text-neutralx-600">{t.lezenBezig}</p>;
  }
  if (lezing.status === "fout" || !lezing.gevonden || !lezing.geldig) {
    return (
      <p className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
        {lezing.melding ?? t.lezenOnzeker}
      </p>
    );
  }
  if (lezing.verlopen && lezing.vervaldatum) {
    return (
      <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">
        {fill(t.lezenVerlopen, { datum: datumNl(lezing.vervaldatum) })}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-ok/30 bg-ok/5 px-3 py-2.5">
      <p className="text-sm font-semibold text-ink">✓ {t.lezenGoed}</p>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {lezing.naam && (
          <>
            <dt className="text-neutralx-500">{t.lezenNaam}</dt>
            <dd className="text-ink">{lezing.naam}</dd>
          </>
        )}
        {lezing.documentnummer && (
          <>
            <dt className="text-neutralx-500">{t.lezenNummer}</dt>
            <dd className="font-mono text-ink">{lezing.documentnummer}</dd>
          </>
        )}
        {lezing.vervaldatum && (
          <>
            <dt className="text-neutralx-500">{t.lezenGeldig}</dt>
            <dd className="text-ink">{datumNl(lezing.vervaldatum)}</dd>
          </>
        )}
      </dl>
      <p className="mt-1.5 text-xs text-neutralx-500">{t.lezenCijfers}</p>
    </div>
  );
}
