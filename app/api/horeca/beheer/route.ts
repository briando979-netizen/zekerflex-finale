import { after, NextResponse } from "next/server";
import { bevestigingGast, verstuur } from "@/lib/horeca/mail";
import { AppError, toErrorBody } from "@/lib/errors";
import { companyDefaults } from "@/lib/sites/access";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { aanzettenSchema, beheerActieSchema, lees, LIVE_ACTIES, liveActieSchema, takenActieSchema, TAKEN_ACTIES } from "@/lib/horeca/schema";
import { bewaarLijst, lijstenOp, maakVoorbeeldlijsten, registratie, verwijderLijst, vinkAf, vinkUit } from "@/lib/horeca/takenlijsten";
import { beheerContext, eisBeheer } from "@/lib/horeca/toegang";
import {
  bewaarCategorie,
  bewaarItem,
  maakZaak,
  menukaart,
  verwijderCategorie,
  verwijderItem,
  werkGegevensBij,
  zetBeschikbaar,
  zetModuleAan,
  zetOnline,
  zetOpeningstijden,
} from "@/lib/horeca/store";
import { heeftModule, maandbedrag, MODULES, type ModuleSleutel } from "@/lib/horeca/modules";
import { zaakWeergave } from "@/lib/horeca/weergave";
import { bestellingenVan, bewaarTafel, plaatsBestelling, tafelsVan, tafelVrij, verplaatsFase, vernieuwCode, verwijderTafel, zetBestelStatus } from "@/lib/horeca/bestellingen";
import { bewaarReserveerInstellingen, maakReservering, reserveringenOp, zetReserveringStatus, zetReserveringTafel } from "@/lib/horeca/reserveringen";
import { isDatum, leesInstellingen } from "@/lib/horeca/reserveren";
import { cijfersVan } from "@/lib/horeca/cijfers-server";
import { dashboardVan } from "@/lib/horeca/live";
import { apparatenVan, bewaarApparaat, koppelcodeVoor, ontkoppel } from "@/lib/horeca/apparaten";
import { handelAf } from "@/lib/horeca/oproepen";
import { STAPPEN } from "@/lib/horeca/fasen";
import type { HorecaZaak } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Het beheer van het horeca-pakket (/werkgever/horeca). GET geeft alles voor
// het scherm, POST één actie (lib/horeca/schema.ts). Alleen de beheerder van
// het bedrijf (lib/horeca/toegang.ts).

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

async function alles(zaak: HorecaZaak) {
  const [kaart, tafels] = await Promise.all([menukaart(zaak.id), tafelsVan(zaak.id)]);
  return { aan: true, zaak: zaakWeergave(zaak), ...kaart, tafels, maand: maandbedrag(zaak.modules), reserveren: leesInstellingen(zaak.reserveren) };
}

const eisModule = (zaak: HorecaZaak, m: ModuleSleutel) => {
  if (!heeftModule(zaak, m)) throw AppError.precondition(`Zet eerst de module ${MODULES[m].naam} aan.`);
};

