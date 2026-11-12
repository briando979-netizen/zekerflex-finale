// ---------------------------------------------------------------------------
// Bank: banktransacties koppelen aan facturen en bonnen (datalaag, met prisma). De regels staan in matching-kern.ts.
// Boeken gebeurt ALLEEN via boekInTransactie (bron "BANK", bronId = het id van de banktransactie), samen met het
// bijwerken van de transactie in één databasetransactie: er is nooit een boeking zonder gekoppelde transactie.
// Een transactie wordt maar één keer verwerkt: de status gaat in dezelfde transactie van NIEUW/TWIJFEL naar GEKOPPELD.
// In logs en het auditspoor alleen id's en aantallen, nooit namen of IBAN's. Stripe-uitbetalingen worden alleen
// gemarkeerd, niet geboekt (Stripe is nog niet aangesloten).
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { boekInTransactie } from "../boek";
import { REKENING_CREDITEUREN } from "../bonnen/boeking";
import { REKENING_DEBITEUREN } from "../inkomsten-kern";
import { openPosten } from "../lezen";
import { dagVanDatumKolom } from "../lezen-kern";
import { bevatPersoonsgegevens } from "../omschrijving";
import { bouwBankBoeking, controleerBedragVoorDoel, type BankBoekDoel } from "./boeking-kern";
import { beslis, type BetaaldeBon, type OpenBon, type OpenFactuur } from "./matching-kern";
import type { VerwerkUitkomst } from "./types";
import { leesVoorstel, voorstelUitBeslissing, type Koppeling, type OpgeslagenVoorstel } from "./voorstel";

const OPEN_STATUSSEN = ["NIEUW", "TWIJFEL"] as const;
const FAR_FUTURE = "9999-12-31";

export interface VerwerkOpties {
  bankRekeningId?: string | undefined;
  /** ook transacties die al "even kijken" zijn opnieuw beoordelen (na een nieuwe bon of factuur) */
  ookTwijfel?: boolean | undefined;
  door: string;
}

interface BankInfo {
  id: string;
  administratieId: string;
  grootboekId: string;
  /** valuta van de administratie; de bankrekening moet daar gelijk aan zijn om te kunnen boeken */
  valuta: string;
  rekeningValuta: string;
  actief: boolean;
}

async function laadBankInfo(bankRekeningId: string): Promise<BankInfo> {
  const r = await prisma.boekBankRekening.findUnique({
    where: { id: bankRekeningId },
    select: { id: true, administratieId: true, rekeningId: true, valuta: true, actief: true, administratie: { select: { valuta: true, actief: true } } },
  });
  if (!r) throw AppError.notFound("Deze bankrekening bestaat niet.");
  return {
    id: r.id,
    administratieId: r.administratieId,
    grootboekId: r.rekeningId,
    valuta: r.administratie.valuta,
    rekeningValuta: r.valuta,
    actief: r.actief && r.administratie.actief,
  };
}

async function rekeningIdOpNummer(administratieId: string, nummer: string): Promise<string> {
  const r = await prisma.boekRekening.findFirst({ where: { administratieId, nummer, actief: true, boekbaar: true }, select: { id: true } });
  if (!r) throw AppError.validation(`Rekening ${nummer} ontbreekt in deze administratie.`);
  return r.id;
}

interface WerkContext {
  facturen: OpenFactuur[];
  bonnen: OpenBon[];
  betaaldeBonnen: BetaaldeBon[];
}

