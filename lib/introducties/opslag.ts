import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { kvSetIfAbsent } from "@/lib/storage/kv";
import { createLead } from "@/lib/sales/leads";
import { voegNotitieToe } from "@/lib/sales/bellijst";
import { zakelijkDomein } from "@/lib/sales/vrije-maildomeinen";
import {
  alleLijsten,
  koppelSleutel,
  leesKoppeling,
  leesLijst,
  leesPerBedrijf,
  leesTodoKlaar,
  schrijfLijst,
  type Introductie,
  type IntroductieKoppeling,
} from "@/lib/introducties/kv";
import { markeerBeloning } from "@/lib/introducties/beloning";
import {
  BEDRIJFSBEHEERDER,
  INTRO_SCORE,
  INTRO_SCORE_REDEN,
  aanvulling,
  dubbelVoorwaarden,
  introContactVan,
  introNotitie,
  koppelNotitie,
  metIntroContact,
} from "@/lib/introducties/lead";
import { laatsteGratisDag, vrijePeriode } from "@/lib/introducties/periode";
import {
  INTRODUCTIE_BRON,
  MAX_PER_PERSOON,
  beloningTodoId,
  eersteIntroductie,
  introStatus,
  normaliseerEmail,
  type AdminIntroRegel,
  type IntroductieRegel,
  type IntroductieRol,
  type SchoneIntroductie,
} from "@/lib/introducties/regels";

// ---------------------------------------------------------------------------
// "Introduceer een bedrijf" op de server (regels en uitleg: lib/introducties/regels.ts, opslag: lib/introducties/kv.ts).
// Indienen maakt een lead met bron "introductie" en zonder campagne: de sales-motor mailt alleen leads van een campagne
// (lib/sales/engine.ts), dus niemand krijgt vanzelf iets. Kennen we het bedrijf al (lead of klant), dan komt er geen
// tweede lead: de introductie wordt alleen vastgelegd (en een bestaande lead krijgt lege velden aangevuld).
// ---------------------------------------------------------------------------

const nieuwId = () => randomBytes(8).toString("base64url").replace(/[-_]/g, "x").slice(0, 10);

export type IndienUitkomst = "nieuw" | "bestaande-lead" | "al-klant";

/** Al klant (een beheerder van een bedrijf met dit adres of domein) of al een lead? */
async function zoekBestaand(email: string | null, telefoon: string | null) {
  const v = dubbelVoorwaarden(email, telefoon);
  if (v.gebruiker.length > 0) {
    const klant = await prisma.user.findFirst({
      where: { disabledAt: null, OR: v.gebruiker, memberships: { some: BEDRIJFSBEHEERDER } },
      select: { memberships: { where: BEDRIJFSBEHEERDER, select: { tenantId: true }, take: 1 } },
    });
    const tenantId = klant?.memberships[0]?.tenantId ?? null;
    if (tenantId) return { tenantId, lead: null };
  }
  const lead =
    v.lead.length > 0
      ? await prisma.salesLead.findFirst({
          where: { OR: v.lead },
          orderBy: { createdAt: "asc" },
          select: { id: true, companyName: true, contactName: true, contactEmail: true, contactPhone: true, notes: true, enrichmentJson: true },
        })
      : null;
  return { tenantId: null, lead };
}

