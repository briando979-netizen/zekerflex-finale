import type { ZaakWeergave } from "@/lib/horeca/weergave";
import type { ReserveerInstellingen } from "@/lib/horeca/reserveren";
import type { AanzetVoorstel } from "@/lib/sites/aanzet-voorstel";
import type { Soort } from "@/lib/horeca/soorten";

// Wat /api/horeca/beheer teruggeeft, zoals de browser het ziet.

export interface Categorie {
  id: string;
  naam: string;
  volgorde: number;
}

export interface Item {
  id: string;
  categorieId: string | null;
  naam: string;
  omschrijving: string;
  prijsCent: number;
  allergenen: string[];
  vegetarisch: boolean;
  veganistisch: boolean;
  beschikbaar: boolean;
  station: string;
  btw: number;
  /** null = onbeperkt */
  voorraad: number | null;
  /** keuzegroepen (Json; met leesOpties gelezen) */
  opties: unknown;
  volgorde: number;
}

export interface Tafel {
  id: string;
  naam: string;
  plaatsen: number;
  zone: string;
  code: string;
  actief: boolean;
}

export interface BeheerData {
  aan: true;
  zaak: ZaakWeergave;
  categorieen: Categorie[];
  items: Item[];
  tafels: Tafel[];
  maand: { totaalCent: number; losCent: number; bundel: boolean };
  reserveren: ReserveerInstellingen;
  kassa: { btwNummer: string; voettekst: string };
}

/** Nog niet aan: wat we al van het bedrijf weten, voor de eerste stap (de soort uit de KvK-inschrijving, of null). */
export type Voorstel = AanzetVoorstel & { soort: Soort | null };

export type Antwoord = BeheerData | { aan: false; voorstel: Voorstel };

/** Eén actie naar de server; geeft true als het lukte (de data is dan al ververst). */
export type Doe = (actie: Record<string, unknown>, ok?: string) => Promise<boolean>;