/** Wat er openstaat (facturen, bonnen) en welke tegenrekeningen eerder voor welke klant betaalden. */
async function laadWerkContext(administratieId: string): Promise<WerkContext> {
  const posten = await openPosten(administratieId, FAR_FUTURE);
  const debiteuren = posten.filter((p) => p.soort === "DEBITEUR" && p.rekeningNummer === REKENING_DEBITEUREN && p.postSleutel.startsWith("factuur:") && p.saldoCents > 0);
  const crediteuren = posten.filter((p) => p.soort === "CREDITEUR" && p.rekeningNummer === REKENING_CREDITEUREN && p.postSleutel.startsWith("bon:") && p.saldoCents > 0);

  const invoiceIds = debiteuren.map((p) => p.postSleutel.slice("factuur:".length));
  const bonIds = crediteuren.map((p) => p.postSleutel.slice("bon:".length));

  const invoices = invoiceIds.length
    ? await prisma.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, number: true, recipientTenantId: true } })
    : [];
  const factuurPerId = new Map(invoices.map((i) => [i.id, i] as const));

  // Eerdere betalingen: welke tegenrekeningen hebben voor welke klant (tenant) betaald?
  const eerder = invoices.length
    ? await prisma.boekBankTransactie.findMany({
        where: { status: "GEKOPPELD", tegenIban: { not: null }, bankRekening: { administratieId } },
        orderBy: { createdAt: "desc" },
        take: 2000,
        select: { tegenIban: true, voorstel: true },
      })
    : [];
  const eerderInvoice = eerder.flatMap((e) => {
    const k = leesVoorstel(e.voorstel).gekoppeldAan;
    return e.tegenIban && k?.soort === "factuur" ? [{ iban: e.tegenIban, invoiceId: k.invoiceId }] : [];
  });
  const historie = eerderInvoice.length
    ? await prisma.invoice.findMany({ where: { id: { in: [...new Set(eerderInvoice.map((e) => e.invoiceId))] } }, select: { id: true, recipientTenantId: true } })
    : [];
  const tenantPerInvoice = new Map(historie.map((i) => [i.id, i.recipientTenantId] as const));
  const ibansPerTenant = new Map<string, Set<string>>();
  for (const e of eerderInvoice) {
    const tenant = tenantPerInvoice.get(e.invoiceId);
    if (!tenant) continue;
    const set = ibansPerTenant.get(tenant) ?? new Set<string>();
    set.add(e.iban);
    ibansPerTenant.set(tenant, set);
  }

  const facturen: OpenFactuur[] = debiteuren.flatMap((p) => {
    const inv = factuurPerId.get(p.postSleutel.slice("factuur:".length));
    if (!inv) return [];
    const bekend = inv.recipientTenantId ? [...(ibansPerTenant.get(inv.recipientTenantId) ?? [])] : [];
    return [{ invoiceId: inv.id, nummer: inv.number, openCents: p.saldoCents, bekendeIbans: bekend }];
  });

  const bonRijen = bonIds.length
    ? await prisma.boekBon.findMany({ where: { administratieId, id: { in: bonIds } }, select: { id: true, leverancier: true, leverancierNummer: true, bonDatum: true } })
    : [];
  const bonPerId = new Map(bonRijen.map((b) => [b.id, b] as const));
  const bonnen: OpenBon[] = crediteuren.flatMap((p) => {
    const b = bonPerId.get(p.postSleutel.slice("bon:".length));
    if (!b) return [];
    return [{ bonId: b.id, openCents: p.saldoCents, leverancier: b.leverancier, leverancierNummer: b.leverancierNummer, bonDatum: b.bonDatum ? dagVanDatumKolom(b.bonDatum) : null }];
  });

  // Bonnen die al "met de bank betaald" zijn geboekt en nog aan geen enkele banktransactie hangen.
  const betaald = await prisma.boekBon.findMany({
    where: { administratieId, status: "GEBOEKT", boekingId: { not: null }, boeking: { dagboek: "BANK" } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, boekingId: true, totaalCents: true, leverancier: true, leverancierNummer: true, bonDatum: true },
  });
  const betaaldeBoekingen = betaald.flatMap((b) => (b.boekingId ? [b.boekingId] : []));
  const bezet = betaaldeBoekingen.length
    ? await prisma.boekBankTransactie.findMany({ where: { boekingId: { in: betaaldeBoekingen } }, select: { boekingId: true } })
    : [];
  const bezetSet = new Set(bezet.flatMap((b) => (b.boekingId ? [b.boekingId] : [])));
  const betaaldeBonnen: BetaaldeBon[] = betaald.flatMap((b) =>
    b.boekingId && b.totaalCents !== null && !bezetSet.has(b.boekingId)
      ? [{ bonId: b.id, boekingId: b.boekingId, totaalCents: b.totaalCents, leverancier: b.leverancier, leverancierNummer: b.leverancierNummer, bonDatum: b.bonDatum ? dagVanDatumKolom(b.bonDatum) : null }]
      : [],
  );
  return { facturen, bonnen, betaaldeBonnen };
}

interface BoekEnKoppelOpties {
  transactieId: string;
  bank: BankInfo;
  boekdag: string;
  bedragCents: number;
  doel: BankBoekDoel;
  tegenRekeningId: string;
  opgeslagen: OpgeslagenVoorstel;
  score: number | null;
  door: string;
}

