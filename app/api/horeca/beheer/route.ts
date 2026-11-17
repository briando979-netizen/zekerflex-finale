import { after, NextResponse } from "next/server";
import { bevestigingGast, verstuur } from "@/lib/horeca/mail";
import { AppError, toErrorBody } from "@/lib/errors";
import { companyDefaults } from "@/lib/sites/access";
import { aanzetVoorstel } from "@/lib/sites/aanzet-voorstel";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { aanzettenSchema, beheerActieSchema, BEZORG_ACTIES, bezorgActieSchema, lees, LIVE_ACTIES, liveActieSchema, takenActieSchema, TAKEN_ACTIES, uitbetaalSchema } from "@/lib/horeca/schema";
import { leesBezorgen } from "@/lib/horeca/bezorgen";
import { leesArchiefFilter } from "@/lib/horeca/archief";
import { archiefCsvVan, archiefVan } from "@/lib/horeca/archief-server";
import { bevestigTijd, bewaarBezorger, bewaarBezorgInstellingen, plaatsLevering, verwijderBezorger, wijsBezorgerToe, zetAfgeleverd, zetOnderweg } from "@/lib/horeca/bezorgen-server";
import { prisma } from "@/lib/prisma";
import { bewaarLijst, lijstenOp, maakVoorbeeldlijsten, registratie, verwijderLijst, vinkAf, vinkUit } from "@/lib/horeca/takenlijsten";
import { beheerContext, eisBeheer, isEigenaar } from "@/lib/horeca/toegang";
import { neemOp, uitbetaalStand, zetAutomatischUitbetalen } from "@/lib/horeca/uitbetalen";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  bewaarCategorie,
  bewaarItem,
  maakZaak,
  menukaart,
  soortUitKvk,
  verwijderCategorie,
  verwijderItem,
  werkGegevensBij,
  zetBeschikbaar,
  zetModuleAan,
  zetVoorraad,
  zetOnline,
  zetOpeningstijden,
} from "@/lib/horeca/store";
import { heeftModule, maandbedrag, MODULES, type ModuleSleutel } from "@/lib/horeca/modules";
import { zaakWeergave } from "@/lib/horeca/weergave";
import { aantalNieuw, bestellingenVan, bewaarTafel, plaatsBestelling, tafelsVan, tafelVrij, verplaatsFase, vernieuwCode, verwijderTafel, zetBestelStatus } from "@/lib/horeca/bestellingen";
import { bewaarReserveerInstellingen, maakReservering, reserveringenOp, zetReserveringStatus, zetReserveringTafel } from "@/lib/horeca/reserveringen";
import { isDatum, leesInstellingen } from "@/lib/horeca/reserveren";
import { cijfersVan } from "@/lib/horeca/cijfers-server";
import { dashboardVan } from "@/lib/horeca/live";
import { apparatenVan, bewaarApparaat, koppelcodeVoor, ontkoppel } from "@/lib/horeca/apparaten";
import { handelAf } from "@/lib/horeca/oproepen";
import { STAPPEN } from "@/lib/horeca/fasen";
import { afrekenen, bewaarGrootboek, bewaarKassa, dagafsluiting, dagstaatCsvVan, journaalCsvVan, kassaCsv, leesKassa, telKas } from "@/lib/horeca/kassa-server";
import { koppelStripe, stripeDashboard, stripeStand } from "@/lib/horeca/betalen";
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
  return {
    aan: true,
    zaak: zaakWeergave(zaak),
    ...kaart,
    tafels,
    maand: maandbedrag(zaak.modules),
    reserveren: leesInstellingen(zaak.reserveren),
    kassa: { btwNummer: zaak.btwNummer, ...leesKassa(zaak.kassa) },
    bezorgen: {
      ...leesBezorgen(zaak.bezorgen),
      ligging: typeof zaak.lat === "number" && typeof zaak.lng === "number",
      // de zaak op de bestellingenkaart
      plek: typeof zaak.lat === "number" && typeof zaak.lng === "number" ? { lat: zaak.lat, lng: zaak.lng } : null,
    },
  };
}

const eisModule = (zaak: HorecaZaak, m: ModuleSleutel) => {
  if (!heeftModule(zaak, m)) throw AppError.precondition(`Zet eerst de module ${MODULES[m].naam} aan.`);
};

