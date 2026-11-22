import { CompanyStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { runAfter } from "@/lib/run-after";
import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { notifyPendingReactions, setTenantApproval } from "@/lib/company/verified";
import { ZONDER_CONTROLE_WHERE } from "@/lib/kvk/inhalen";
import type { KvkTegoed } from "@/lib/kvk/tegoed";
import {
  kvkOpgegevenVan,
  kvkWachtVan,
  leesKvkTegoed,
  opgegevenKvkControles,
  wachtendeKvkControles,
  wisKvkOpgegeven,
  wisKvkWacht,
  zetKvkWachtNu,
} from "@/lib/kvk/tegoed-opslag";
import {
  KVK_HANDMATIG_PREFIX,
  auditGoedkeuring,
  auditTerugdraaien,
  beslisKeuring,
  controleerGoedkeuring,
  controleerTerugdraaien,
  draaiTerug,
  isActief,
  maakHandmatig,
  standVanWacht,
  type Beslissing,
  type KeuringContext,
  type KvkBeheerder,
  type KvkHandmatig,
  type KvkSoort,
  type WachtStand,
} from "@/lib/kvk/handmatig";

// ---------------------------------------------------------------------------
// KVK-controle met de hand: het schrijven en lezen (de regels zelf staan puur in lib/kvk/handmatig.ts). Sleutel in de KV:
//   kvk-handmatig:werker:<userId>    → KvkHandmatig   (per gebruiker: in ERASABLE_KV_PREFIXES, en afgeschermd in de export)
//   kvk-handmatig:bedrijf:<tenantId> → KvkHandmatig
// De geldigheid komt op waar met de bestaande velden, zonder KVKBase of de open dataset aan te roepen en zonder schemawijziging:
//   werker:  kvkValid + kvkVerifiedAt op het profiel (en een inschrijving, source "HANDMATIG", als er nog geen was);
//   bedrijf: dezelfde inschrijving op de organisatie (dan telt de KVK-stap van de onboarding als gedaan) én de goedkeuring van
//            de poort (setTenantApproval, via "admin"). De regels van de poort zelf blijven zoals ze waren (lib/company/verified.ts).
// Een goedkeuring haalt de controle uit de wacht van de herkansing; terugdraaien zet hem er weer in.
// ---------------------------------------------------------------------------

/** De bron van een inschrijving die wij zelf maakten uit wat de beheerder op kvk.nl zag. */
export const HANDMATIG_BRON = "HANDMATIG";

const sleutel = (soort: KvkSoort, id: string) => `${KVK_HANDMATIG_PREFIX}${soort}:${id}`;
const isKvk = (v: string | null | undefined): v is string => /^\d{8}$/.test(v ?? "");

/** Wat we van de ingelogde beheerder nodig hebben (een Principal past hierop). */
export interface KvkPrincipal {
  userId: string;
  email: string;
  fullName: string;
  grants: readonly { role: string }[];
}

const beheerderVan = (p: KvkPrincipal): KvkBeheerder => ({ id: p.userId, naam: p.fullName.trim() || p.email });

function naarFout(b: Extract<Beslissing, { ok: false }>): AppError {
  if (b.status === 423) return AppError.alleenBeheerder(b.bericht);
  if (b.status === 409) return AppError.conflict(b.bericht);
  return AppError.validation(b.bericht);
}

function eis(c: KeuringContext): void {
  const b = beslisKeuring(c);
  if (!b.ok) throw naarFout(b);
}

export async function leesKvkHandmatig(soort: KvkSoort, id: string): Promise<KvkHandmatig | null> {
  return kvGet<KvkHandmatig>(sleutel(soort, id)).catch(() => null);
}

/** Alle goedkeuringen met de hand (ook teruggedraaide), soort en id uit de sleutel. */
export async function alleKvkHandmatig(limiet = 500): Promise<{ soort: KvkSoort; id: string; record: KvkHandmatig }[]> {
  const rijen = await kvListEntries<KvkHandmatig>(KVK_HANDMATIG_PREFIX, limiet).catch(() => []);
  return rijen.flatMap((r) => {
    const rest = r.key.slice(KVK_HANDMATIG_PREFIX.length);
    const i = rest.indexOf(":");
    const soort = rest.slice(0, i);
    const id = rest.slice(i + 1);
    return (soort === "werker" || soort === "bedrijf") && id && r.value?.kvkNumber ? [{ soort: soort as KvkSoort, id, record: r.value }] : [];
  });
}

async function werkerProfiel(userId: string) {
  const fp = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true, kvkNumber: true, kvkValid: true, kvkVerifiedAt: true, companyRegistration: { select: { id: true, source: true } } },
  });
  if (!fp) throw AppError.notFound("Werkersprofiel niet gevonden.");
  return fp;
}

