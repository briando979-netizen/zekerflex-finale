import { prisma } from "@/lib/prisma";
import { getUserAvatars } from "@/lib/profile/store";
import { ERASED_EMAIL_DOMAIN } from "@/lib/privacy/gewist";
import {
  ROL_LABEL,
  categorieNaam,
  onderwerpPad,
  rolVoor,
  uittreksel,
  wanneer,
  weergaveNaam,
  type AuteurRol,
  type Bericht,
  type BerichtStatus,
  type Categorie,
  type Onderwerp,
} from "@/lib/community/regels";

// ---------------------------------------------------------------------------
// Wat een bezoeker van een bericht ziet. Nooit een gebruikers-id, e-mailadres, telefoonnummer of volledige achternaam:
// alleen de voornaam met de eerste letter van de achternaam, het label (Werker, Bedrijf, ZekerFlex-team) en de
// profielfoto via een eigen adres per bericht (/api/community/avatar/<onderwerp>/<bericht>), zonder id van de schrijver.
// ---------------------------------------------------------------------------

export interface AuteurWeergave {
  naam: string;
  rol: AuteurRol | null;
  rolLabel: string | null;
  /** het ZekerFlex-team zelf (het welkomstonderwerp): het logo in plaats van een foto */
  team: boolean;
  avatar: string | null;
}

export interface BerichtWeergave {
  id: string;
  /** null voor het onderwerp zelf */
  reactieId: string | null;
  tekst: string;
  fotos: string[];
  at: string;
  wanneer: string;
  auteur: AuteurWeergave;
  handig: number;
  ikVondHandig: boolean;
  vanMij: boolean;
  status: BerichtStatus;
  /** alleen voor de schrijver zelf: waarom zijn bericht verborgen of verwijderd is */
  uitleg: string | null;
}

export interface OnderwerpKaart {
  id: string;
  pad: string;
  titel: string;
  categorie: Categorie;
  categorieNaam: string;
  uittreksel: string;
  wanneer: string;
  laatste: string;
  aantalReacties: number;
  handig: number;
  vastgepind: boolean;
  fotos: number;
  auteur: AuteurWeergave;
}

interface Schrijver {
  naam: string;
  rol: AuteurRol;
  gewist: boolean;
  heeftAvatar: boolean;
}

const VERWIJDERD: AuteurWeergave = { naam: "Verwijderd account", rol: null, rolLabel: null, team: false, avatar: null };
const TEAM: AuteurWeergave = { naam: "ZekerFlex", rol: "team", rolLabel: ROL_LABEL.team, team: true, avatar: null };

/** De schrijvers van deze berichten in één keer uit de database: naam, rol en of er een profielfoto is. */
export async function schrijversVan(berichten: readonly Pick<Bericht, "auteurId">[]): Promise<Map<string, Schrijver>> {
  const ids = [...new Set(berichten.map((b) => b.auteurId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const [gebruikers, avatars] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, email: true, memberships: { select: { role: true } } },
    }),
    getUserAvatars(ids).catch(() => ({}) as Record<string, string>),
  ]);
  return new Map(
    gebruikers.map((u) => [
      u.id,
      {
        naam: weergaveNaam(u.fullName),
        rol: rolVoor(u.memberships.map((m) => m.role)),
        gewist: u.email.endsWith(`@${ERASED_EMAIL_DOMAIN}`),
        heeftAvatar: Object.hasOwn(avatars, u.id),
      },
    ]),
  );
}

export function auteurVan(b: Bericht, onderwerpId: string, reactieId: string | null, schrijvers: Map<string, Schrijver>): AuteurWeergave {
  if (b.team) return TEAM;
  const s = b.auteurId ? schrijvers.get(b.auteurId) : undefined;
  if (!s || s.gewist || b.gewist) return VERWIJDERD;
  return {
    naam: s.naam,
    rol: s.rol,
    rolLabel: ROL_LABEL[s.rol],
    team: false,
    avatar: s.heeftAvatar ? `/api/community/avatar/${onderwerpId}/${reactieId ?? "o"}` : null,
  };
}

export function fotoUrl(onderwerpId: string, fotoId: string): string {
  return `/api/community/foto/${onderwerpId}/${fotoId}.webp`;
}

function uitlegVoorSchrijver(b: Bericht): string | null {
  if (b.status === "verborgen") {
    const basis = b.verborgenDoor === "meldingen" ? "Dit bericht is verborgen omdat meerdere mensen het meldden. Beheer kijkt ernaar." : "Dit bericht is verborgen door beheer.";
    return b.beheerReden ? `${basis} Reden: ${b.beheerReden}` : basis;
  }
  if (b.status === "verwijderd" && b.beheerReden) return `Dit bericht is verwijderd door beheer. Reden: ${b.beheerReden}`;
  return null;
}

export function berichtWeergave(
  b: Bericht,
  onderwerpId: string,
  reactieId: string | null,
  schrijvers: Map<string, Schrijver>,
  kijker: string | null,
  nu: Date,
): BerichtWeergave {
  const vanMij = Boolean(kijker && b.auteurId === kijker && !b.team);
  // een verborgen bericht ziet alleen de schrijver zelf; de rest ziet alleen dat het er was
  const inhoud = b.status === "zichtbaar" || (vanMij && b.status === "verborgen");
  return {
    id: b.id,
    reactieId,
    tekst: inhoud ? b.tekst : "",
    fotos: inhoud ? b.fotos.map((f) => fotoUrl(onderwerpId, f)) : [],
    at: b.at,
    wanneer: wanneer(b.at, nu),
    auteur: b.status === "zichtbaar" || vanMij ? auteurVan(b, onderwerpId, reactieId, schrijvers) : VERWIJDERD,
    handig: b.handig.length,
    ikVondHandig: Boolean(kijker && b.handig.includes(kijker)),
    vanMij,
    status: b.status,
    uitleg: vanMij ? uitlegVoorSchrijver(b) : null,
  };
}

export function onderwerpKaart(o: Onderwerp, schrijvers: Map<string, Schrijver>, nu: Date): OnderwerpKaart {
  return {
    id: o.id,
    pad: onderwerpPad(o),
    titel: o.titel,
    categorie: o.categorie,
    categorieNaam: categorieNaam(o.categorie),
    uittreksel: uittreksel(o.tekst),
    wanneer: wanneer(o.at, nu),
    laatste: wanneer(o.laatsteOp, nu),
    aantalReacties: o.aantalReacties,
    handig: o.handig.length,
    vastgepind: o.vastgepind,
    fotos: o.fotos.length,
    auteur: auteurVan(o, o.id, null, schrijvers),
  };
}
