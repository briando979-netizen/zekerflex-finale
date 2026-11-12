// ---------------------------------------------------------------------------
// Het BSN van de ID-kaart of het paspoort (13 nov 2026, eigenaar: "die BSN-vraag hoeft niet, dat lees je uit de
// ID-kaart"). Op een Nederlands document staat het BSN in het vrije veld van de MRZ: bij een ID-kaart (TD1) op regel 1,
// bij een paspoort (TD3) als persoonlijk nummer op regel 2, telkens 9 cijfers, vijf keer "<" en een eigen controlecijfer.
//
// We nemen het alleen over als alles klopt: een Nederlands document, het samengestelde controlecijfer (dat dekt het vrije
// veld, dus elk cijfer is echt zo van het document gelezen), het eigen controlecijfer van het BSN en de elfproef. De
// cijfers zelf verlaten deze functies nooit: terug gaat alleen de hash en de laatste 4, precies zoals het BSN-veld
// ze bewaart (lib/fiscal/store.ts, hashBsn). De werker bevestigt daarna zelf ("eindigend op 1234, klopt dat?"); pas
// dan staat het BSN in zijn fiscale gegevens. Alleen voor een uitzendkracht: zonder verloning hebben we geen grond
// om een BSN te verwerken. Nooit loggen, nooit in rawPayload. Puur (bewaren: lib/fiscal/bsn-voorstel.ts).
// ---------------------------------------------------------------------------

import { controleCijfer, leesMrz, type MrzFormaat, type MrzUitslag } from "@/lib/kyc/mrz";
import { hashBsn, validBsn } from "@/lib/fiscal/bsn";
import type { FiscalProfile } from "@/lib/fiscal/store";

export interface BsnVoorstel {
  /** zelfde hash als hashBsn: nooit de cijfers zelf */
  hash: string;
  last4: string;
}

/** Het vrije veld met zijn eigen controlecijfer: 15 tekens, of null als dit formaat er geen BSN in kwijt kan. */
function vrijVeld(formaat: MrzFormaat, regels: string[]): string | null {
  if (formaat === "TD1") {
    const r1 = regels[0] ?? "";
    // een documentnummer van meer dan 9 tekens loopt door in het vrije veld: dan staat er geen BSN
    if (r1.length !== 30 || r1[14] === "<") return null;
    return r1.slice(15, 30);
  }
  if (formaat === "TD3") {
    const r2 = regels[1] ?? "";
    return r2.length === 44 ? r2.slice(28, 43) : null;
  }
  // TD2: het vrije veld is te kort voor een BSN
  return null;
}

/** Het voorstel uit een al gelezen MRZ (regels + uitslag van leesMrz), of null als er niet zeker een BSN staat. */
export function bsnVoorstelUitMrz(formaat: MrzFormaat, regels: string[], uitslag: MrzUitslag | null): BsnVoorstel | null {
  if (!uitslag || uitslag.land !== "NLD" || !uitslag.volledig) return null;
  const vrij = vrijVeld(formaat, regels);
  const m = vrij ? /^(\d{9})<{5}(\d)$/.exec(vrij) : null;
  if (!m) return null;
  const cijfers = m[1] ?? "";
  if (String(controleCijfer(cijfers)) !== m[2] || !validBsn(cijfers)) return null;
  return hashBsn(cijfers);
}

/** Lezen en voorstellen in één keer, voor wie alleen de regels heeft. */
export function bsnVoorstelUitRegels(formaat: MrzFormaat, regels: string[], nu: Date = new Date()): BsnVoorstel | null {
  return bsnVoorstelUitMrz(formaat, regels, leesMrz(formaat, regels, nu));
}

/**
 * Wat er in de fiscale gegevens komt: alleen bij een uitzendkracht die nog geen BSN heeft. Een zzp'er of flexwerker
 * krijgt niets (geen grond om een BSN te verwerken); wie al een BSN heeft, houdt het zijne.
 */
export function bsnVoorstelPatch(
  f: Pick<FiscalProfile, "workerKind" | "bsnHash">,
  voorstel: BsnVoorstel | null,
  nu: Date = new Date(),
): Pick<FiscalProfile, "bsnVoorstelHash" | "bsnVoorstelLast4" | "bsnVoorstelAt"> | null {
  if (!voorstel || f.workerKind !== "uitzendkracht" || f.bsnHash) return null;
  return { bsnVoorstelHash: voorstel.hash, bsnVoorstelLast4: voorstel.last4, bsnVoorstelAt: nu.toISOString() };
}

// --- het voorstel opruimen ---------------------------------------------------------------------------------------
// fiscal: valt onder de bewaarplicht van de loonadministratie en blijft bij het wissen van een account staan. Een
// voorstel dat de werker nooit bevestigde, valt daar niet onder: het gaat weg bij het wissen (lib/privacy/anonymize.ts)
// en na 30 dagen zonder antwoord (retentieregel bsn_voorstel, lib/privacy/sweep.ts). Een bevestigd BSN blijft staan.

/** Alle velden van het voorstel leeg; de rest van de fiscale gegevens blijft. */
export const ZONDER_BSN_VOORSTEL = { bsnVoorstelHash: null, bsnVoorstelLast4: null, bsnVoorstelAt: null } as const;

export function heeftBsnVoorstel(f: Partial<Pick<FiscalProfile, "bsnVoorstelHash" | "bsnVoorstelLast4" | "bsnVoorstelAt">>): boolean {
  return Boolean(f.bsnVoorstelHash || f.bsnVoorstelLast4 || f.bsnVoorstelAt);
}

/** Is het voorstel van vóór `grens`? Zonder (leesbaar) tijdstip telt het als verlopen. */
export function bsnVoorstelVerlopen(f: Partial<Pick<FiscalProfile, "bsnVoorstelHash" | "bsnVoorstelLast4" | "bsnVoorstelAt">>, grens: Date): boolean {
  if (!heeftBsnVoorstel(f)) return false;
  const t = f.bsnVoorstelAt ? Date.parse(f.bsnVoorstelAt) : Number.NaN;
  return !Number.isFinite(t) || t < grens.getTime();
}
