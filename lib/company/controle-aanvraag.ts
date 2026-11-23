import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { alertOwnerLater } from "@/lib/ops/alert";
import { listCounterOffers } from "@/lib/offers/store";
import { getOrgProfileExtra, saveOrgProfileExtra, type OrgProfileExtra } from "@/lib/profile/store";
import { kvListEntries } from "@/lib/storage/kv";
import { isTenantVerified, notifyPendingReactions } from "@/lib/company/verified";
import { koppelBedrijfsgegevens, employerKvkSchema } from "@/lib/onboarding/employer";
import { landSoort, normaliseerLand } from "@/lib/onboarding/buitenland";
import {
  MAX_BEWAARDE_KEUZES,
  controleerControleInvoer,
  maakAanvraag,
  maakControleInvoer,
  type ControleAanvraag,
} from "@/lib/company/gecontroleerd";

// ---------------------------------------------------------------------------
// "Nog een paar laatste checks" (23 nov 2026, eigenaar: de controle komt pas als een bedrijf iemand wil inplannen, zoals bij
// YoungOnes). Een nieuw bedrijf plaatst en ziet reacties zonder controle; kiest het een freelancer, dan vraagt de klus-pagina
// hier om de bedrijfsgegevens. Dit bestand:
//   1. koppelt het bedrijf (KVK in Nederland, btw- of registratienummer erbuiten; lib/onboarding/employer.ts) en laat de
//      bestaande poort (lib/company/verified.ts) beslissen: klopt alles en hoort de aanmelder erbij, dan is het bedrijf meteen
//      gecontroleerd; anders wacht het op Beheer;
//   2. bewaart wat het bedrijf invulde en welke reacties het koos (OrgProfileExtra.controle): de reacties blijven openstaan;
//   3. meldt het aan Beheer (de melding "Bedrijf wil iemand inplannen", en de lijst op /admin/kvk-controle);
//   4. na goedkeuring krijgt het bedrijf bericht (notifyCompanyChecked in lib/company/verified.ts).
// Er verandert niets aan wat een niet gecontroleerd bedrijf op de server mag: inplannen blijft dicht (eisBedrijfGecontroleerd).
// ---------------------------------------------------------------------------

/** Een bedrijf dat wacht op controle omdat het iemand wil inplannen (Admin → KVK-controle). */
export interface BedrijfAanvraagRij {
  id: string;
  /** de naam van de organisatie */
  naam: string;
  aanvraag: ControleAanvraag;
  href: string;
}

/**
 * De bedrijven die "Nog een paar laatste checks" invulden en nog niet zijn gecontroleerd, oudste eerst. Zonder schemawijziging:
 * de aanvraag staat in het organisatieprofiel (profile-org:<tenantId>), dus we lopen die rijen langs en houden de aanvragen over.
 */
export async function openBedrijfAanvragen(limiet = 200): Promise<BedrijfAanvraagRij[]> {
  const voorvoegsel = "profile-org:";
  const rijen = await kvListEntries<OrgProfileExtra>(voorvoegsel, 1000).catch(() => []);
  const kandidaten = rijen.flatMap((r) => (r.value?.controle ? [{ id: r.key.slice(voorvoegsel.length), aanvraag: r.value.controle }] : []));
  if (kandidaten.length === 0) return [];
  const tenants = await prisma.tenant.findMany({ where: { id: { in: kandidaten.map((k) => k.id) } }, select: { id: true, name: true } });
  const naamPerId = new Map(tenants.map((t) => [t.id, t.name]));
  const uit: BedrijfAanvraagRij[] = [];
  for (const k of kandidaten) {
    const naam = naamPerId.get(k.id);
    if (naam === undefined) continue; // de organisatie bestaat niet meer
    if (await isTenantVerified(k.id)) continue;
    uit.push({ id: k.id, naam, aanvraag: k.aanvraag, href: `/admin/bedrijven/${k.id}` });
  }
  return uit.sort((a, b) => a.aanvraag.op.localeCompare(b.aanvraag.op)).slice(0, limiet);
}

export interface ControleUitkomst {
  /** "gecontroleerd": het kan meteen verder; "aangevraagd": het wacht op Beheer en krijgt bericht */
  status: "gecontroleerd" | "aangevraagd";
  /** hoeveel gekozen reacties er nu bewaard zijn */
  keuzes: number;
}

