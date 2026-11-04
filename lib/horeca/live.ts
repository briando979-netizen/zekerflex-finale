import type { HorecaZaak } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { heeftModule } from "@/lib/horeca/modules";
import { bestellingenVan, tafelsVan } from "@/lib/horeca/bestellingen";
import { nuNL, reserveringenOp } from "@/lib/horeca/reserveringen";
import { leesInstellingen } from "@/lib/horeca/reserveren";
import { oproepenVan } from "@/lib/horeca/oproepen";
import { lijstenOp } from "@/lib/horeca/takenlijsten";
import { waardeOk } from "@/lib/horeca/taken";
import { apparatenVan } from "@/lib/horeca/apparaten";
import { afhaalNummers, liveCijfers, nogTeKomen, opAandacht, zaalLive, type LiveBestelling, type LiveReservering } from "@/lib/horeca/zaal";
import { stationVan, type SchermRol } from "@/lib/horeca/schermen";
import { bonKop } from "@/lib/horeca/kassa-server";

// ---------------------------------------------------------------------------
// Alles wat er nu in de zaak speelt, voor het live-dashboard in het beheer en
// voor de schermen (lib/horeca/schermen.ts). Elk scherm krijgt alleen wat het
// nodig heeft: het afhaalscherm voor gasten bijvoorbeeld alleen nummers.
// ---------------------------------------------------------------------------

export type SchermBestelling = LiveBestelling & { tafelNaam: string | null; opmerking: string; naam: string; bron: string };

async function bestellingenLive(zaakId: string): Promise<SchermBestelling[]> {
  return (await bestellingenVan(zaakId)).map((b) => ({
    id: b.id,
    nummer: b.nummer,
    tafelId: b.tafelId,
    tafelNaam: b.tafelNaam,
    status: b.status,
    regels: b.regels,
    totaalCent: b.totaalCent,
    betaald: b.betaald,
    createdAt: b.createdAt.toISOString(),
    opmerking: b.opmerking,
    naam: b.naam,
    bron: b.bron,
  }));
}

async function reserveringenVandaag(zaak: HorecaZaak, datum: string) {
  if (!heeftModule(zaak, "reserveren")) return [];
  return (await reserveringenOp(zaak.id, datum)).map((r) => ({
    id: r.id,
    tafelId: r.tafelId,
    tafelNaam: r.tafelNaam,
    tijd: r.tijd,
    personen: r.personen,
    naam: r.naam,
    telefoon: r.telefoon,
    opmerking: r.opmerking,
    bron: r.bron,
    status: r.status,
  }));
}

/** Het hart: zaal, cijfers, wie er nog komt en de oproepen van gasten. */
export async function liveVan(zaak: HorecaZaak) {
  const nu = nuNL();
  const nuMs = Date.now();
  const [tafels, bestellingen, reserveringen, oproepen] = await Promise.all([tafelsVan(zaak.id), bestellingenLive(zaak.id), reserveringenVandaag(zaak, nu.datum), oproepenVan(zaak.id)]);
  const res: LiveReservering[] = reserveringen;
  const zaal = opAandacht(zaalLive({ tafels, bestellingen, reserveringen: res, oproepen, nuMs, nuMin: nu.minuten, verblijfMin: leesInstellingen(zaak.reserveren).verblijfMinuten }));
  return {
    nu: { ...nu, iso: new Date(nuMs).toISOString() },
    tafels: tafels.filter((t) => t.actief).map((t) => ({ id: t.id, naam: t.naam, plaatsen: t.plaatsen, zone: t.zone })),
    zaal,
    cijfers: liveCijfers({ bestellingen, reserveringen: res, zaal, vandaag: nu.datum, nuMs }),
    komend: nogTeKomen(res, nu.minuten).map((r) => ({ id: r.id, tijd: r.tijd, personen: r.personen, naam: r.naam, tafelId: r.tafelId })),
    reserveringen,
    oproepen,
    bestellingen,
  };
}

/** Het dashboard in het beheer: live plus takenlijsten, uitverkochte gerechten en de schermen. */
export async function dashboardVan(zaak: HorecaZaak) {
  const live = await liveVan(zaak);
  const [lijsten, uitverkocht, apparaten] = await Promise.all([
    heeftModule(zaak, "taken") ? lijstenOp(zaak.id, live.nu.datum) : Promise.resolve([]),
    prisma.horecaItem.findMany({ where: { zaakId: zaak.id, beschikbaar: false }, select: { id: true, naam: true }, orderBy: { naam: "asc" }, take: 50 }),
    apparatenVan(zaak.id),
  ]);
  const taken = lijsten.map((l) => {
    const buiten = l.vinkjes.filter((v) => {
      const t = l.taken[v.taak];
      return t?.meten ? waardeOk(t, v.waarde) === false : false;
    });
    return { id: l.id, naam: l.naam, moment: l.moment, totaal: l.taken.length, gedaan: l.vinkjes.length, buitenGrens: buiten.map((v) => ({ taak: l.taken[v.taak]?.tekst ?? "", waarde: v.waarde })) };
  });
  // het dashboard heeft de losse bestellingen niet nodig (die staan op het tabblad Bestellingen)
  const { bestellingen: _b, ...rest } = live;
  return { ...rest, taken, uitverkocht, apparaten };
}

/** Wat een scherm te zien krijgt. */
export async function schermDataVan(zaak: HorecaZaak, rol: SchermRol) {
  const zaakKort = { naam: zaak.naam, slug: zaak.slug, kleur: zaak.kleur, accent: zaak.accent, modules: zaak.modules };
  if (rol === "afhaal") {
    // voor gasten: alleen nummers, geen namen of tafels
    const nummers = afhaalNummers(await bestellingenLive(zaak.id), Date.now());
    return { zaak: zaakKort, nu: { ...nuNL(), iso: new Date().toISOString() }, afhaal: nummers };
  }
  const live = await liveVan(zaak);
  // het live-overzicht hangt soms zichtbaar voor gasten: geen telefoonnummers of opmerkingen, geen losse bestellingen
  if (rol === "overzicht") {
    const { reserveringen: _r, bestellingen: _b, ...rest } = live;
    return { zaak: zaakKort, ...rest, reserveringen: [], bestellingen: [], items: [], categorieen: [] };
  }
  const station = stationVan(rol);
  const metKaart = rol === "bediening" || rol === "kassa";
  const items =
    metKaart || rol === "keuken" || rol === "bar"
      ? await prisma.horecaItem.findMany({
          where: { zaakId: zaak.id, ...(station === "alles" ? {} : { station }) },
          select: { id: true, naam: true, prijsCent: true, beschikbaar: true, station: true, categorieId: true, allergenen: true, vegetarisch: true, voorraad: true, opties: true },
          orderBy: [{ volgorde: "asc" }, { createdAt: "asc" }],
        })
      : [];
  const categorieen = metKaart ? await prisma.horecaCategorie.findMany({ where: { zaakId: zaak.id }, select: { id: true, naam: true }, orderBy: { volgorde: "asc" } }) : [];
  return { zaak: zaakKort, ...live, items, categorieen, ...(metKaart ? { bonKop: bonKop(zaak) } : {}) };
}