export async function dienIntroductieIn(
  input: SchoneIntroductie & { userId: string; eigenEmail: string; rol: IntroductieRol },
  nu: Date = new Date(),
): Promise<{ uitkomst: IndienUitkomst; introducties: IntroductieRegel[] }> {
  const { userId, rol, contactNaam, bedrijf, email, telefoon } = input;
  if (email && email === normaliseerEmail(input.eigenEmail)) throw AppError.validation("Je kunt jezelf niet voorstellen.", { veld: "zelf" });
  const lijst = await leesLijst(userId);
  if (lijst.length >= MAX_PER_PERSOON) throw AppError.validation("Je hebt het maximale aantal introducties bereikt.", { veld: "vol" });

  const bestaand = await zoekBestaand(email, telefoon);
  // zelf al eens voorgesteld: hetzelfde bedrijf (klant) of dezelfde lead (adres, domein of nummer)
  if (lijst.some((i) => (bestaand.tenantId && i.alKlantTenantId === bestaand.tenantId) || (bestaand.lead && i.leadId === bestaand.lead.id))) {
    throw AppError.validation("Dit bedrijf heb je al voorgesteld.", { veld: "dubbel" });
  }
  const introId = nieuwId();
  let leadId: string | null = null;
  let uitkomst: IndienUitkomst;
  if (bestaand.tenantId) {
    // al klant: geen lead en geen contactgegevens bewaren, alleen dat het is voorgesteld
    uitkomst = "al-klant";
  } else if (bestaand.lead) {
    uitkomst = "bestaande-lead";
    leadId = bestaand.lead.id;
    await prisma.salesLead.update({
      where: { id: bestaand.lead.id },
      data: {
        ...aanvulling(bestaand.lead, { contactNaam, email, telefoon }),
        notes: voegNotitieToe(bestaand.lead.notes, introNotitie(rol, nu)),
        // het contact van deze introductie bij de lead (niet in de lijst van wie het voorstelde, lib/introducties/kv.ts)
        enrichmentJson: metIntroContact(bestaand.lead.enrichmentJson, { introId, at: nu.toISOString(), contactNaam, email, telefoon }),
      },
    });
  } else {
    uitkomst = "nieuw";
    // geen campagne, geen volgende stap: buiten elke automatische mail (lib/sales/engine.ts kijkt alleen naar campagnes)
    const lead = await createLead({
      companyName: bedrijf,
      contactName: contactNaam,
      contactEmail: email ?? undefined,
      contactPhone: telefoon ?? undefined,
      source: INTRODUCTIE_BRON,
      notes: introNotitie(rol, nu),
      createdById: userId,
      score: INTRO_SCORE,
      scoreRationale: INTRO_SCORE_REDEN,
    });
    leadId = lead.id;
  }

  const intro: Introductie = {
    id: introId,
    at: nu.toISOString(),
    rol,
    bedrijf,
    contactNaam,
    leadId,
    alKlantTenantId: bestaand.tenantId,
    bestondAl: Boolean(bestaand.lead),
  };
  await schrijfLijst(userId, [intro, ...lijst]);
  if (uitkomst !== "nieuw") {
    // een nieuwe lead staat al in het auditspoor (createLead); de andere twee hier
    await recordAudit({
      category: "SALES",
      action: "sales.introductie.ingediend",
      actorUserId: userId,
      actorLabel: "user",
      summary: `Introductie ${bedrijf}: ${uitkomst === "al-klant" ? "al klant, alleen vastgelegd" : "bestaande lead aangevuld"}`,
      targetType: uitkomst === "al-klant" ? "tenant" : "salesLead",
      targetId: uitkomst === "al-klant" ? bestaand.tenantId : leadId,
      metadata: { introId: intro.id, rol },
    });
  }
  return { uitkomst, introducties: await mijnIntroducties(userId) };
}

/** De stand van elke introductie in één keer: leads, koppelingen, beloningen en de afgevinkte taken. */
async function feitenVoor(introducties: readonly Introductie[]) {
  const leadIds = [...new Set(introducties.map((i) => i.leadId).filter((x): x is string => Boolean(x)))];
  const leads = leadIds.length
    ? await prisma.salesLead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, status: true, lastContactedAt: true, suppressed: true, invitedTenantId: true, contactEmail: true, contactPhone: true, enrichmentJson: true },
      })
    : [];
  const perLead = new Map(leads.map((l) => [l.id, l]));
  const { koppelingen, beloningen } = await leesPerBedrijf(leads.map((l) => l.invitedTenantId).filter((x): x is string => Boolean(x)));
  const klaar = await leesTodoKlaar();

  const feiten = (i: Introductie) => {
    const lead = i.leadId ? (perLead.get(i.leadId) ?? null) : null;
    const k = lead?.invitedTenantId ? koppelingen.get(lead.invitedTenantId) : undefined;
    // alleen een koppeling die bij deze lead hoort (invitedTenantId kan ook van een bedrijfsbezoek komen)
    const koppeling = k && k.leadId === lead?.id ? k : null;
    const beloning = koppeling ? (beloningen.get(koppeling.tenantId) ?? null) : null;
    return {
      lead,
      koppeling,
      beloning,
      status: introStatus(i.id, {
        alKlant: Boolean(i.alKlantTenantId),
        lead,
        koppeling,
        beloningVerschuldigd: Boolean(beloning),
        beloningVerstuurd: Boolean(beloning && Object.hasOwn(klaar, beloningTodoId(beloning.introId))),
      }),
    };
  };
  return { feiten, klaar };
}

