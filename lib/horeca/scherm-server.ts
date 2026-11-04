import type { HorecaZaak } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { ditApparaat, type Apparaat } from "@/lib/horeca/apparaten";
import { eisBeheer } from "@/lib/horeca/toegang";
import { MODULES } from "@/lib/horeca/modules";
import { SCHERMEN, magActie, schermBeschikbaar, stationVan, type SchermRol } from "@/lib/horeca/schermen";
import { STAPPEN } from "@/lib/horeca/fasen";
import type { SchermActieInvoer } from "@/lib/horeca/schema";
import { plaatsBestelling, tafelVrij, verplaatsFase } from "@/lib/horeca/bestellingen";
import { maakReservering, nuNL, zetReserveringStatus, zetReserveringTafel } from "@/lib/horeca/reserveringen";
import { klok } from "@/lib/horeca/reserveren";
import { zetBeschikbaar } from "@/lib/horeca/store";
import { handelAf } from "@/lib/horeca/oproepen";

// ---------------------------------------------------------------------------
// Wie een scherm mag openen en wat het mag doen. Een gekoppeld apparaat opent
// alleen zijn eigen scherm; de beheerder van de zaak (ZekerFlex-login) opent
// elk scherm, bijvoorbeeld om het eerst te proberen. Elke actie wordt tegen de
// lijst van het scherm gehouden (lib/horeca/schermen.ts).
// ---------------------------------------------------------------------------

export interface SchermContext {
  zaak: HorecaZaak;
  apparaat: Apparaat | null;
  /** naam van het apparaat of van de beheerder, voor in de registratie */
  door: string;
}

export async function schermContext(rol: SchermRol): Promise<SchermContext> {
  const app = await ditApparaat();
  let ctx: SchermContext | null = null;
  if (app && app.apparaat.rol === rol) {
    const zaak = await prisma.horecaZaak.findUnique({ where: { id: app.zaakId } });
    if (zaak) ctx = { zaak, apparaat: app.apparaat, door: app.apparaat.naam };
  }
  if (!ctx) {
    const eigen = await eisBeheer().catch(() => null);
    if (eigen) ctx = { zaak: eigen.zaak, apparaat: null, door: eigen.p.fullName };
  }
  if (!ctx) {
    if (app) throw AppError.forbidden(`Dit apparaat is gekoppeld als ${SCHERMEN[app.apparaat.rol].naam}.`);
    throw AppError.unauthenticated("Koppel dit apparaat eerst aan de zaak.");
  }
  if (!schermBeschikbaar(rol, ctx.zaak.modules)) {
    throw AppError.precondition(`Zet eerst de module ${SCHERMEN[rol].modules.map((m) => MODULES[m].naam).join(" of ")} aan.`);
  }
  return ctx;
}

export async function voerUit(ctx: SchermContext, rol: SchermRol, a: SchermActieInvoer): Promise<void> {
  if (!magActie(rol, a.actie)) throw AppError.forbidden(`Dit kan niet vanaf het scherm ${SCHERMEN[rol].naam}.`);
  const { zaak } = ctx;
  switch (a.actie) {
    case "fase": {
      const station = stationVan(rol);
      await verplaatsFase(zaak, { id: a.id }, station, STAPPEN[a.stap]);
      return;
    }
    case "serveer": {
      const stap = a.terug ? STAPPEN.serveerTerug : STAPPEN.serveer;
      if (a.id) await verplaatsFase(zaak, { id: a.id }, "alles", stap);
      else if (a.tafelId) await verplaatsFase(zaak, { tafelId: a.tafelId }, "alles", stap);
      else throw AppError.validation("Kies een bestelling of tafel.");
      return;
    }
    case "bestelling":
      await plaatsBestelling(zaak, { tafelId: a.tafelId, mand: a.mand, opmerking: a.opmerking, naam: a.naam, bron: "bediening" });
      return;
    case "uitverkocht": {
      // keuken en bar zetten alleen hun eigen gerechten uitverkocht
      const station = stationVan(rol);
      const item = await prisma.horecaItem.findFirst({ where: { id: a.id, zaakId: zaak.id }, select: { station: true } });
      if (!item || (station !== "alles" && item.station !== station)) throw AppError.notFound("Gerecht niet gevonden.");
      await zetBeschikbaar(zaak, a.id, a.beschikbaar);
      return;
    }
    case "reservering-status":
      await zetReserveringStatus(zaak, a.id, a.status);
      return;
    case "reservering-tafel":
      await zetReserveringTafel(zaak, a.id, a.tafelId);
      return;
    case "inloop": {
      // een gast zonder reservering: nu, aangekomen, eventueel meteen aan een tafel
      const nu = nuNL();
      const r = await maakReservering(zaak, { datum: nu.datum, tijd: klok(nu.minuten - (nu.minuten % 5)), personen: a.personen, naam: a.naam || "Inloop", email: "", telefoon: "", opmerking: "" }, "bediening");
      await zetReserveringStatus(zaak, r.id, "AANGEKOMEN");
      if (a.tafelId) await zetReserveringTafel(zaak, r.id, a.tafelId);
      return;
    }
    case "oproep-af":
      await handelAf(zaak.id, a.tafelId, a.soort);
      return;
    case "tafel-vrij":
      await tafelVrij(zaak, a.tafelId);
      await handelAf(zaak.id, a.tafelId);
      return;
  }
}