// GET → alles voor het beheer; ?alleen=bestellingen → alleen de bestellingen (keukenscherm ververst vaak)
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { p, tenantId, zaak } = await beheerContext();
    if (!zaak) {
      const d = await companyDefaults(tenantId, p);
      return NextResponse.json({ aan: false, voorstel: { naam: d.naam, plaats: d.plaats, telefoon: d.telefoon, email: d.email } });
    }
    const q = new URL(request.url).searchParams;
    // ?alleen=live → het live-dashboard (zaal, cijfers van vandaag, oproepen, takenlijsten, schermen)
    if (q.get("alleen") === "live") return NextResponse.json(await dashboardVan(zaak));
    // ?alleen=apparaten → de gekoppelde schermen
    if (q.get("alleen") === "apparaten") return NextResponse.json({ apparaten: await apparatenVan(zaak.id) });
    if (q.get("alleen") === "bestellingen") {
      eisModule(zaak, "bestellen");
      return NextResponse.json({ bestellingen: await bestellingenVan(zaak.id) });
    }
    // ?alleen=taken&datum=JJJJ-MM-DD → de takenlijsten met de vinkjes van die dag (week)
    if (q.get("alleen") === "taken") {
      eisModule(zaak, "taken");
      const datum = q.get("datum") ?? "";
      if (!isDatum(datum)) throw AppError.validation("Kies een datum.");
      return NextResponse.json({ datum, lijsten: await lijstenOp(zaak.id, datum) });
    }
    // ?alleen=registratie → de registratie van 90 dagen als CSV (voor een inspectie)
    if (q.get("alleen") === "registratie") {
      eisModule(zaak, "taken");
      const veld = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const regels = (await registratie(zaak.id)).map((r) =>
        [r.datum, r.lijst, r.taak, r.waarde, r.binnenGrens === null ? "" : r.binnenGrens ? "binnen grens" : "BUITEN GRENS", r.door, r.op.toISOString()].map(veld).join(";"),
      );
      const kop = ["Datum", "Lijst", "Taak", "Waarde", "Grens", "Door", "Vastgelegd (UTC)"].map(veld).join(";");
      return new NextResponse(`﻿${[kop, ...regels].join("\r\n")}`, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="registratie-${zaak.slug}.csv"` },
      });
    }
    // ?alleen=cijfers&dagen=7|30 → omzet, couverts, no-shows, top-gerechten en drukte (lib/horeca/cijfers.ts)
    if (q.get("alleen") === "cijfers") {
      if (!heeftModule(zaak, "bestellen") && !heeftModule(zaak, "reserveren")) throw AppError.precondition("Zet eerst bestellen of reserveren aan.");
      return NextResponse.json(await cijfersVan(zaak.id, q.get("dagen") === "30" ? 30 : 7));
    }
    // ?alleen=reserveringen&datum=JJJJ-MM-DD → het reserveringsboek van die dag
    if (q.get("alleen") === "reserveringen") {
      eisModule(zaak, "reserveren");
      const datum = q.get("datum") ?? "";
      if (!isDatum(datum)) throw AppError.validation("Kies een datum.");
      return NextResponse.json({ datum, reserveringen: await reserveringenOp(zaak.id, datum) });
    }
    return NextResponse.json(await alles(zaak));
  } catch (err) {
    return fout(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const body: unknown = await request.json().catch(() => null);
    if ((body as { actie?: unknown } | null)?.actie === "aanzetten") {
      const { tenantId } = await beheerContext();
      const { actie: _actie, ...g } = lees(aanzettenSchema, body);
      return NextResponse.json(await alles(await maakZaak(tenantId, g)));
    }
    const { zaak, p } = await eisBeheer();
    // takenlijsten (module taken) hebben een eigen schema
    if (TAKEN_ACTIES.includes(String((body as { actie?: unknown } | null)?.actie))) {
      eisModule(zaak, "taken");
      const t = lees(takenActieSchema, body);
      if (t.actie === "afvinken") {
        const { binnenGrens } = await vinkAf(zaak, { lijstId: t.lijstId, datum: t.datum, taak: t.taak, waarde: t.waarde, door: t.door || p.fullName });
        return NextResponse.json({ binnenGrens, lijsten: await lijstenOp(zaak.id, t.datum) });
      }
      if (t.actie === "afvinken-weg") {
        await vinkUit(zaak, t);
        return NextResponse.json({ lijsten: await lijstenOp(zaak.id, t.datum) });
      }
      if (t.actie === "takenlijst") await bewaarLijst(zaak, { id: t.id, naam: t.naam, moment: t.moment, regels: t.regels });
      else if (t.actie === "takenlijst-weg") await verwijderLijst(zaak, t.id);
      else await maakVoorbeeldlijsten(zaak);
      return NextResponse.json({ ok: true });
    }
    // live-dashboard en schermen: eigen schema
    if (LIVE_ACTIES.includes(String((body as { actie?: unknown } | null)?.actie))) {
      const l = lees(liveActieSchema, body);
      if (l.actie === "apparaat") {
        const koppel = await bewaarApparaat(zaak.id, { id: l.id, naam: l.naam, rol: l.rol });
        return NextResponse.json({ apparaten: await apparatenVan(zaak.id), koppel });
      }
      if (l.actie === "apparaat-code") return NextResponse.json({ apparaten: await apparatenVan(zaak.id), koppel: await koppelcodeVoor(zaak.id, l.id) });
      if (l.actie === "apparaat-weg") {
        await ontkoppel(zaak.id, l.id);
        return NextResponse.json({ apparaten: await apparatenVan(zaak.id) });
      }
      if (l.actie === "oproep-af") await handelAf(zaak.id, l.tafelId, l.soort);
      else if (l.actie === "serveer") await verplaatsFase(zaak, { tafelId: l.tafelId }, "alles", STAPPEN.serveer);
      else {
        await tafelVrij(zaak, l.tafelId);
        await handelAf(zaak.id, l.tafelId);
      }
      return NextResponse.json(await dashboardVan(zaak));
    }
    const a = lees(beheerActieSchema, body);
    let nu = zaak;
    switch (a.actie) {
      case "gegevens": {
        const { actie: _a, ...g } = a;
        nu = await werkGegevensBij(zaak, g);
        break;
      }
      case "online":
        nu = await zetOnline(zaak, a.online);
        break;
      case "openingstijden":
        nu = await zetOpeningstijden(zaak, a.tijden);
        break;
      case "module":
        nu = await zetModuleAan(zaak, a.module, a.aan);
        break;
      case "categorie":
        await bewaarCategorie(zaak, { id: a.id, naam: a.naam });
        break;
      case "categorie-weg":
        await verwijderCategorie(zaak, a.id);
        break;
      case "item": {
        const { actie: _a, ...it } = a;
        await bewaarItem(zaak, it);
        break;
      }
      case "item-weg":
        await verwijderItem(zaak, a.id);
        break;
      case "beschikbaar":
        await zetBeschikbaar(zaak, a.id, a.beschikbaar);
        break;
      case "tafel": {
        const { actie: _a, ...t } = a;
        await bewaarTafel(zaak, t);
        break;
      }
      case "tafel-weg":
        await verwijderTafel(zaak, a.id);
        break;
      case "tafel-code":
        await vernieuwCode(zaak, a.id);
        break;
      case "bestelling": {
        eisModule(zaak, "bestellen");
        const b = await plaatsBestelling(zaak, { tafelId: a.tafelId, mand: a.mand, opmerking: a.opmerking, naam: a.naam, bron: "bediening" });
        return NextResponse.json({ ...(await alles(zaak)), nummer: b.nummer });
      }
      case "bestelstatus":
        eisModule(zaak, "bestellen");
        await zetBestelStatus(zaak, a.id, a.status);
        return NextResponse.json({ bestellingen: await bestellingenVan(zaak.id) });
      case "reservering": {
        eisModule(zaak, "reserveren");
        const { actie: _a, ...r } = a;
        const res = await maakReservering(zaak, r, "bediening");
        // telefonisch ingeboekt met e-mailadres: de gast krijgt ook een bevestiging met annuleerlink
        if (res.email) after(() => verstuur(bevestigingGast(zaak, res)).then(() => undefined));
        return NextResponse.json({ datum: a.datum, reserveringen: await reserveringenOp(zaak.id, a.datum) });
      }
      case "reservering-status":
      case "reservering-tafel": {
        eisModule(zaak, "reserveren");
        if (a.actie === "reservering-status") await zetReserveringStatus(zaak, a.id, a.status);
        else await zetReserveringTafel(zaak, a.id, a.tafelId);
        return NextResponse.json({ ok: true });
      }
      case "reserveer-instellingen": {
        const { actie: _a, ...inst } = a;
        nu = await bewaarReserveerInstellingen(zaak, inst);
        break;
      }
    }
    return NextResponse.json(await alles(nu));
  } catch (err) {
    return fout(err);
  }
}