async function bedrijfOrganisatie(tenantId: string) {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, kvkNumber: true, companyRegistrationId: true, companyRegistration: { select: { id: true, source: true } } },
  });
  if (!t) throw AppError.notFound("Organisatie niet gevonden.");
  return t;
}

/** Het nummer dat een bedrijf opgaf: op de organisatie, anders in de wacht of bij de opgegeven nummers (de controle kon toen niet). */
async function bekendBedrijfsnummer(t: { id: string; kvkNumber: string | null }): Promise<string | null> {
  if (isKvk(t.kvkNumber)) return t.kvkNumber;
  const inWacht = (await kvkWachtVan("bedrijf", t.id))?.kvkNumber;
  if (isKvk(inWacht)) return inWacht;
  const opgegeven = (await kvkOpgegevenVan("bedrijf", t.id))?.kvkNumber;
  return isKvk(opgegeven) ? opgegeven : null;
}

/**
 * De inschrijving bij dit nummer, of een nieuwe uit wat de beheerder zag. Een bestaande (KVKBase of open dataset) blijft zoals
 * ze is: de geldigheid zit op het profiel of in de goedkeuring, niet in deze rij.
 */
async function zorgVoorInschrijving(tx: Prisma.TransactionClient, kvkNumber: string, naam: string): Promise<string> {
  const rij = await tx.companyRegistration.upsert({
    where: { kvkNumber },
    create: { kvkNumber, source: HANDMATIG_BRON, legalName: naam, status: CompanyStatus.ACTIVE, isActive: true, insolvent: false, rawProfile: { handmatig: true } },
    update: {},
    select: { id: true },
  });
  return rij.id;
}

export interface KvkKeuringInvoer {
  principal: KvkPrincipal;
  soort: KvkSoort;
  /** userId bij een werker, tenantId bij een bedrijf */
  id: string;
  kvkNumber: unknown;
  naam: unknown;
  notitie: unknown;
  bevestigd: unknown;
  nu?: Date;
}