/** Boekt de transactie en koppelt hem in één databasetransactie. Gooit een AppError als dat niet kan. */
async function boekEnKoppel(o: BoekEnKoppelOpties): Promise<{ boekingId: string; boekstuk: string }> {
  if (o.bank.rekeningValuta !== o.bank.valuta) {
    throw AppError.validation(`Deze bankrekening is in ${o.bank.rekeningValuta}, de administratie boekt in ${o.bank.valuta}. Een vreemde valuta boeken we hier nog niet.`);
  }
  const invoer = bouwBankBoeking({
    administratieId: o.bank.administratieId,
    valuta: o.bank.valuta,
    transactieId: o.transactieId,
    boekdag: o.boekdag,
    bedragCents: o.bedragCents,
    bankRekeningId: o.bank.grootboekId,
    tegenRekeningId: o.tegenRekeningId,
    doel: o.doel,
    aangemaaktDoor: o.door,
  });
  return prisma.$transaction(async (tx) => {
    const claim = await tx.boekBankTransactie.updateMany({
      where: { id: o.transactieId, boekingId: null, status: { in: [...OPEN_STATUSSEN] } },
      data: { status: "GEKOPPELD" },
    });
    if (claim.count === 0) throw AppError.conflict("Deze transactie is al verwerkt.");
    const r = await boekInTransactie(tx, invoer);
    await tx.boekBankTransactie.update({
      where: { id: o.transactieId },
      data: { boekingId: r.boekingId, matchScorePromille: o.score, voorstel: o.opgeslagen as unknown as Prisma.InputJsonValue },
    });
    return { boekingId: r.boekingId, boekstuk: r.boekstuk };
  });
}

/**
 * Beoordeelt de nieuwe transacties (en met ookTwijfel ook de "even kijken"-transacties) van een administratie:
 * boekt wat zeker is, en zet de rest met een voorstel bij "even kijken".
 */