// GET → alles voor het beheer; ?alleen=bestellingen → alleen de bestellingen (keukenscherm ververst vaak)
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { p, tenantId, zaak } = await beheerContext();
    if (!zaak) {
      // de eerste stap vooraf ingevuld met wat het bedrijf ons al gaf (lib/sites/aanzet-voorstel.ts)
      const [d, soort] = await Promise.all([companyDefaults(tenantId, p), soortUitKvk(tenantId)]);
      return NextResponse.json({ aan: false, voorstel: { ...aanzetVoorstel(d), soort } });
    }
    const q = new URL(request.url).searchParams;
    // ?alleen=teller → hoeveel bestellingen op de zaak wachten (het tellertje in het menu, components/horeca/MenuTeller.tsx)
    if (q.get("alleen") === "teller") return NextResponse.json({ nieuw: heeftModule(zaak, "bestellen") ? await aantalNieuw(zaak.id) : 0 });
    // ?alleen=live → het live-dashboard (zaal, cijfers van vandaag, oproepen, takenlijsten, schermen)
    if (q.get("alleen") === "live") return NextResponse.json(await dashboardVan(zaak));
    // ?alleen=stripe → is het Stripe-account van de zaak gekoppeld en klaar voor iDEAL aan tafel (lib/horeca/betalen.ts)
    if (q.get("alleen") === "stripe") return NextResponse.json(await stripeStand(zaak, true));
    // ?alleen=uitbetalen → saldo bij Stripe, automatisch of met de hand, laatste uitbetalingen (lib/horeca/uitbetalen.ts)
    if (q.get("alleen") === "uitbetalen") {
      eisModule(zaak, "betalen");
      return NextResponse.json({ stand: await uitbetaalStand(zaak), eigenaar: await isEigenaar(zaak) });
    }
    // ?alleen=kassa&datum= → dagafsluiting (Z-rapport, bonnen, kastelling); ?alleen=kassa-csv&van=&tot= → alle bonnen als CSV;
    // ?alleen=kassa-dagstaat&van=&tot= → de dagstaat (memoriaal per dag) als CSV, beide voor de boekhouder
    // ?alleen=kassa-journaal&van=&tot= → de kassa als journaalposten met grootboeknummers, voor een boekhoudprogramma (lib/horeca/journaal.ts)
    if (q.get("alleen") === "kassa" || q.get("alleen") === "kassa-csv" || q.get("alleen") === "kassa-dagstaat" || q.get("alleen") === "kassa-journaal") {
      eisModule(zaak, "kassa");
      if (q.get("alleen") === "kassa") {
        const datum = q.get("datum") ?? "";
        if (!isDatum(datum)) throw AppError.validation("Kies een datum.");
        return NextResponse.json(await dagafsluiting(zaak, datum));
      }
      const van = q.get("van") ?? "";
      const tot = q.get("tot") ?? "";
      if (!isDatum(van) || !isDatum(tot) || van > tot) throw AppError.validation("Kies een periode.");
      const soort = q.get("alleen") === "kassa-dagstaat" ? "dagstaat" : q.get("alleen") === "kassa-journaal" ? "journaal" : "kassa";
      const csv = soort === "dagstaat" ? await dagstaatCsvVan(zaak, van, tot) : soort === "journaal" ? await journaalCsvVan(zaak, van, tot) : await kassaCsv(zaak, van, tot);
      return new NextResponse(csv, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${soort}-${zaak.slug}-${van}-${tot}.csv"` },
      });
    }
    // ?alleen=archief&van=&tot=&soort=&bron=&betaald=&geannuleerd=&bezorger=&q= → het archief met omzet en btw;
    // ?alleen=archief-csv met dezelfde filter → CSV (lib/horeca/archief.ts)
    if (q.get("alleen") === "archief" || q.get("alleen") === "archief-csv") {
      eisModule(zaak, "bestellen");
      const f = leesArchiefFilter(q);
      if ("fout" in f) throw AppError.validation(f.fout);
      if (q.get("alleen") === "archief") return NextResponse.json(await archiefVan(zaak, f));
      return new NextResponse(await archiefCsvVan(zaak, f), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="bestellingen-${zaak.slug}-${f.van}-${f.tot}.csv"` },
      });
    }
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
    // afrekenen aan tafel: het eigen Stripe-account van de zaak koppelen of openen
    const stripeActie = (body as { actie?: unknown } | null)?.actie;
    if (stripeActie === "stripe-koppelen" || stripeActie === "stripe-overzicht") {
      eisModule(zaak, "betalen");
      return NextResponse.json({ url: stripeActie === "stripe-koppelen" ? await koppelStripe(zaak, { email: p.email }) : await stripeDashboard(zaak) });
    }
    // het geld van de zaak bij Stripe: automatisch uitbetalen aan/uit en zelf opnemen. Alleen de eigenaar.
    if (stripeActie === "uitbetalen-automatisch" || stripeActie === "uitbetalen-opnemen") {
      eisModule(zaak, "betalen");
      if (!(await isEigenaar(zaak))) throw AppError.precondition("Alleen de eigenaar van de zaak kan het uitbetalen regelen.");
      const u = lees(uitbetaalSchema, body);
      if (u.actie === "uitbetalen-automatisch") return NextResponse.json({ stand: await zetAutomatischUitbetalen(zaak, u.aan, { userId: p.userId }) });
      await enforceRateLimit({ name: "horeca-opname", identifier: zaak.id, limit: 10, windowSeconds: 3600 });
      return NextResponse.json(await neemOp(zaak, u.bedragCent ?? null, { userId: p.userId }));
    }
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
    // afhalen en bezorgen (module bezorgen): eigen schema
    if (BEZORG_ACTIES.includes(String((body as { actie?: unknown } | null)?.actie))) {
      const b = lees(bezorgActieSchema, body);
      switch (b.actie) {
        case "bezorg-instellingen": {
          const { actie: _a, ...inst } = b;
          return NextResponse.json(await alles(await bewaarBezorgInstellingen(zaak, inst)));
        }
        case "bezorger":
          return NextResponse.json(await alles(await bewaarBezorger(zaak, { id: b.id, naam: b.naam, telefoon: b.telefoon, actief: b.actief })));
        case "bezorger-weg":
          return NextResponse.json(await alles(await verwijderBezorger(zaak, b.id)));
        case "levering": {
          eisModule(zaak, "bestellen");
          const { actie: _a, soort, ...inv } = b;
          const nieuw = await plaatsLevering(zaak, { soort, ...inv }, "bediening");
          return NextResponse.json({ ...(await alles(zaak)), nummer: nieuw.nummer });
        }
        case "levering-tijd":
          await bevestigTijd(zaak, b.id, b.tijd);
          break;
        case "levering-bezorger":
          await wijsBezorgerToe(zaak, b.id, b.bezorgerId);
          break;
        case "levering-onderweg":
          await zetOnderweg(zaak, b.id, b.terug);
          break;
        case "levering-af":
          await zetAfgeleverd(zaak, b.id, b.betaalwijze, p.fullName);
          break;
      }
      return NextResponse.json({ bestellingen: await bestellingenVan(zaak.id) });
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
      if (l.actie === "afrekenen") {
        eisModule(zaak, "kassa");
        await afrekenen(zaak, { tafelId: l.tafelId, bestellingId: null, selectie: null, delen: [{ methode: l.methode, bedragCent: 0, fooiCent: 0 }], door: p.fullName });
        await handelAf(zaak.id, l.tafelId);
      } else if (l.actie === "oproep-af") await handelAf(zaak.id, l.tafelId, l.soort);
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
        // ander adres: de ligging opnieuw opzoeken bij de volgende bezorging (lib/horeca/bezorgen-server.ts)
        if (g.adres !== zaak.adres || g.plaats !== zaak.plaats) nu = await prisma.horecaZaak.update({ where: { id: zaak.id }, data: { lat: null, lng: null } });
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
      case "voorraad":
        await zetVoorraad(zaak, a.id, a.voorraad);
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
      case "kassa-instellingen":
        nu = await bewaarKassa(zaak, { btwNummer: a.btwNummer, voettekst: a.voettekst });
        break;
      case "kassa-grootboek":
        eisModule(zaak, "kassa");
        nu = await bewaarGrootboek(zaak, a.grootboek);
        break;
      case "kas-tellen":
        eisModule(zaak, "kassa");
        await telKas(zaak, a.datum, a.geteldCent, p.fullName);
        return NextResponse.json(await dagafsluiting(zaak, a.datum));
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