/** Een KVK-controle met de hand goedkeuren. Gooit een Nederlandse AppError als het niet mag of de invoer niet klopt. */
export async function keurKvkHandmatigGoed(i: KvkKeuringInvoer): Promise<KvkHandmatig> {
  const nu = i.nu ?? new Date();
  const c = controleerGoedkeuring(i);
  if (!c.ok) throw AppError.validation(c.fout, { veld: c.veld });
  const { kvkNumber, naam, notitie } = c.waarde;
  const rollen = i.principal.grants.map((g) => g.role);
  const huidig = await leesKvkHandmatig(i.soort, i.id);

  let profielId = "";
  if (i.soort === "werker") {
    const fp = await werkerProfiel(i.id);
    eis({ rollen, soort: "werker", actie: "goedkeuren", bekendNummer: isKvk(fp.kvkNumber) ? fp.kvkNumber : null, invoerNummer: kvkNumber, alGeldig: fp.kvkValid, handmatig: huidig });
    profielId = fp.id;
  } else {
    const t = await bedrijfOrganisatie(i.id);
    eis({ rollen, soort: "bedrijf", actie: "goedkeuren", bekendNummer: await bekendBedrijfsnummer(t), invoerNummer: kvkNumber, alGeldig: Boolean(t.companyRegistrationId), handmatig: huidig });
  }

  // eerst vastleggen wie wat goedkeurde; lukt het schrijven daarna niet, dan gaat dit terug
  const handmatig = maakHandmatig({ kvkNumber, naam, notitie, door: beheerderVan(i.principal), nu });
  await kvSet(sleutel(i.soort, i.id), handmatig);
  try {
    await prisma.$transaction(async (tx) => {
      const regId = await zorgVoorInschrijving(tx, kvkNumber, naam);
      if (i.soort === "werker") {
        // kvkVerifiedAt = het tijdstip van de goedkeuring: zo ziet het terugdraaien of de controle intussen opnieuw is gedaan
        await tx.freelancerProfile.update({ where: { id: profielId }, data: { kvkValid: true, kvkVerifiedAt: nu, companyRegistrationId: regId } });
      } else {
        // zoals bij de aanmelding (lib/onboarding/employer.ts): het nummer, de inschrijving en de naam uit het Handelsregister
        await tx.tenant.update({ where: { id: i.id }, data: { kvkNumber, companyRegistrationId: regId, name: naam } });
      }
    });
  } catch (err) {
    await (huidig ? kvSet(sleutel(i.soort, i.id), huidig) : kvDelete(sleutel(i.soort, i.id))).catch(() => undefined);
    if ((err as { code?: string }).code === "P2002") {
      throw AppError.conflict("Dit KVK-nummer hoort al bij een ander ZekerFlex-account. Zoek eerst uit of het hetzelfde bedrijf is.");
    }
    throw err;
  }
  if (i.soort === "bedrijf") await setTenantApproval(i.id, true, i.principal.email);
  // de automatische controle hoeft niet meer
  await wisKvkWacht(i.soort, i.id);
  await wisKvkOpgegeven(i.soort, i.id);

  const a = auditGoedkeuring({ soort: i.soort, kvkNumber, notitie });
  await recordAudit({
    category: "COMPANY",
    action: a.action,
    severity: a.severity,
    summary: a.summary,
    actorUserId: i.principal.userId,
    actorLabel: "user",
    targetType: i.soort === "werker" ? "user" : "tenant",
    targetId: i.id,
    metadata: a.metadata,
  });
  // een bedrijf dat net geverifieerd is: wie op zijn testklus reageerde hoort dat hij nu kan bevestigen (lib/company/verified.ts)
  if (i.soort === "bedrijf") runAfter(() => notifyPendingReactions(i.id));
  return handmatig;
}

export interface KvkTerugdraaiInvoer {
  principal: KvkPrincipal;
  soort: KvkSoort;
  id: string;
  reden: unknown;
  nu?: Date;
}

/**
 * Een goedkeuring met de hand terugdraaien: de controle staat weer open (en in de wacht van de herkansing). Alleen wat deze
 * goedkeuring zette gaat terug: is de controle van een werker intussen opnieuw gedaan, dan blijft die staan en zegt het antwoord dat.
 */
