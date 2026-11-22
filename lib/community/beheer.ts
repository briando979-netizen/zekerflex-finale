import { prisma } from "@/lib/prisma";
import {
  ROL_LABEL,
  meldRedenNaam,
  onderwerpPad,
  rolVoor,
  tellendeMeldingen,
  wanneer,
  weergaveNaam,
  type Bericht,
  type BerichtStatus,
  type Onderwerp,
} from "@/lib/community/regels";
import { alleOnderwerpen, alleUitsluitingen, leesInstelling, reactiesVan, wachtrij, type Instelling } from "@/lib/community/store";
import { fotoUrl } from "@/lib/community/weergave";

// ---------------------------------------------------------------------------
// Beheer → Community (app/admin/community): gemelde en recente berichten, wie is uitgesloten, en de cijfers. Alleen voor
// platformbeheer (de route en de pagina controleren dat). Hier staat wel het gebruikers-id van de schrijver, voor de link
// naar Beheer → Gebruikers en om iemand uit te sluiten; dat gaat nooit naar de openbare pagina's.
// ---------------------------------------------------------------------------

export interface BeheerItem {
  sleutel: string;
  onderwerpId: string;
  reactieId: string | null;
  pad: string;
  titel: string;
  soort: "onderwerp" | "reactie";
  tekst: string;
  fotos: string[];
  status: BerichtStatus;
  verborgenDoor: string | null;
  beheerReden: string | null;
  at: string;
  wanneer: string;
  meldingen: { reden: string; toelichting: string; wanneer: string }[];
  tellend: number;
  auteur: { naam: string; rolLabel: string | null; userId: string | null; uitgesloten: boolean; team: boolean };
  vastgepind: boolean | null;
}

export interface BeheerOverzicht {
  gemeld: BeheerItem[];
  recent: BeheerItem[];
  uitgesloten: { userId: string; naam: string; sinds: string; reden: string }[];
  instelling: Instelling;
  cijfers: { onderwerpen: number; reacties: number; gemeld: number; uitgesloten: number };
}

interface Kandidaat {
  onderwerp: Onderwerp;
  bericht: Bericht;
  reactieId: string | null;
}

export async function beheerOverzicht(nu = new Date()): Promise<BeheerOverzicht> {
  const [onderwerpen, rij, uitsluitingen, instelling] = await Promise.all([alleOnderwerpen(), wachtrij(), alleUitsluitingen(), leesInstelling()]);
  const perId = new Map(onderwerpen.map((o) => [o.id, o]));
  const actief = [...onderwerpen].sort((a, b) => b.laatsteOp.localeCompare(a.laatsteOp)).slice(0, 15).map((o) => o.id);
  const reacties = await reactiesVan([...new Set([...rij.map((i) => i.onderwerpId), ...actief])]);

  const zoek = (onderwerpId: string, reactieId: string | null): Kandidaat | null => {
    const onderwerp = perId.get(onderwerpId);
    if (!onderwerp) return null;
    if (!reactieId) return { onderwerp, bericht: onderwerp, reactieId: null };
    const r = (reacties.get(onderwerpId) ?? []).find((x) => x.id === reactieId);
    return r ? { onderwerp, bericht: r, reactieId } : null;
  };

  const gemeldeKandidaten = rij.map((i) => zoek(i.onderwerpId, i.reactieId)).filter((k): k is Kandidaat => k !== null);
  const gemeldSleutels = new Set(gemeldeKandidaten.map((k) => `${k.onderwerp.id}:${k.reactieId ?? "o"}`));
  const recenteKandidaten: Kandidaat[] = [
    ...onderwerpen.map((o) => ({ onderwerp: o, bericht: o as Bericht, reactieId: null })),
    ...actief.flatMap((id) => {
      const onderwerp = perId.get(id);
      return onderwerp ? (reacties.get(id) ?? []).map((r) => ({ onderwerp, bericht: r, reactieId: r.id })) : [];
    }),
  ]
    .filter((k) => !k.bericht.team && !gemeldSleutels.has(`${k.onderwerp.id}:${k.reactieId ?? "o"}`))
    .sort((a, b) => b.bericht.at.localeCompare(a.bericht.at))
    .slice(0, 40);

  const uitgeslotenIds = new Set(uitsluitingen.map((u) => u.userId));
  const auteurIds = [
    ...new Set([...gemeldeKandidaten, ...recenteKandidaten].map((k) => k.bericht.auteurId).concat(uitsluitingen.map((u) => u.userId)).filter((id): id is string => Boolean(id))),
  ];
  const gebruikers = auteurIds.length
    ? await prisma.user.findMany({ where: { id: { in: auteurIds } }, select: { id: true, fullName: true, memberships: { select: { role: true } } } })
    : [];
  const perGebruiker = new Map(gebruikers.map((u) => [u.id, { naam: weergaveNaam(u.fullName), rol: rolVoor(u.memberships.map((m) => m.role)) }]));

  const item = (k: Kandidaat): BeheerItem => {
    const b = k.bericht;
    const g = b.auteurId ? perGebruiker.get(b.auteurId) : undefined;
    return {
      sleutel: `${k.onderwerp.id}:${k.reactieId ?? "o"}`,
      onderwerpId: k.onderwerp.id,
      reactieId: k.reactieId,
      pad: onderwerpPad(k.onderwerp),
      titel: k.onderwerp.titel,
      soort: k.reactieId ? "reactie" : "onderwerp",
      tekst: b.tekst.slice(0, 800),
      fotos: b.fotos.map((f) => fotoUrl(k.onderwerp.id, f)),
      status: b.status,
      verborgenDoor: b.verborgenDoor ?? null,
      beheerReden: b.beheerReden ?? null,
      at: b.at,
      wanneer: wanneer(b.at, nu),
      meldingen: b.meldingen.map((m) => ({ reden: meldRedenNaam(m.reden), toelichting: m.toelichting, wanneer: wanneer(m.at, nu) })),
      tellend: tellendeMeldingen(b),
      auteur: {
        naam: b.team ? "ZekerFlex" : g && !b.gewist ? g.naam : "Verwijderd account",
        rolLabel: b.team ? ROL_LABEL.team : g ? ROL_LABEL[g.rol] : null,
        userId: b.team || b.gewist ? null : b.auteurId,
        uitgesloten: Boolean(b.auteurId && uitgeslotenIds.has(b.auteurId)),
        team: Boolean(b.team),
      },
      vastgepind: k.reactieId ? null : k.onderwerp.vastgepind,
    };
  };

  const zichtbaar = onderwerpen.filter((o) => o.status === "zichtbaar");
  return {
    gemeld: gemeldeKandidaten.map(item),
    recent: recenteKandidaten.map(item),
    uitgesloten: uitsluitingen.map((u) => ({
      userId: u.userId,
      naam: perGebruiker.get(u.userId)?.naam ?? "Onbekend account",
      sinds: wanneer(u.uitsluiting.at, nu),
      reden: u.uitsluiting.reden,
    })),
    instelling,
    cijfers: {
      onderwerpen: zichtbaar.length,
      reacties: zichtbaar.reduce((n, o) => n + o.aantalReacties, 0),
      gemeld: gemeldeKandidaten.length,
      uitgesloten: uitsluitingen.length,
    },
  };
}
