import { normalizeBlok, type Blok } from "@/lib/ontwerp/paginas";

// ---------------------------------------------------------------------------
// De indeling van de homepage, bewerkbaar in de Site-ontwerper (tabblad
// Homepage): blokken verbergen, in een andere volgorde zetten en eigen blokken
// (tekst, foto, video, vragen …) ertussen zetten. De bovenste
// kop (hero) staat altijd bovenaan. Zonder eigen indeling (null) toont de
// homepage exact de standaardvolgorde hieronder. Puur en browser-veilig.
// Dit is /bedrijven (de homepagina voor werkzoekenden is /). Sinds 14 nov alleen blokken voor bedrijven: freelancers,
// werkvormen en app zijn weg; staan ze nog in een bewaarde indeling, dan vallen ze weg als onbekend blok.
// ---------------------------------------------------------------------------

export const HOME_SECTIES = [
  { id: "voordeur", naam: "Wat wil je doen?", uitleg: "Vijf tegels met foto: personeel, website, webshop, horeca of rijschool" },
  { id: "vertrouwen", naam: "Vertrouwensbalk", uitleg: "KVK, KYC, SEPA en de lopende band met voordelen" },
  { id: "aanbod", naam: "Waar ben je naar op zoek?", uitleg: "De keuze tussen personeel, software, website en meer" },
  { id: "branches", naam: "Branches", uitleg: "Personeel in horeca, logistiek, retail …, met het minimale uurtarief" },
  { id: "hoe", naam: "Hoe het werkt", uitleg: "Drie stappen (het menu linkt hiernaartoe)" },
  { id: "bedrijven", naam: "Voor bedrijven", uitleg: "Donker blok met de voordelen voor bedrijven" },
  { id: "cijfers", naam: "Cijfers", uitleg: "€ 3,50, € 0, GPS, factuur na uren" },
  { id: "functies", naam: "Functies", uitleg: "Zes kaarten: matching, uitbetaling, DBA …" },
  { id: "zekerheid", naam: "Zekerheid en regels", uitleg: "Overeenkomst, KVK, KYC, auditspoor" },
  { id: "citaat", naam: "Citaat", uitleg: "Een uitspraak in groot formaat" },
  { id: "vragen", naam: "Veelgestelde vragen", uitleg: "De zes vragen met antwoord" },
  { id: "oproep", naam: "Slotoproep", uitleg: "Klus plaatsen of prijzen bekijken" },
] as const;

export type HomeSectie = (typeof HOME_SECTIES)[number]["id"];
/** een vast blok of een eigen blok ("blok:<id>", dezelfde soorten als op eigen pagina's) */
export type HomeItem = HomeSectie | `blok:${string}`;

export interface HomeIndeling {
  /** alle blokken (vast en eigen) in de gewenste volgorde */
  volgorde: HomeItem[];
  verborgen: HomeItem[];
  /** eigen blokken tussen de vaste (tekst, foto, video, vragen, …) */
  eigen: Blok[];
}

export const MAX_EIGEN_BLOKKEN = 12;
const IDS = HOME_SECTIES.map((s) => s.id) as HomeSectie[];
export const isSectie = (v: unknown): v is HomeSectie => typeof v === "string" && (IDS as string[]).includes(v);
export const eigenSleutel = (b: Blok): HomeItem => `blok:${b.id}`;

export function standaardHomeIndeling(): HomeIndeling {
  return { volgorde: [...IDS], verborgen: [], eigen: [] };
}

/**
 * Onbekende en dubbele blokken vallen weg; ontbrekende vaste blokken (bv. later
 * toegevoegd) en eigen blokken zonder plek komen achteraan. Eigen blokken gaan
 * door dezelfde controle als op eigen pagina's (veilige links, media-id's).
 */
export function normalizeHomeIndeling(raw: unknown): HomeIndeling {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const eigen: Blok[] = [];
  for (const b of (Array.isArray(r.eigen) ? r.eigen : []).slice(0, MAX_EIGEN_BLOKKEN)) {
    const n = normalizeBlok(b);
    if (n && !eigen.some((x) => x.id === n.id)) eigen.push(n);
  }
  const bekend = new Set<string>([...IDS, ...eigen.map(eigenSleutel)]);
  const volgorde: HomeItem[] = [];
  for (const v of Array.isArray(r.volgorde) ? r.volgorde : []) if (typeof v === "string" && bekend.has(v) && !volgorde.includes(v as HomeItem)) volgorde.push(v as HomeItem);
  // een nieuw vast blok komt achteraan, behalve de voordeur: die hoort bovenaan ook bij een eigen volgorde
  for (const id of [...IDS, ...eigen.map(eigenSleutel)]) if (!volgorde.includes(id)) (id === "voordeur" ? volgorde.unshift(id) : volgorde.push(id));
  const ruwVerborgen = Array.isArray(r.verborgen) ? r.verborgen : [];
  const verborgen = volgorde.filter((id) => ruwVerborgen.includes(id));
  return { volgorde, verborgen, eigen };
}

export function isStandaardHomeIndeling(i: HomeIndeling): boolean {
  return JSON.stringify(normalizeHomeIndeling(i)) === JSON.stringify(standaardHomeIndeling());
}

/** De blokken die de homepage toont, in volgorde. Zonder eigen indeling precies de standaard. */
export function zichtbareSecties(indeling: HomeIndeling | null | undefined): HomeItem[] {
  if (!indeling) return [...IDS];
  const n = normalizeHomeIndeling(indeling);
  return n.volgorde.filter((id) => !n.verborgen.includes(id));
}
