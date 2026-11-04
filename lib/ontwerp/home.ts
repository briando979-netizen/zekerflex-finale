// ---------------------------------------------------------------------------
// De indeling van de homepage, bewerkbaar in de Site-ontwerper (tabblad
// Homepage): blokken verbergen en in een andere volgorde zetten. De bovenste
// kop (hero) staat altijd bovenaan. Zonder eigen indeling (null) toont de
// homepage exact de standaardvolgorde hieronder. Puur en browser-veilig.
// ---------------------------------------------------------------------------

export const HOME_SECTIES = [
  { id: "vertrouwen", naam: "Vertrouwensbalk", uitleg: "KVK, KYC, SEPA en de lopende band met voordelen" },
  { id: "aanbod", naam: "Waar ben je naar op zoek?", uitleg: "De keuze tussen personeel, software, website en meer" },
  { id: "branches", naam: "Branches", uitleg: "Horeca, logistiek, retail … met tarieven" },
  { id: "hoe", naam: "Hoe het werkt", uitleg: "Drie stappen (het menu linkt hiernaartoe)" },
  { id: "freelancers", naam: "Voor freelancers", uitleg: "Foto met de voordelen voor werkers" },
  { id: "bedrijven", naam: "Voor bedrijven", uitleg: "Donker blok met de voordelen voor bedrijven" },
  { id: "werkvormen", naam: "Drie werkvormen", uitleg: "Uitzendbureau, flexwerker en zzp'er" },
  { id: "cijfers", naam: "Cijfers", uitleg: "€ 3,50, € 0, GPS, factuur na uren" },
  { id: "functies", naam: "Functies", uitleg: "Zes kaarten: matching, uitbetaling, DBA …" },
  { id: "zekerheid", naam: "Zekerheid en regels", uitleg: "Overeenkomst, KVK, KYC, auditspoor" },
  { id: "citaat", naam: "Citaat", uitleg: "Een uitspraak in groot formaat" },
  { id: "vragen", naam: "Veelgestelde vragen", uitleg: "De zes vragen met antwoord" },
  { id: "app", naam: "Download de app", uitleg: "App Store / Google Play" },
  { id: "oproep", naam: "Slotoproep", uitleg: "Account aanmaken of prijzen bekijken" },
] as const;

export type HomeSectie = (typeof HOME_SECTIES)[number]["id"];

export interface HomeIndeling {
  /** alle blokken in de gewenste volgorde */
  volgorde: HomeSectie[];
  verborgen: HomeSectie[];
}

const IDS = HOME_SECTIES.map((s) => s.id) as HomeSectie[];
const isSectie = (v: unknown): v is HomeSectie => typeof v === "string" && (IDS as string[]).includes(v);

export function standaardHomeIndeling(): HomeIndeling {
  return { volgorde: [...IDS], verborgen: [] };
}

/** Onbekende en dubbele blokken vallen weg; ontbrekende (bv. later toegevoegd) komen achteraan. */
export function normalizeHomeIndeling(raw: unknown): HomeIndeling {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const volgorde: HomeSectie[] = [];
  for (const v of Array.isArray(r.volgorde) ? r.volgorde : []) if (isSectie(v) && !volgorde.includes(v)) volgorde.push(v);
  for (const id of IDS) if (!volgorde.includes(id)) volgorde.push(id);
  const verborgen = IDS.filter((id) => (Array.isArray(r.verborgen) ? r.verborgen : []).includes(id));
  return { volgorde, verborgen };
}

export function isStandaardHomeIndeling(i: HomeIndeling): boolean {
  return JSON.stringify(normalizeHomeIndeling(i)) === JSON.stringify(standaardHomeIndeling());
}

/** De blokken die de homepage toont, in volgorde. Zonder eigen indeling precies de standaard. */
export function zichtbareSecties(indeling: HomeIndeling | null | undefined): HomeSectie[] {
  if (!indeling) return [...IDS];
  const n = normalizeHomeIndeling(indeling);
  return n.volgorde.filter((id) => !n.verborgen.includes(id));
}