/** Alleen reacties die echt bij een klus van dit bedrijf horen en nog openstaan; de rest laten we weg. */
async function geldigeKeuzes(tenantId: string, gevraagd: readonly { offerId: string; shiftId: string }[]): Promise<{ offerId: string; shiftId: string }[]> {
  const gewenst = gevraagd.filter((k) => k.offerId && k.shiftId).slice(0, MAX_BEWAARDE_KEUZES);
  if (gewenst.length === 0) return [];
  const klussen = await prisma.shift.findMany({
    where: { id: { in: [...new Set(gewenst.map((k) => k.shiftId))] }, branch: { tenantId } },
    select: { id: true },
  });
  const eigen = new Set(klussen.map((s) => s.id));
  const reacties = await listCounterOffers(500);
  return gewenst.filter((k) => eigen.has(k.shiftId) && reacties.some((o) => o.id === k.offerId && o.shiftId === k.shiftId && o.status === "pending"));
}

export async function vraagControleAan(i: {
  userId: string;
  tenantId: string;
  /** het formulier of verzoek, ruw (lib/company/gecontroleerd.ts: maakControleInvoer) */
  raw: Record<string, unknown>;
  /** de reacties die het bedrijf koos (id van de reactie en van de klus) */
  keuzes: readonly { offerId: string; shiftId: string }[];
  nu?: Date;
}): Promise<ControleUitkomst> {
  const nu = i.nu ?? new Date();
  const invoer = maakControleInvoer(i.raw);
  const c = controleerControleInvoer(invoer);
  if (!c.ok) throw AppError.validation("Niet alle gegevens zijn goed ingevuld.", { fouten: c.fouten });

  const soort = landSoort(invoer.land);
  const land = normaliseerLand(invoer.land);
  const uitslag = await koppelBedrijfsgegevens(
    i.userId,
    i.tenantId,
    employerKvkSchema.parse({ land, kvkNumber: invoer.kvkNumber, btwNummer: invoer.btwNummer, registratieNummer: invoer.registratieNummer }),
  );
  // een nummer dat niet bestaat of al van een ander is, bewaren we niet: het bedrijf corrigeert het in het venster
  if (!uitslag.kvkValid && !uitslag.zelfControle) {
    throw AppError.validation(uitslag.reasons[0] ?? "We konden je bedrijfsgegevens niet bevestigen. Controleer ze en probeer het opnieuw.", {
      fouten: { [soort === "NL" ? "kvkNumber" : soort === "EU" ? "btwNummer" : "registratieNummer"]: "ongeldig" },
    });
  }

  const gecontroleerd = await isTenantVerified(i.tenantId);
  const keuzes = await geldigeKeuzes(i.tenantId, i.keuzes);
  const extra = await getOrgProfileExtra(i.tenantId);
  const gemaakt = maakAanvraag(invoer, keuzes, nu, extra.controle);
  // al gecontroleerd: het bedrijf leest het in het venster zelf, dus geen mail of melding meer achteraf
  const aanvraag: ControleAanvraag = gecontroleerd ? { ...gemaakt, gemeldOp: nu.toISOString() } : gemaakt;
  await saveOrgProfileExtra(i.tenantId, { controle: aanvraag });

  await recordAudit({
    category: "COMPANY",
    action: "employer.controle.aangevraagd",
    actorUserId: i.userId,
    actorLabel: "user",
    summary: `Bedrijfsgegevens ingevuld bij het inplannen: ${invoer.bedrijfsnaam} (${gecontroleerd ? "meteen gecontroleerd" : "wacht op Beheer"})`,
    targetType: "tenant",
    targetId: i.tenantId,
    metadata: { gecontroleerd, keuzes: aanvraag.keuzes.length, land },
  });

  if (gecontroleerd) {
    // wie al reageerde, hoort dat het bedrijf nu kan inplannen (de werkerskant, lib/company/verified.ts)
    void notifyPendingReactions(i.tenantId);
  } else {
    alertOwnerLater({
      key: `bedrijf-inplannen:${i.tenantId}`,
      title: `Bedrijf wil iemand inplannen: ${invoer.bedrijfsnaam}`,
      detail: `${aanvraag.keuzes.length} gekozen ${aanvraag.keuzes.length === 1 ? "reactie" : "reacties"}. ${
        aanvraag.kvkNumber ? `KVK ${aanvraag.kvkNumber}` : aanvraag.btwNummer ? `Btw-nummer ${aanvraag.btwNummer}` : `Registratienummer ${aanvraag.registratieNummer ?? "onbekend"}`
      }. Controleer het bedrijf (Admin → KVK-controle) en keur het goed: het bedrijf krijgt dan bericht en kan inplannen.`,
      severity: "warning",
      url: "/admin/kvk-controle",
    });
  }
  return { status: gecontroleerd ? "gecontroleerd" : "aangevraagd", keuzes: aanvraag.keuzes.length };
}