export async function verwerkNieuweTransacties(administratieId: string, opties: VerwerkOpties): Promise<VerwerkUitkomst> {
  const statussen = opties.ookTwijfel ? [...OPEN_STATUSSEN] : ["NIEUW" as const];
  const rijen = await prisma.boekBankTransactie.findMany({
    where: {
      status: { in: statussen },
      boekingId: null,
      bankRekening: { administratieId, ...(opties.bankRekeningId ? { id: opties.bankRekeningId } : {}) },
    },
    orderBy: [{ boekdatum: "asc" }, { createdAt: "asc" }],
    take: 25_000,
    select: { id: true, bankRekeningId: true, boekdatum: true, bedragCents: true, tegenIban: true, tegenNaam: true, omschrijving: true },
  });
  const uitkomst: VerwerkUitkomst = { bekeken: rijen.length, geboekt: 0, gekoppeld: 0, evenKijken: 0, mislukt: 0 };
  if (rijen.length === 0) return uitkomst;

  const ctx = await laadWerkContext(administratieId);
  const banken = new Map<string, BankInfo>();
  const debiteurenId = await rekeningIdOpNummer(administratieId, REKENING_DEBITEUREN).catch(() => null);
  const crediteurenId = await rekeningIdOpNummer(administratieId, REKENING_CREDITEUREN).catch(() => null);
  const zonderKandidaat: { id: string; reden: string }[] = [];

  const zetEvenKijken = async (id: string, opgeslagen: OpgeslagenVoorstel, score: number | null): Promise<void> => {
    await prisma.boekBankTransactie.updateMany({
      where: { id, boekingId: null, status: { in: [...OPEN_STATUSSEN] } },
      data: { status: "TWIJFEL", matchScorePromille: score, voorstel: opgeslagen as unknown as Prisma.InputJsonValue },
    });
    uitkomst.evenKijken += 1;
  };

  for (const t of rijen) {
    const boekdag = dagVanDatumKolom(t.boekdatum);
    const b = beslis({ bedragCents: t.bedragCents, boekdag, tegenIban: t.tegenIban, tegenNaam: t.tegenNaam, omschrijving: t.omschrijving }, ctx);
    const opgeslagen = voorstelUitBeslissing(b);
    const gekozen = b.gekozen;
    const gekozenVoorstel = gekozen?.voorstel;

    if (b.actie === "koppel" && gekozen && gekozenVoorstel?.soort === "bon-betaald") {
      const v = gekozenVoorstel;
      const res = await prisma.boekBankTransactie.updateMany({
        where: { id: t.id, boekingId: null, status: { in: [...OPEN_STATUSSEN] } },
        data: { status: "GEKOPPELD", boekingId: v.boekingId, matchScorePromille: gekozen.zekerheid, voorstel: { ...opgeslagen, gekoppeldAan: v } as unknown as Prisma.InputJsonValue },
      });
      if (res.count > 0) {
        uitkomst.gekoppeld += 1;
        const i = ctx.betaaldeBonnen.findIndex((x) => x.bonId === v.bonId);
        if (i >= 0) ctx.betaaldeBonnen.splice(i, 1);
      }
      continue;
    }

    if (b.actie === "boek" && gekozen && (gekozenVoorstel?.soort === "factuur" || gekozenVoorstel?.soort === "bon")) {
      try {
        let bank = banken.get(t.bankRekeningId);
        if (!bank) {
          bank = await laadBankInfo(t.bankRekeningId);
          banken.set(t.bankRekeningId, bank);
        }
        const v = gekozenVoorstel;
        const tegenId = v.soort === "factuur" ? debiteurenId : crediteurenId;
        if (!tegenId) throw AppError.validation("De rekening debiteuren of crediteuren ontbreekt in deze administratie.");
        await boekEnKoppel({
          transactieId: t.id,
          bank,
          boekdag,
          bedragCents: t.bedragCents,
          doel: v.soort === "factuur" ? { soort: "factuur", invoiceId: v.invoiceId } : { soort: "bon", bonId: v.bonId },
          tegenRekeningId: tegenId,
          opgeslagen: { ...opgeslagen, gekoppeldAan: v },
          score: gekozen.zekerheid,
          door: opties.door,
        });
        uitkomst.geboekt += 1;
        // Wat er open stond, wordt kleiner: een tweede transactie voor dezelfde factuur boekt niet nog eens.
        if (v.soort === "factuur") {
          const f = ctx.facturen.find((x) => x.invoiceId === v.invoiceId);
          if (f) {
            f.openCents -= Math.abs(t.bedragCents);
            if (f.openCents <= 0) ctx.facturen.splice(ctx.facturen.indexOf(f), 1);
          }
        } else {
          const bon = ctx.bonnen.find((x) => x.bonId === v.bonId);
          if (bon) {
            bon.openCents -= Math.abs(t.bedragCents);
            if (bon.openCents <= 0) ctx.bonnen.splice(ctx.bonnen.indexOf(bon), 1);
          }
        }
        continue;
      } catch (e) {
        uitkomst.mislukt += 1;
        const tekst = e instanceof AppError ? e.message : "Onbekende fout bij het boeken.";
        logger.warn("banktransactie: vanzelf boeken mislukt", { transactieId: t.id });
        await zetEvenKijken(t.id, { ...opgeslagen, reden: `Vanzelf boeken lukte niet: ${tekst}` }, gekozen.zekerheid);
        continue;
      }
    }

    if (b.kandidaten.length === 0) {
      zonderKandidaat.push({ id: t.id, reden: b.reden });
      continue;
    }
    await zetEvenKijken(t.id, opgeslagen, b.gekozen?.zekerheid ?? 0);
  }

  // Transacties zonder enige kandidaat hebben dezelfde (lege) inhoud per reden: in een keer bijwerken.
  const perReden = new Map<string, string[]>();
  for (const z of zonderKandidaat) perReden.set(z.reden, [...(perReden.get(z.reden) ?? []), z.id]);
  for (const [reden, ids] of perReden) {
    const leeg: OpgeslagenVoorstel = { versie: 1, reden, kandidaten: [], gekozen: null };
    for (let i = 0; i < ids.length; i += 1000) {
      const stuk = ids.slice(i, i + 1000);
      const r = await prisma.boekBankTransactie.updateMany({
        where: { id: { in: stuk }, boekingId: null, status: { in: [...OPEN_STATUSSEN] } },
        data: { status: "TWIJFEL", matchScorePromille: 0, voorstel: leeg as unknown as Prisma.InputJsonValue },
      });
      uitkomst.evenKijken += r.count;
    }
  }
  logger.info("banktransacties verwerkt", { administratieId, ...uitkomst });
  return uitkomst;
}

// ---- wat een mens doet -----------------------------------------------------

export type KoppelKeuze = { factuurId: string } | { bonId: string } | { rekeningNummer: string };