export async function draaiKvkHandmatigTerug(i: KvkTerugdraaiInvoer): Promise<{ handmatig: KvkHandmatig; geldigheidBlijft: boolean }> {
  const nu = i.nu ?? new Date();
  const c = controleerTerugdraaien(i.reden);
  if (!c.ok) throw AppError.validation(c.fout, { veld: c.veld });
  const huidig = await leesKvkHandmatig(i.soort, i.id);
  const b = beslisKeuring({ rollen: i.principal.grants.map((g) => g.role), soort: i.soort, actie: "terugdraaien", bekendNummer: null, alGeldig: true, handmatig: huidig });
  if (!b.ok) throw naarFout(b);
  if (!isActief(huidig)) throw AppError.conflict("Hier is niets met de hand goedgekeurd, dus er valt niets terug te draaien.");

  let geldigheidBlijft = false;
  if (i.soort === "werker") {
    const fp = await werkerProfiel(i.id);
    if (fp.kvkValid && fp.kvkVerifiedAt?.toISOString() !== huidig.op) {
      geldigheidBlijft = true;
    } else if (fp.kvkValid) {
      const eigen = fp.companyRegistration?.source === HANDMATIG_BRON ? fp.companyRegistration : null;
      await prisma.$transaction(async (tx) => {
        await tx.freelancerProfile.update({ where: { id: fp.id }, data: { kvkValid: false, kvkVerifiedAt: null, ...(eigen ? { companyRegistrationId: null } : {}) } });
        if (eigen) await tx.companyRegistration.deleteMany({ where: { id: eigen.id, source: HANDMATIG_BRON, freelancerProfile: { is: null }, tenant: { is: null } } });
      });
    }
  } else {
    const t = await bedrijfOrganisatie(i.id);
    await setTenantApproval(i.id, false, i.principal.email);
    const eigen = t.companyRegistration?.source === HANDMATIG_BRON ? t.companyRegistration : null;
    if (eigen) {
      await prisma.$transaction(async (tx) => {
        await tx.tenant.update({ where: { id: i.id }, data: { companyRegistrationId: null } });
        await tx.companyRegistration.deleteMany({ where: { id: eigen.id, source: HANDMATIG_BRON, freelancerProfile: { is: null }, tenant: { is: null } } });
      });
    }
    // weer in de wacht van de herkansing: zodra er tegoed is, controleert die het alsnog
    await zetKvkWachtNu("bedrijf", i.id, huidig.kvkNumber, nu);
  }

  const nieuw = draaiTerug(huidig, { door: beheerderVan(i.principal), reden: c.waarde.reden, nu });
  await kvSet(sleutel(i.soort, i.id), nieuw);
  const a = auditTerugdraaien({ soort: i.soort, kvkNumber: huidig.kvkNumber, reden: c.waarde.reden, geldigheidBlijft });
  await recordAudit({
    category: "COMPANY",
    action: a.action,
    severity: a.severity,
    summary: a.summary,
    actorUserId: i.principal.userId,
    actorLabel: "user",
    targetType: i.soort === "werker" ? "user" : "tenant",
    targetId: i.id,
    metadata: a.metadata,
  });
  return { handmatig: nieuw, geldigheidBlijft };
}

// --- het overzicht voor Beheer → KVK-controle -------------------------------------------------------------------------

export interface KvkWachtRij {
  soort: KvkSoort;
  id: string;
  /** werker: de volledige naam; bedrijf: de naam van de organisatie (geen BSN, geen ID-gegevens) */
  naam: string;
  kvkNumber: string;
  /** sinds wanneer de controle wacht (ISO), of null als hij nog niet in de wacht staat */
  sinds: string | null;
  stand: WachtStand;
  label: string;
  tone: "warn" | "crit" | "neutral";
  href: string;
}

export interface KvkGedaanRij {
  soort: KvkSoort;
  id: string;
  naam: string;
  href: string;
  record: KvkHandmatig;
  /** de geldigheid staat er nog op (en het nummer is hetzelfde) */
  nogGeldig: boolean;
}

export interface KvkOverzicht {
  werkers: KvkWachtRij[];
  bedrijven: KvkWachtRij[];
  gedaan: KvkGedaanRij[];
  tegoed: KvkTegoed | null;
}

