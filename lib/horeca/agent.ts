import { createHash } from "crypto";
import { DAGEN, leesTijden } from "@/lib/horeca/tijden";
import { leesInstellingen } from "@/lib/horeca/reserveren";

// ---------------------------------------------------------------------------
// Reserveren via AI-assistenten (/api/agent/horeca), het pure deel: hoe een
// zaak en een reservering eruitzien voor een assistent, en de Idempotency-Key.
// Een assistent boekt met precies dezelfde regels als de eigen site (capaciteit,
// openingstijden, grootste groep, dagen vooruit: lib/horeca/reserveringen.ts).
// Geen database: los te testen.
// ---------------------------------------------------------------------------

export const STATUS_TEKST: Record<string, string> = {
  BEVESTIGD: "Bevestigd",
  AANGEKOMEN: "Gast is er",
  NIET_GEKOMEN: "Niet gekomen",
  GEANNULEERD: "Geannuleerd",
};

export interface AgentZaakBron {
  slug: string;
  naam: string;
  soort: string;
  plaats: string;
  adres: string;
  telefoon: string;
  openingstijden: unknown;
  reserveren: unknown;
}

/** Openingstijden per dagnaam ("maandag" … "zondag"), null = dicht. */
export function openingstijdenPerDag(json: unknown): Record<string, { van: string; tot: string } | null> {
  const t = leesTijden(json);
  return Object.fromEntries(DAGEN.map(({ dag, naam }) => [naam.toLowerCase(), t[dag] ?? null]));
}

export function zaakVoorAgent(z: AgentZaakBron, basis: string) {
  const inst = leesInstellingen(z.reserveren);
  return {
    slug: z.slug,
    naam: z.naam,
    soort: z.soort,
    plaats: z.plaats,
    adres: z.adres,
    telefoon: z.telefoon,
    website: `${basis}/horeca/${z.slug}`,
    openingstijden: openingstijdenPerDag(z.openingstijden),
    reserveren: {
      groterDanBellen: inst.maxGroep,
      dagenVooruit: inst.dagenVooruit,
      elkeMinuten: inst.slotMinuten,
      tafelBezetMinuten: inst.verblijfMinuten,
    },
    links: {
      beschikbaarheid: `${basis}/api/agent/horeca/${z.slug}/beschikbaarheid?datum={JJJJ-MM-DD}&personen={aantal}`,
      reserveren: `${basis}/api/agent/horeca/${z.slug}/reserveringen`,
    },
  };
}

export interface AgentReserveringBron {
  id: string;
  datum: string;
  tijd: string;
  personen: number;
  naam: string;
  status: string;
}

/** Een reservering voor de assistent. Het token geeft precies deze reservering: bekijken en annuleren. */
export function reserveringVoorAgent(r: AgentReserveringBron, z: { slug: string; naam: string }, token: string, basis: string, gastLink: string) {
  return {
    id: r.id,
    status: r.status,
    statusTekst: STATUS_TEKST[r.status] ?? r.status,
    datum: r.datum,
    tijd: r.tijd,
    personen: r.personen,
    naam: r.naam,
    zaak: { slug: z.slug, naam: z.naam },
    token,
    links: {
      bekijken: `${basis}/api/agent/horeca/reserveringen/${token}`,
      annuleren: `${basis}/api/agent/horeca/reserveringen/${token}`,
      annulerenVoorDeGast: gastLink,
    },
  };
}

/** De Idempotency-Key uit de kop: 1–200 zichtbare tekens, anders null (dan geen bescherming tegen dubbel). */
export function leesIdemSleutel(kop: string | null): string | null {
  const s = kop?.trim() ?? "";
  return s.length >= 1 && s.length <= 200 && /^[\x21-\x7e]+$/.test(s) ? s : null;
}

/** Waar we de sleutel onder bewaren (per zaak, gehasht). */
export const idemOpslag = (slug: string, sleutel: string) => `agent-horeca:idem:${createHash("sha256").update(`${slug}\n${sleutel}`).digest("hex")}`;

/** Vingerafdruk van wat er geboekt wordt: dezelfde sleutel met een ander verzoek is een fout van de assistent. */
export function verzoekAfdruk(r: { datum: string; tijd: string; personen: number; naam: string; email: string; telefoon: string; opmerking: string }): string {
  const vast = [r.datum, r.tijd, String(r.personen), r.naam.trim(), r.email.trim().toLowerCase(), r.telefoon.trim(), r.opmerking.trim()].join("\n");
  return createHash("sha256").update(vast).digest("hex");
}