interface OpenTransactie {
  id: string;
  bankRekeningId: string;
  boekdag: string;
  bedragCents: number;
  voorstel: OpgeslagenVoorstel;
}

async function laadOpenTransactie(id: string): Promise<OpenTransactie> {
  const t = await prisma.boekBankTransactie.findUnique({
    where: { id },
    select: { id: true, bankRekeningId: true, boekdatum: true, bedragCents: true, status: true, boekingId: true, voorstel: true },
  });
  if (!t) throw AppError.notFound("Deze banktransactie bestaat niet.");
  if (t.status === "GEKOPPELD" || t.boekingId) throw AppError.validation("Deze transactie is al gekoppeld. Een fout herstel je met een tegenboeking op de boeking.");
  if (t.status === "GENEGEERD") throw AppError.validation("Deze transactie is genegeerd. Zet hem eerst terug naar even kijken.");
  return { id: t.id, bankRekeningId: t.bankRekeningId, boekdag: dagVanDatumKolom(t.boekdatum), bedragCents: t.bedragCents, voorstel: leesVoorstel(t.voorstel) };
}

/**
 * Een mens koppelt een transactie aan een factuur, een bon of een kostenrekening; er wordt (zo nodig) geboekt.
 * Een bon die al "met de bank betaald" is geboekt wordt alleen gekoppeld, niet nog eens geboekt.
 */
export async function koppelTransactie(id: string, keuze: KoppelKeuze, door: string): Promise<{ boekstuk: string | null }> {
  const t = await laadOpenTransactie(id);
  const bank = await laadBankInfo(t.bankRekeningId);
  if (!bank.actief) throw AppError.validation("Deze bankrekening of administratie is niet actief: er wordt niet meer in geboekt.");
  const handmatig = (koppeling: Koppeling, reden: string): OpgeslagenVoorstel => ({ ...t.voorstel, reden, gekoppeldAan: koppeling, handmatig: true });

  if ("factuurId" in keuze) {
    const posten = await openPosten(bank.administratieId, FAR_FUTURE);
    const post = posten.find((p) => p.postSleutel === `factuur:${keuze.factuurId}` && p.rekeningNummer === REKENING_DEBITEUREN && p.soort === "DEBITEUR");
    if (!post) throw AppError.validation("Deze factuur staat niet (meer) open in de boekhouding van deze administratie.");
    controleerBedragVoorDoel(t.bedragCents, { soort: "factuur", invoiceId: keuze.factuurId }, post.saldoCents, bank.valuta);
    const inv = await prisma.invoice.findUnique({ where: { id: keuze.factuurId }, select: { number: true } });
    const r = await boekEnKoppel({
      transactieId: t.id, bank, boekdag: t.boekdag, bedragCents: t.bedragCents,
      doel: { soort: "factuur", invoiceId: keuze.factuurId },
      tegenRekeningId: await rekeningIdOpNummer(bank.administratieId, REKENING_DEBITEUREN),
      opgeslagen: handmatig({ soort: "factuur", invoiceId: keuze.factuurId, nummer: inv?.number ?? "", openCents: post.saldoCents }, "Door een beheerder aan een factuur gekoppeld."),
      score: null, door,
    });
    return { boekstuk: r.boekstuk };
  }

  if ("bonId" in keuze) {
    const posten = await openPosten(bank.administratieId, FAR_FUTURE);
    const post = posten.find((p) => p.postSleutel === `bon:${keuze.bonId}` && p.rekeningNummer === REKENING_CREDITEUREN && p.soort === "CREDITEUR");
    if (post) {
      controleerBedragVoorDoel(t.bedragCents, { soort: "bon", bonId: keuze.bonId }, post.saldoCents, bank.valuta);
      const r = await boekEnKoppel({
        transactieId: t.id, bank, boekdag: t.boekdag, bedragCents: t.bedragCents,
        doel: { soort: "bon", bonId: keuze.bonId },
        tegenRekeningId: await rekeningIdOpNummer(bank.administratieId, REKENING_CREDITEUREN),
        opgeslagen: handmatig({ soort: "bon", bonId: keuze.bonId, openCents: post.saldoCents }, "Door een beheerder aan een bon gekoppeld."),
        score: null, door,
      });
      return { boekstuk: r.boekstuk };
    }
    // Geen open post: misschien is de bon al met de bank betaald geboekt (dan alleen koppelen).
    const bon = await prisma.boekBon.findUnique({
      where: { id: keuze.bonId },
      select: { administratieId: true, status: true, boekingId: true, totaalCents: true, boeking: { select: { dagboek: true } } },
    });
    if (!bon || bon.administratieId !== bank.administratieId) throw AppError.validation("Deze bon hoort niet bij deze administratie.");
    if (bon.status !== "GEBOEKT" || !bon.boekingId) throw AppError.validation("Deze bon is nog niet geboekt. Keur hem eerst goed onder Bonnen: even kijken.");
    if (bon.boeking?.dagboek !== "BANK") throw AppError.validation("Deze bon is al volledig betaald.");
    if (bon.totaalCents !== Math.abs(t.bedragCents) || t.bedragCents >= 0) throw AppError.validation("Het bedrag van de transactie is niet gelijk aan het totaal van de bon.");
    const bezet = await prisma.boekBankTransactie.count({ where: { boekingId: bon.boekingId } });
    if (bezet > 0) throw AppError.validation("Deze bon is al aan een andere banktransactie gekoppeld.");
    const koppeling: Koppeling = { soort: "bon-betaald", bonId: keuze.bonId, boekingId: bon.boekingId };
    const res = await prisma.boekBankTransactie.updateMany({
      where: { id: t.id, boekingId: null, status: { in: [...OPEN_STATUSSEN] } },
      data: { status: "GEKOPPELD", boekingId: bon.boekingId, voorstel: handmatig(koppeling, "Door een beheerder aan een al betaalde bon gekoppeld.") as unknown as Prisma.InputJsonValue },
    });
    if (res.count === 0) throw AppError.conflict("Deze transactie is al verwerkt.");
    return { boekstuk: null };
  }

  // Als kosten boeken: alleen een afschrijving, op een actieve kostenrekening.
  if (t.bedragCents >= 0) {
    throw AppError.validation("Een ontvangen bedrag boek je op een factuur. Omzet zonder btw-controle boeken we hier niet; laat dit staan of negeer het.");
  }
  const rek = await prisma.boekRekening.findFirst({
    where: { administratieId: bank.administratieId, nummer: keuze.rekeningNummer, actief: true, boekbaar: true },
    select: { id: true, soort: true },
  });
  if (!rek) throw AppError.validation("Deze kostenrekening bestaat niet in deze administratie.");
  if (rek.soort !== "KOSTEN") throw AppError.validation("Kies een kostenrekening: een uitgave boek je op een kostenrekening.");
  const r = await boekEnKoppel({
    transactieId: t.id, bank, boekdag: t.boekdag, bedragCents: t.bedragCents,
    doel: { soort: "kosten", rekeningId: rek.id }, tegenRekeningId: rek.id,
    opgeslagen: handmatig({ soort: "kosten", rekeningNummer: keuze.rekeningNummer }, "Door een beheerder als kosten geboekt (zonder btw: boek de bon erbij voor de btw)."),
    score: null, door,
  });
  return { boekstuk: r.boekstuk };
}