export async function kvkControleOverzicht(): Promise<KvkOverzicht> {
  const [profielen, wachtend, opgegeven, handmatig, tegoed] = await Promise.all([
    prisma.freelancerProfile.findMany({
      where: ZONDER_CONTROLE_WHERE,
      select: { userId: true, kvkNumber: true, user: { select: { fullName: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    wachtendeKvkControles(), // vangt storingen zelf af (lege lijst)
    opgegevenKvkControles(),
    alleKvkHandmatig(),
    leesKvkTegoed(),
  ]);

  const wachtWerker = new Map(wachtend.filter((w) => w.soort === "werker").map((w) => [w.id, w.wacht]));
  const opgegevenWerker = new Map(opgegeven.filter((o) => o.soort === "werker").map((o) => [o.id, o.opgegeven.kvkNumber]));
  const werkers: KvkWachtRij[] = profielen
    .filter((p) => isKvk(p.kvkNumber))
    .map((p) => {
      const s = standVanWacht({ inWacht: wachtWerker.has(p.userId), opgegevenNummer: opgegevenWerker.get(p.userId) ?? null, nummer: p.kvkNumber });
      return { soort: "werker" as const, id: p.userId, naam: p.user.fullName, kvkNumber: p.kvkNumber, sinds: wachtWerker.get(p.userId)?.sinds ?? null, ...s, href: `/admin/gebruikers/${p.userId}` };
    });

  const bedrijfIds = wachtend.filter((w) => w.soort === "bedrijf").map((w) => w.id);
  const gedaanWerkerIds = handmatig.filter((h) => h.soort === "werker").map((h) => h.id);
  const gedaanBedrijfIds = handmatig.filter((h) => h.soort === "bedrijf").map((h) => h.id);
  const [tenants, gedaanProfielen] = await Promise.all([
    prisma.tenant.findMany({
      where: { id: { in: [...new Set([...bedrijfIds, ...gedaanBedrijfIds])] } },
      select: { id: true, name: true, kvkNumber: true, companyRegistrationId: true },
    }),
    prisma.freelancerProfile.findMany({ where: { userId: { in: gedaanWerkerIds } }, select: { userId: true, kvkNumber: true, kvkValid: true, user: { select: { fullName: true } } } }),
  ]);
  const tenantPerId = new Map(tenants.map((t) => [t.id, t]));
  const profielPerId = new Map(gedaanProfielen.map((p) => [p.userId, p]));

  const bedrijven: KvkWachtRij[] = wachtend
    .filter((w) => w.soort === "bedrijf")
    .flatMap((w): KvkWachtRij[] => {
      const t = tenantPerId.get(w.id);
      // weg of al gekoppeld aan een inschrijving: er is niets meer te controleren
      if (!t || t.companyRegistrationId || !isKvk(w.wacht.kvkNumber)) return [];
      const s = standVanWacht({ inWacht: true, opgegevenNummer: null, nummer: w.wacht.kvkNumber });
      return [{ soort: "bedrijf" as const, id: t.id, naam: t.name, kvkNumber: w.wacht.kvkNumber, sinds: w.wacht.sinds, ...s, href: `/admin/bedrijven/${t.id}` }];
    });

  const gedaan: KvkGedaanRij[] = handmatig
    .flatMap((h): KvkGedaanRij[] => {
      if (h.soort === "werker") {
        const p = profielPerId.get(h.id);
        return p ? [{ soort: h.soort, id: h.id, naam: p.user.fullName, href: `/admin/gebruikers/${h.id}`, record: h.record, nogGeldig: p.kvkValid && p.kvkNumber === h.record.kvkNumber }] : [];
      }
      const t = tenantPerId.get(h.id);
      return t ? [{ soort: h.soort, id: h.id, naam: t.name, href: `/admin/bedrijven/${t.id}`, record: h.record, nogGeldig: Boolean(t.companyRegistrationId) && t.kvkNumber === h.record.kvkNumber }] : [];
    })
    .sort((a, b) => (b.record.teruggedraaid?.op ?? b.record.op).localeCompare(a.record.teruggedraaid?.op ?? a.record.op))
    .slice(0, 50);

  return { werkers, bedrijven, gedaan, tegoed };
}
