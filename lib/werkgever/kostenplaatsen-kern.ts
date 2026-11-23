// ---------------------------------------------------------------------------
// Kostenplaatsen / PO-nummers van een bedrijf (Instellingen → Kostenplaatsen, 23 nov 2026, naar YoungOnes): de lijst waaruit je bij het
// uitzetten van een klus kiest. Voor de boekhouding: de naam komt op de klus (Shift.kostenplaats), de factuur en in de export.
// Puur deel (regels en rekenen, geen prisma of kv), ook voor de browser. De lijst zelf staat in OrgProfileExtra.costCentres
// (lib/profile/store.ts, KV "profile-org:<tenantId>"); de server-kant staat in lib/werkgever/kostenplaatsen.ts.
// ---------------------------------------------------------------------------

/** Hooguit zoveel kostenplaatsen: dezelfde grens als PUT /api/orgs (costCentres). */
export const KOSTENPLAATS_MAX = 50;
/** Hoogstens zoveel tekens: dezelfde grens als Shift.kostenplaats bij het uitzetten (lib/shifts/create.ts). */
export const KOSTENPLAATS_LENGTE = 60;

export type KostenplaatsFout = "leeg" | "te-lang" | "dubbel" | "vol" | "onbekend" | "in-gebruik";

export type KostenplaatsUitkomst = { ok: true; lijst: string[] } | { ok: false; fout: KostenplaatsFout };

/** Een ingetikte naam netjes: begin- en eindspaties weg, losse spaties en regelovergangen worden één spatie. */
export function schoonKostenplaats(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
}

const sleutel = (naam: string) => naam.toLocaleLowerCase("nl-NL");

/** De opgeslagen lijst als nette lijst: leeg weg, dubbel weg (hoofdletters tellen niet), volgorde blijft. */
export function leesKostenplaatsen(bewaard: readonly string[] | undefined): string[] {
  const uit: string[] = [];
  for (const ruw of bewaard ?? []) {
    const naam = schoonKostenplaats(ruw);
    if (naam && !uit.some((u) => sleutel(u) === sleutel(naam))) uit.push(naam);
  }
  return uit;
}

/** Past deze naam? Alleen de lengte en of hij er al is (een lege of te lange naam kan niet). */
function controleer(lijst: readonly string[], naam: string, behalve?: string): KostenplaatsFout | null {
  if (!naam) return "leeg";
  if (naam.length > KOSTENPLAATS_LENGTE) return "te-lang";
  if (lijst.some((u) => u !== behalve && sleutel(u) === sleutel(naam))) return "dubbel";
  return null;
}

/** Een kostenplaats erbij, achteraan. */
export function voegKostenplaatsToe(lijst: readonly string[], ruw: unknown): KostenplaatsUitkomst {
  const naam = schoonKostenplaats(ruw);
  const fout = controleer(lijst, naam);
  if (fout) return { ok: false, fout };
  if (lijst.length >= KOSTENPLAATS_MAX) return { ok: false, fout: "vol" };
  return { ok: true, lijst: [...lijst, naam] };
}

/** Een kostenplaats een andere naam geven; hij houdt zijn plek in de lijst. Alleen als hij nergens meer in gebruik is. */
export function hernoemKostenplaats(lijst: readonly string[], oud: string, ruw: unknown, gebruik: number): KostenplaatsUitkomst {
  if (!lijst.includes(oud)) return { ok: false, fout: "onbekend" };
  const naam = schoonKostenplaats(ruw);
  const fout = controleer(lijst, naam, oud);
  if (fout) return { ok: false, fout };
  // de klussen en vestigingen bewaren de naam zoals hij was (ook een andere hoofdletter telt): dezelfde naam opnieuw verandert niets
  if (gebruik > 0 && naam !== oud) return { ok: false, fout: "in-gebruik" };
  return { ok: true, lijst: lijst.map((u) => (u === oud ? naam : u)) };
}

/** Een kostenplaats weghalen. Alleen als hij nergens meer in gebruik is. */
export function verwijderKostenplaats(lijst: readonly string[], naam: string, gebruik: number): KostenplaatsUitkomst {
  if (!lijst.includes(naam)) return { ok: false, fout: "onbekend" };
  if (gebruik > 0) return { ok: false, fout: "in-gebruik" };
  return { ok: true, lijst: lijst.filter((u) => u !== naam) };
}