/** Een mens laat een transactie liggen (bv. een privé-overschrijving). Er wordt niets geboekt. */
export async function negeerTransactie(id: string, reden: string, door: string): Promise<void> {
  const schoon = reden.trim();
  if (schoon.length < 3) throw AppError.validation("Geef een reden om deze transactie te negeren.");
  if (schoon.length > 500) throw AppError.validation("De reden is te lang (hooguit 500 tekens).");
  if (bevatPersoonsgegevens(schoon)) throw AppError.validation("Schrijf geen e-mailadres of IBAN in de reden.");
  const t = await laadOpenTransactie(id);
  const res = await prisma.boekBankTransactie.updateMany({
    where: { id, boekingId: null, status: { in: [...OPEN_STATUSSEN] } },
    data: { status: "GENEGEERD", voorstel: { ...t.voorstel, genegeerdReden: schoon, handmatig: true } as unknown as Prisma.InputJsonValue },
  });
  if (res.count === 0) throw AppError.conflict("Deze transactie is al verwerkt.");
  logger.info("banktransactie genegeerd", { transactieId: id, door });
}

/** Een genegeerde transactie weer bij "even kijken" zetten. */
export async function heropenTransactie(id: string): Promise<void> {
  const res = await prisma.boekBankTransactie.updateMany({ where: { id, status: "GENEGEERD", boekingId: null }, data: { status: "TWIJFEL" } });
  if (res.count === 0) throw AppError.validation("Alleen een genegeerde transactie kun je terugzetten.");
}
