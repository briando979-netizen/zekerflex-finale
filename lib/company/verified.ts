import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getBuitenlandBewijs } from "@/lib/company/buitenland";
import { bedrijfMagDoen, NOG_NIET_GECONTROLEERD_TEKST } from "@/lib/company/gecontroleerd";

// ---------------------------------------------------------------------------
// Is this company (tenant) verified enough to actually staff people?
//
// Placing klussen is free for every company (23 nov 2026, owner: like YoungOnes): a klus is live at once and
// freelancers can respond. Until the company is verified nobody gets scheduled on it (no assignment, no timesheet,
// no invoice, no agreement to sign): that check comes when the company wants to pick someone ("Nog een paar laatste
// checks", lib/company/gecontroleerd.ts). The rule of what a company may do lives there; this file enforces it on the
// server. Verified means any of:
//   - the KVK registration checks out as active in the Handelsregister AND the
//     person who registered belongs to it: an own e-mail domain that fits the
//     registered name (lib/company/eigendom.ts). An active KVK number alone only
//     proves the company exists; anyone can type it (4 Nov 2026),
//   - a platform admin approved the company by hand (Admin → Bedrijven),
//   - the company already had people scheduled before this rule existed, so
//     existing customers are never suddenly blocked.
// ---------------------------------------------------------------------------

export type TenantVerifiedVia = "platform" | "kvk" | "admin" | "history";

const approvalKey = (tenantId: string) => `tenant-approved:${tenantId}`;
const bewijsKey = (tenantId: string) => `tenant-kvk-bewijs:${tenantId}`;

/** Proof that the registrant belongs to the KVK company (set at onboarding, lib/onboarding/employer.ts). */
export interface KvkBewijs {
  via: "domein";
  domein: string;
  at: string;
}

export async function setKvkBewijs(tenantId: string, bewijs: KvkBewijs): Promise<void> {
  await kvSet(bewijsKey(tenantId), bewijs);
}

export interface VerificatieFeiten {
  platform: boolean;
  /** de KVK-inschrijving is actief en niet failliet */
  kvkActief: boolean;
  /** aangemelde persoon hoort aantoonbaar bij het bedrijf (KvkBewijs) */
  kvkBewijs: boolean;
  /** een beheerder keurde het bedrijf met de hand goed */
  goedgekeurd: boolean;
  /** er stonden al mensen ingepland */
  ingepland: boolean;
  /** bedrijf buiten Nederland met een btw- of registratienummer: wacht op een beheerder */
  buitenlands?: boolean;
}

/** De regel zelf, puur: één bron voor de poort en voor Admin → Onboarding (die dit voor vele bedrijven tegelijk uitrekent). */
export function verificatieUitFeiten(f: VerificatieFeiten): { verified: boolean; via: TenantVerifiedVia | null; inControle?: boolean; buitenlands?: boolean } {
  if (f.platform) return { verified: true, via: "platform" };
  if (f.kvkActief && f.kvkBewijs) return { verified: true, via: "kvk" };
  if (f.goedgekeurd) return { verified: true, via: "admin" };
  if (f.ingepland) return { verified: true, via: "history" };
  if (f.buitenlands) return { verified: false, via: null, inControle: true, buitenlands: true };
  return { verified: false, via: null, inControle: f.kvkActief };
}

export const TENANT_APPROVAL_PREFIX = "tenant-approved:";
export const TENANT_BEWIJS_PREFIX = "tenant-kvk-bewijs:";

/** inControle: the KVK is valid and active but nobody proved they belong to it, so ZekerFlex checks by hand. */
export async function tenantVerification(tenantId: string): Promise<{ verified: boolean; via: TenantVerifiedVia | null; inControle?: boolean; buitenlands?: boolean }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { type: true, country: true, vatNumber: true, companyRegistration: { select: { isActive: true, insolvent: true } } },
  });
  if (!tenant) return { verified: false, via: null };
  const platform = tenant.type === "PLATFORM";
  const kvkActief = Boolean(tenant.companyRegistration?.isActive && !tenant.companyRegistration.insolvent);
  if (platform) return verificatieUitFeiten({ platform, kvkActief, kvkBewijs: false, goedgekeurd: false, ingepland: false });
  const kvkBewijs = kvkActief && Boolean(await kvGet<KvkBewijs>(bewijsKey(tenantId)));
  if (kvkBewijs) return verificatieUitFeiten({ platform, kvkActief, kvkBewijs, goedgekeurd: false, ingepland: false });
  const goedgekeurd = Boolean((await kvGet<{ approved: boolean }>(approvalKey(tenantId)))?.approved);
  if (goedgekeurd) return verificatieUitFeiten({ platform, kvkActief, kvkBewijs, goedgekeurd, ingepland: false });
  const ingepland = (await prisma.shiftAssignment.count({ where: { shift: { branch: { tenantId } } }, take: 1 })) > 0;
  // Een bedrijf buiten Nederland heeft geen KVK: het wacht op een beheerder (lib/company/buitenland.ts).
  const buitenlands = !ingepland && (tenant.country ?? "NL") !== "NL" && Boolean(tenant.vatNumber || (await getBuitenlandBewijs(tenantId)));
  return verificatieUitFeiten({ platform, kvkActief, kvkBewijs, goedgekeurd, ingepland, buitenlands });
}

export async function isTenantVerified(tenantId: string): Promise<boolean> {
  return (await tenantVerification(tenantId)).verified;
}