/** De eigen introducties, nieuwste eerst (werkersapp en werkgeversapp). */
export async function mijnIntroducties(userId: string): Promise<IntroductieRegel[]> {
  const lijst = await leesLijst(userId);
  if (lijst.length === 0) return [];
  const { feiten } = await feitenVoor(lijst);
  return lijst.map((i) => ({ id: i.id, at: i.at, bedrijf: i.bedrijf, contactNaam: i.contactNaam, status: feiten(i).status }));
}

/** Alle introducties voor Beheer → Sales → Introducties, nieuwste eerst. */
export async function alleIntroducties(): Promise<AdminIntroRegel[]> {
  const lijsten = await alleLijsten();
  const rijen = lijsten.flatMap(({ userId, lijst }) => lijst.map((i) => ({ userId, i })));
  if (rijen.length === 0) return [];
  const { feiten, klaar } = await feitenVoor(rijen.map((r) => r.i));

  const perLead = new Map<string, Introductie[]>();
  for (const { i } of rijen) if (i.leadId) perLead.set(i.leadId, [...(perLead.get(i.leadId) ?? []), i]);
  const tenantIds = new Set<string>();
  for (const { i } of rijen) {
    const f = feiten(i);
    if (f.koppeling) tenantIds.add(f.koppeling.tenantId);
    if (i.alKlantTenantId) tenantIds.add(i.alKlantTenantId);
  }
  const [users, tenants] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(rijen.map((r) => r.userId))] } }, select: { id: true, fullName: true, email: true } }),
    tenantIds.size ? prisma.tenant.findMany({ where: { id: { in: [...tenantIds] } }, select: { id: true, name: true } }) : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const wie = new Map(users.map((u) => [u.id, u]));
  const naamVan = new Map(tenants.map((t) => [t.id, t.name]));

  return rijen
    .map(({ userId, i }): AdminIntroRegel => {
      const f = feiten(i);
      const eerste = i.leadId ? eersteIntroductie(perLead.get(i.leadId) ?? [])?.id === i.id : false;
      const contact = introContactVan(f.lead, i.id);
      return {
        id: i.id,
        at: i.at,
        rol: i.rol,
        bedrijf: i.bedrijf,
        contactNaam: i.contactNaam,
        email: contact.email,
        telefoon: contact.telefoon,
        door: { userId, naam: wie.get(userId)?.fullName ?? "verwijderd account", email: wie.get(userId)?.email ?? null },
        leadId: i.leadId,
        leadStatus: f.lead?.status ?? null,
        bestondAl: i.bestondAl,
        alKlant: i.alKlantTenantId ? { tenantId: i.alKlantTenantId, naam: naamVan.get(i.alKlantTenantId) ?? "onbekend bedrijf" } : null,
        eerste,
        status: f.status,
        koppeling: f.koppeling
          ? {
              tenantId: f.koppeling.tenantId,
              naam: naamVan.get(f.koppeling.tenantId) ?? "onbekend bedrijf",
              gratisVanaf: f.koppeling.gratisVanaf,
              laatsteGratisDag: laatsteGratisDag(f.koppeling),
              gekoppeldOp: f.koppeling.gekoppeldOp,
            }
          : null,
        beloning:
          f.beloning && f.koppeling?.introId === i.id
            ? {
                factuurNummer: f.beloning.factuurNummer,
                betaaldOp: f.beloning.betaaldOp,
                verstuurd: Object.hasOwn(klaar, beloningTodoId(f.beloning.introId)),
                todoId: beloningTodoId(f.beloning.introId),
              }
            : null,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * "Gekoppeld aan bedrijf" (Beheer → Sales, alleen PLATFORM_ADMIN): het voorgestelde bedrijf heeft zich aangemeld als
 * deze organisatie. Vanaf vandaag twee weken geen platformkosten; de eerste introductie voor de lead krijgt de beloning.
 * De lead gaat naar "Gewonnen". Eén koppeling per bedrijf en per lead; nog een keer klikken verandert niets.
 */
export async function koppelIntroductie(input: { leadId: string; tenantId: string; actorUserId: string }, nu: Date = new Date()): Promise<IntroductieKoppeling> {
  const lead = await prisma.salesLead.findUnique({ where: { id: input.leadId }, select: { id: true, notes: true, invitedTenantId: true } });
  if (!lead) throw AppError.notFound("Lead niet gevonden.");
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true, name: true, type: true } });
  if (!tenant || tenant.type === "PLATFORM") throw AppError.notFound("Bedrijf niet gevonden.");

  const bijLead = (await alleLijsten()).flatMap(({ userId, lijst }) => lijst.filter((i) => i.leadId === lead.id && !i.alKlantTenantId).map((i) => ({ ...i, userId })));
  const eerste = eersteIntroductie(bijLead);
  if (!eerste) throw AppError.validation("Bij deze lead hoort geen introductie.");

  const bestaand = await leesKoppeling(tenant.id);
  if (bestaand) {
    if (bestaand.leadId === lead.id) return bestaand;
    throw AppError.conflict(`${tenant.name} is al gekoppeld aan een andere introductie.`);
  }
  if (lead.invitedTenantId && lead.invitedTenantId !== tenant.id && (await leesKoppeling(lead.invitedTenantId))) {
    throw AppError.conflict("Deze lead is al aan een ander bedrijf gekoppeld.");
  }

  const periode = vrijePeriode(nu);
  const koppeling: IntroductieKoppeling = {
    ...periode,
    tenantId: tenant.id,
    leadId: lead.id,
    introId: eerste.id,
    userId: eerste.userId,
    bedrijf: eerste.bedrijf,
    gekoppeldOp: nu.toISOString(),
    door: input.actorUserId,
  };
  if (!(await kvSetIfAbsent(koppelSleutel(tenant.id), koppeling))) {
    throw AppError.conflict(`${tenant.name} is intussen al gekoppeld. Ververs de pagina.`);
  }
  await prisma.salesLead.update({
    where: { id: lead.id },
    data: { status: "WON", invitedTenantId: tenant.id, nextActionAt: null, notes: voegNotitieToe(lead.notes, koppelNotitie(tenant.name, laatsteGratisDag(periode), nu)) },
  });
  await recordAudit({
    category: "SALES",
    action: "sales.introductie.gekoppeld",
    actorUserId: input.actorUserId,
    actorLabel: "user",
    summary: `Introductie ${eerste.bedrijf} gekoppeld aan ${tenant.name}: geen platformkosten van ${periode.gratisVanaf} tot en met ${laatsteGratisDag(periode)}`,
    targetType: "tenant",
    targetId: tenant.id,
    metadata: { leadId: lead.id, introId: eerste.id, gratisVanaf: periode.gratisVanaf, gratisTot: periode.gratisTot },
  });

  // betaalde het bedrijf vóór het koppelen al een factuur voor platformkosten, dan is de beloning nu al verschuldigd
  const betaald = await prisma.invoice.findFirst({
    where: { recipientTenantId: tenant.id, type: "PLATFORM_FEE", status: "PAID", totalCents: { gt: 0 } },
    orderBy: { paidAt: "asc" },
    select: { id: true, number: true, type: true, totalCents: true, recipientTenantId: true, paidAt: true },
  });
  if (betaald) await markeerBeloning(koppeling, betaald, betaald.paidAt ?? nu);
  return koppeling;
}

/** Bedrijven zoeken om te koppelen: op naam, of op het domein van een e-mailadres van een beheerder. */
export async function zoekBedrijven(q: string): Promise<{ id: string; naam: string; sinds: string }[]> {
  const term = q.replace(/\s+/g, " ").trim().slice(0, 80);
  if (term.length < 2) return [];
  const domein = term.includes("@") ? zakelijkDomein(term) : /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(term) ? zakelijkDomein(`x@${term}`) : null;
  const rijen = await prisma.tenant.findMany({
    where: {
      type: { not: "PLATFORM" },
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        ...(domein ? [{ memberships: { some: { user: { email: { endsWith: `@${domein}`, mode: "insensitive" as const } } } } }] : []),
      ],
    },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return rijen.map((t) => ({ id: t.id, naam: t.name, sinds: t.createdAt.toISOString() }));
}