export async function setTenantApproval(tenantId: string, approved: boolean, by: string): Promise<void> {
  await kvSet(approvalKey(tenantId), { approved, at: new Date().toISOString(), by });
}

/**
 * Server-side poort voor alles wat iemand echt inplant, laat uitbetalen of een overeenkomst laat tekenen (de planner,
 * de spoedoproep, een reactie accepteren). Een bedrijf dat nog niet is gecontroleerd krijgt een 423 met een eigen code
 * (geen 403: CrowdSec); plaatsen en reacties zien blijven vrij (lib/company/gecontroleerd.ts).
 */
export async function eisBedrijfGecontroleerd(tenantId: string): Promise<void> {
  if (!bedrijfMagDoen(await isTenantVerified(tenantId), "inplannen")) {
    throw AppError.bedrijfNogNietGecontroleerd(NOG_NIET_GECONTROLEERD_TEKST);
  }
}

/**
 * The company just became verified: tell its admins (push and mail) that they can pick their freelancers now. Only when
 * the company asked for the check ("Nog een paar laatste checks"), and only once per request. Best-effort: never throws.
 */
export async function notifyCompanyChecked(tenantId: string): Promise<boolean> {
  try {
    const { getOrgProfileExtra, saveOrgProfileExtra } = await import("@/lib/profile/store");
    const extra = await getOrgProfileExtra(tenantId);
    if (!extra.controle || extra.controle.gemeldOp) return false;
    // eerst markeren: een tweede goedkeuring vlak erna (dubbel klikken) stuurt niets opnieuw
    await saveOrgProfileExtra(tenantId, { controle: { ...extra.controle, gemeldOp: new Date().toISOString() } });
    const admins = await prisma.membership.findMany({
      where: { tenantId, role: "HQ_ADMIN", user: { disabledAt: null } },
      select: { userId: true, user: { select: { email: true, fullName: true } } },
      take: 10,
    });
    if (admins.length === 0) return false;
    const { sendUserPush } = await import("@/lib/notifications/push");
    const { sendMail, mailShell, mailButton, escapeHtml } = await import("@/lib/mail");
    const { env } = await import("@/lib/env");
    const link = `${env.APP_BASE_URL.replace(/\/+$/, "")}/werkgever/diensten`;
    const onderwerp = "Je bedrijf is gecontroleerd: je kunt nu inplannen";
    await sendUserPush(admins.map((a) => a.userId), {
      title: onderwerp,
      body: "Je bewaarde keuzes staan klaar. Plan je freelancers nu in.",
      data: { type: "SHIFT", url: "/werkgever/diensten", tag: `bedrijf-gecontroleerd-${tenantId}` },
      ttlSeconds: 86_400,
    }).catch(() => undefined);
    for (const a of admins) {
      const voornaam = a.user.fullName.split(" ")[0] || a.user.fullName;
      await sendMail({
        to: a.user.email,
        subject: onderwerp,
        kind: "bedrijf-gecontroleerd",
        text: `Hoi ${voornaam},\n\nWe hebben je bedrijfsgegevens nagekeken. Je kunt nu freelancers inplannen: de keuzes die je maakte zijn bewaard en je reacties staan nog open.\n\nBekijk je klussen: ${link}`,
        html: mailShell(
          onderwerp,
          `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${escapeHtml(voornaam)}, we hebben je bedrijfsgegevens nagekeken. Je kunt nu freelancers inplannen.</p>
           <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3C4A42">De keuzes die je maakte zijn bewaard en je reacties staan nog open.</p>
           <p style="margin:0">${mailButton(link, "Bekijk je klussen")}</p>`,
        ),
      }).catch(() => undefined);
    }
    return true;
  } catch (err) {
    logger.warn("notify company checked failed", { tenantId, error: (err as Error).message });
    return false;
  }
}

/**
 * The company just became verified: tell every freelancer whose reaction was waiting (lib/matching/reactie.ts: a VIEWED match plus
 * a reaction at the company) that the company can now schedule them. Best-effort push; returns how many people were told.
 */
export async function notifyPendingReactions(tenantId: string): Promise<number> {
  // het bedrijf zelf eerst: wie "Nog een paar laatste checks" invulde, krijgt bericht dat hij nu kan inplannen
  await notifyCompanyChecked(tenantId);
  try {
    const matches = await prisma.shiftMatch.findMany({
      where: {
        status: "VIEWED",
        shift: { branch: { tenantId }, startsAt: { gt: new Date() }, status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] } },
      },
      select: { shift: { select: { id: true, title: true, branch: { select: { tenant: { select: { name: true } } } } } }, freelancer: { select: { userId: true } } },
      take: 200,
    });
    if (matches.length === 0) return 0;
    const { sendLocalizedPush } = await import("@/lib/notifications/localized-push");
    let told = 0;
    for (const m of matches) {
      // in de app-taal van de werker (WORKER_PUSH)
      told += (await sendLocalizedPush([m.freelancer.userId], (t) => ({
        title: t.verifiedTitle,
        body: t.verifiedBody(m.shift.branch.tenant.name, m.shift.title),
        data: { type: "shift", url: `/dashboard/klussen/${m.shift.id}`, tag: `verified-${m.shift.id}` },
        ttlSeconds: 6 * 60 * 60,
      })).catch(() => 0)) > 0 ? 1 : 0;
    }
    return told;
  } catch (err) {
    logger.warn("notify pending reactions failed", { tenantId, error: (err as Error).message });
    return 0;
  }
}
