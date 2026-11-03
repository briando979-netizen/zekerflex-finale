import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { alertOwner } from "@/lib/ops/alert";
import { sendUserPush } from "@/lib/notifications/push";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { amsterdamClock, amsterdamDayKey } from "@/lib/time/amsterdam";
import { CATEGORY_LABEL, scoreFindings } from "@/lib/website-check/analyze";
import { FetchError, fetchPage } from "@/lib/website-check/fetch";
import { extractBusiness, extraScores, improvementPlan, proposalFindings } from "@/lib/website-check/proposal";
import { normalizeInput, runWebsiteCheck } from "@/lib/website-check/run";
import { leadWebsiteUrl } from "@/lib/sales/website-score-shared";
import { markLeadReplied } from "@/lib/sales/reply";
import { buildProposalSite } from "@/lib/sites/proposal-site";
import { freeSlug, getSite, markProposal, publishSite, setLiveBuild, transferSite } from "@/lib/sites/store";
import type { SiteDoc } from "@/lib/sites/types";
import { pricingFor } from "@/lib/telephony/lines";
import { WEBSITE_PLANS, type WebsitePlanKey } from "@/lib/website/manage";

// ---------------------------------------------------------------------------
// Websitevoorstel (sales): read a company's current website, score it on the
// free check plus trust, look and contact (lib/website-check/proposal.ts),
// build a new luxe site at zekerflex.com/site/<bedrijfsnaam> that puts all of
// it right (lib/sites/proposal-site.ts), and show it with an improvement plan,
// the packages and real prices on /websitevoorstel/<id>. The first companies
// (50 by default) that say yes get the launch discount.
// A person sends the link: nothing here mails or messages the company. Their
// "ja" only reaches our own team.
//   KV "wvoorstel:<id>"         — the proposal (the id is the secret in the link)
//   KV "wvoorstel-lead:<leadId>" / "wvoorstel-host:<host>" — the open proposal of a lead / website
//   KV "wvoorstel-plek:<nnn>"   — a launch place, claimed atomically (first create wins)
//   KV "wvoorstel-akkoord:<id>" — guards against a double "ja"
//   KV "wvoorstel-prijzen"      — prices and discount (Admin → Websitevoorstellen)
// ---------------------------------------------------------------------------

export type ProposalStatus = "concept" | "verstuurd" | "bekeken" | "akkoord" | "afgewezen" | "ingetrokken" | "overgezet";
export type DomainChoice = "houden" | "verhuizen" | "geen" | "weet-niet";

export interface ProposalScore {
  id: string;
  label: string;
  score: number;
}

/** Something the check found, and what the new site does about it. */
export interface ProposalPoint {
  id: string;
  categorie: string;
  status: "let-op" | "probleem";
  titel: string;
  detail: string;
  wij: string;
}

export interface ProposalAcceptance {
  at: string;
  naam: string;
  email: string;
  telefoon: string;
  pakket: WebsitePlanKey;
  domein: DomainChoice;
  opmerking: string;
  /** their number among the companies with the launch discount; null when the places were gone */
  plek: number | null;
  /** the prices as shown when they said yes */
  prijs: { websiteCents: number; kortingPct: number; teBetalenCents: number; maandCents: number };
}

export interface WebsiteProposal {
  id: string;
  leadId: string | null;
  bedrijf: string;
  plaats: string;
  /** the address that was checked, and the host of their official site */
  url: string;
  host: string;
  siteId: string;
  slug: string;
  check: { id: string; at: string; score: number; categorieen: ProposalScore[]; extra: ProposalScore[]; platform: string | null };
  punten: ProposalPoint[];
  /** what was already fine, to be fair about it */
  goed: string[];
  status: ProposalStatus;
  createdAt: string;
  createdBy: string;
  /** who made it, told when the company first opens it (absent on proposals from before 3 Nov 2026) */
  createdById?: string | undefined;
  expiresAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  views: number;
  akkoord: ProposalAcceptance | null;
  /** handed to the company's own account: the site is theirs in the builder now */
  overgezet?: { at: string; tenantId: string; bedrijf: string } | undefined;
  /** the new site measured with the same check (measureNewSite); absent when measuring failed */
  nieuw?: ProposalMeasurement | undefined;
  history: { at: string; what: string; by: string }[];
}

export interface ProposalMeasurement {
  at: string;
  checkId: string;
  score: number;
  categorieen: ProposalScore[];
  extra: ProposalScore[];
}

/**
 * On a proposal site these differ on purpose and are not counted in its score:
 * it stays out of search engines and gives Google no business data until the
 * site is the company's own.
 */
export const PROPOSAL_ONLY_FINDINGS = new Set(["noindex", "robots", "jsonld"]);

export interface ProposalPricing {
  /** one-time price of the new website, excluding VAT */
  websiteCents: number;
  /** launch discount on that price */
  kortingPct: number;
  /** how many companies get it */
  plekken: number;
  /** days a proposal stays valid */
  geldigDagen: number;
}

/** Starting values until the owner sets prices in Admin → Websitevoorstellen. */
export const DEFAULT_PROPOSAL_PRICING: ProposalPricing = { websiteCents: 49500, kortingPct: 50, plekken: 50, geldigDagen: 30 };

const key = (id: string) => `wvoorstel:${id}`;
const leadKey = (leadId: string) => `wvoorstel-lead:${leadId}`;
const hostKey = (host: string) => `wvoorstel-host:${host.toLowerCase().replace(/^www\./, "")}`;
const spotKey = (n: number) => `wvoorstel-plek:${String(n).padStart(3, "0")}`;
const PRICING_KEY = "wvoorstel-prijzen";

export const isProposalId = (id: string) => /^[a-f0-9]{24}$/.test(id);
const isReservedTestEmail = (email: string) => /\.(test|example|invalid|localhost)$/i.test(email.trim());
const OPEN: ProposalStatus[] = ["concept", "verstuurd", "bekeken", "akkoord"];

export function isExpired(p: Pick<WebsiteProposal, "expiresAt">, now = Date.now()): boolean {
  return !(Date.parse(p.expiresAt) > now);
}

// ---- prices and the launch places ------------------------------------------

export const pricingSchema = z.object({
  websiteCents: z.number().int().min(0).max(10_000_000),
  kortingPct: z.number().int().min(0).max(100),
  plekken: z.number().int().min(0).max(10_000),
  geldigDagen: z.number().int().min(1).max(365),
});

export async function getProposalPricing(): Promise<ProposalPricing> {
  const saved = await kvGet<Partial<ProposalPricing>>(PRICING_KEY).catch(() => null);
  return { ...DEFAULT_PROPOSAL_PRICING, ...(saved ?? {}) };
}

export async function saveProposalPricing(input: ProposalPricing, actorUserId: string): Promise<ProposalPricing> {
  const value = pricingSchema.parse(input);
  await kvSet(PRICING_KEY, value);
  await recordAudit({ category: "ADMIN", action: "website-proposal.pricing", summary: "Prijzen websitevoorstel aangepast", actorUserId, metadata: value });
  return value;
}

/** True when the owner has set prices, rather than the starting values. */
export async function pricingIsSet(): Promise<boolean> {
  return Boolean(await kvGet(PRICING_KEY).catch(() => null));
}

export async function launchPlaces(total: number): Promise<{ total: number; taken: number; left: number }> {
  const taken = (await kvListValues<string>("wvoorstel-plek:", 10_000).catch(() => [])).length;
  return { total, taken, left: Math.max(0, total - taken) };
}

async function claimPlace(proposalId: string, total: number): Promise<number | null> {
  for (let n = 1; n <= total; n++) {
    try {
      await prisma.keyValueStore.create({ data: { key: spotKey(n), value: proposalId } });
      return n;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  return null;
}

/** What the proposal page offers: the website, the monthly plans (real Stripe prices) and the extras. */
export async function proposalOffer() {
  const pricing = await getProposalPricing();
  const places = await launchPlaces(pricing.plekken);
  const telefonie = await pricingFor(false).catch(() => null);
  return {
    pricing,
    places,
    website: { cents: pricing.websiteCents, kortingCents: places.left > 0 ? Math.round((pricing.websiteCents * (100 - pricing.kortingPct)) / 100) : null },
    plannen: (Object.keys(WEBSITE_PLANS) as WebsitePlanKey[]).map((k) => ({ key: k, ...WEBSITE_PLANS[k] })),
    telefonieVanafCents: telefonie?.lineCents ?? null,
    feePerUurCents: env.PLATFORM_FEE_PER_HOUR_CENTS,
  };
}

// ---- making a proposal --------------------------------------------------------

export async function getWebsiteProposal(id: string): Promise<WebsiteProposal | null> {
  return isProposalId(id) ? kvGet<WebsiteProposal>(key(id)).catch(() => null) : null;
}

export async function listWebsiteProposals(limit = 300): Promise<WebsiteProposal[]> {
  const rows = await kvListValues<WebsiteProposal>("wvoorstel:", 5000).catch(() => []);
  return rows.filter((r) => r && typeof r.id === "string").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/** The site of a proposal that may still be edited in the builder (Admin): not withdrawn, not handed to the company. */
export async function editableProposalSite(id: string): Promise<SiteDoc> {
  const p = await getWebsiteProposal(id);
  if (!p) throw AppError.notFound("Dit voorstel bestaat niet.");
  if (p.status === "overgezet") throw AppError.validation("Deze website is nu van het bedrijf; aanpassen doen zij in hun eigen websitebouwer.");
  if (p.status === "ingetrokken") throw AppError.validation("Dit voorstel is ingetrokken.");
  const site = await getSite(p.siteId);
  if (!site) throw AppError.notFound("De website van dit voorstel bestaat niet meer.");
  return site;
}

/** The proposal a lead or website already has that is still going, if any. */
async function openProposal(k: string): Promise<WebsiteProposal | null> {
  const id = await kvGet<string>(k).catch(() => null);
  const p = id ? await getWebsiteProposal(id) : null;
  return p && OPEN.includes(p.status) && !isExpired(p) ? p : null;
}

const asValidation = (err: unknown) => (err instanceof FetchError ? AppError.validation(err.message) : err);

export async function createWebsiteProposal(input: { leadId?: string | undefined; url?: string | undefined }, by: { userId: string; name: string }): Promise<WebsiteProposal> {
  const lead = input.leadId
    ? await prisma.salesLead.findUnique({ where: { id: input.leadId }, select: { id: true, companyName: true, kvkNumber: true, city: true, sector: true, sourceUrl: true } })
    : null;
  if (input.leadId && !lead) throw AppError.notFound("Deze lead bestaat niet.");
  const raw = input.url?.trim() || leadWebsiteUrl(lead?.sourceUrl) || "";
  if (!raw) throw AppError.validation("Van deze lead is geen website bekend. Vul het adres van hun website in.");
  let url: string;
  try {
    url = normalizeInput(raw);
  } catch (err) {
    throw asValidation(err);
  }
  if (/(^|\.)zekerflex\.(com|nl)$/i.test(new URL(url).hostname)) throw AppError.validation("Dit is een website van ZekerFlex zelf.");
  const existing = (lead ? await openProposal(leadKey(lead.id)) : null) ?? (await openProposal(hostKey(new URL(url).hostname)));
  if (existing) throw AppError.conflict(`Er loopt al een voorstel voor ${existing.bedrijf}. Trek dat eerst in als je een nieuw wilt maken.`);

  let check: Awaited<ReturnType<typeof runWebsiteCheck>>;
  let html: string;
  let finalUrl: string;
  try {
    check = await runWebsiteCheck(url);
    const page = await fetchPage(check.finalUrl, { timeoutMs: 12_000 });
    html = page.body;
    finalUrl = page.finalUrl;
  } catch (err) {
    throw asValidation(err);
  }
  const facts = extractBusiness(html, finalUrl);
  const extra = proposalFindings(facts, check.metrics.images);
  const all = [...check.findings, ...extra];

  const id = randomBytes(12).toString("hex");
  const pricing = await getProposalPricing();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + pricing.geldigDagen * 86_400_000).toISOString();
  const site = await buildProposalSite({
    proposalId: id,
    facts,
    lead: { naam: lead?.companyName ?? null, plaats: lead?.city ?? null, kvk: lead?.kvkNumber ?? null, sector: lead?.sector ?? null },
    mark: { officieel: check.host, verloopt: expiresAt },
    by,
  });
  const labels: Record<string, string> = { ...CATEGORY_LABEL, ...Object.fromEntries(extraScores(extra).map((s) => [s.id, s.label])) };
  const proposal: WebsiteProposal = {
    id,
    leadId: lead?.id ?? null,
    bedrijf: site.bedrijf.naam,
    plaats: site.bedrijf.plaats,
    url,
    host: check.host,
    siteId: site.id,
    slug: site.slug,
    check: { id: check.id, at: check.at, score: check.score, categorieen: check.categories, extra: extraScores(extra), platform: check.platform },
    punten: improvementPlan(all).map(({ finding, wij }) => ({
      id: finding.id,
      categorie: labels[finding.category] ?? finding.category,
      status: finding.status === "probleem" ? "probleem" : "let-op",
      titel: finding.title,
      detail: finding.detail,
      wij,
    })),
    goed: all.filter((f) => f.status === "goed").map((f) => f.title),
    status: "concept",
    createdAt: now.toISOString(),
    createdBy: by.name,
    createdById: by.userId,
    expiresAt,
    sentAt: null,
    viewedAt: null,
    views: 0,
    akkoord: null,
    history: [{ at: now.toISOString(), what: "Voorstel gemaakt", by: by.name }],
  };
  await kvSet(key(id), proposal);
  if (lead) await kvSet(leadKey(lead.id), id);
  await kvSet(hostKey(check.host), id);
  await recordAudit({ category: "SALES", action: "website-proposal.created", actorUserId: by.userId, summary: `Websitevoorstel voor ${proposal.bedrijf} gemaakt (huidige site ${check.score}/100)`, targetType: "website-proposal", targetId: id });
  // the new site measured the same way, for an honest before and after
  return (await measureNewSite(id)) ?? proposal;
}

/**
 * Measure the proposal's new site with the same public website check as the
 * company's current one (fresh, not the hour-long cache), leaving out what a
 * proposal does differently on purpose (PROPOSAL_ONLY_FINDINGS). Null when the
 * site can't be measured right now; the proposal simply shows no "after" then.
 */
export async function measureNewSite(id: string): Promise<WebsiteProposal | null> {
  const p = await getWebsiteProposal(id);
  if (!p || p.status === "ingetrokken" || p.status === "overgezet") return null;
  try {
    const url = `${env.APP_BASE_URL.replace(/\/+$/, "")}/site/${p.slug}?meting=${Date.now().toString(36)}`;
    const r = await runWebsiteCheck(url);
    const { score, categories } = scoreFindings(r.findings.filter((f) => !PROPOSAL_ONLY_FINDINGS.has(f.id)));
    const page = await fetchPage(r.finalUrl, { timeoutMs: 12_000 });
    const extra = extraScores(proposalFindings(extractBusiness(page.body, page.finalUrl), r.metrics.images));
    const nieuw: ProposalMeasurement = { at: r.at, checkId: r.id, score, categorieen: categories, extra };
    // the proposal may have changed meanwhile: write only the measurement onto the latest version
    const latest = (await getWebsiteProposal(id)) ?? p;
    const next: WebsiteProposal = { ...latest, nieuw };
    await kvSet(key(id), next);
    return next;
  } catch (err) {
    logger.info("proposal site not measured", { id, reason: String(err) });
    return null;
  }
}

// ---- what happens to it afterwards ------------------------------------------

async function save(p: WebsiteProposal, what: string, by: string, patch: Partial<WebsiteProposal>): Promise<WebsiteProposal> {
  const next: WebsiteProposal = { ...p, ...patch, history: [{ at: new Date().toISOString(), what, by }, ...p.history].slice(0, 50) };
  await kvSet(key(p.id), next);
  return next;
}

/** The company opened the page (not counted for our own staff). */
export async function recordProposalView(id: string): Promise<void> {
  const p = await getWebsiteProposal(id);
  if (!p) return;
  const now = new Date().toISOString();
  if (p.viewedAt) {
    await kvSet(key(id), { ...p, views: p.views + 1 });
    return;
  }
  await save(p, "Voor het eerst bekeken", "bezoeker", { views: p.views + 1, viewedAt: now, status: p.status === "concept" || p.status === "verstuurd" ? "bekeken" : p.status });
  // the company is reading it: a good moment to call (once per proposal)
  await pushMaker(p, { title: "👀 Websitevoorstel geopend", body: `${p.bedrijf} opende je websitevoorstel om ${amsterdamClock(now)}. Een goed moment om even te bellen.` });
}

export interface ProposalReminder {
  /** ledger id: one reminder of each kind per proposal (and per expiry date) */
  id: string;
  proposal: WebsiteProposal;
  title: string;
  body: string;
}

const dayName = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });

/**
 * Follow-ups for the maker of a proposal (autopilot action "websitevoorstel-opvolgen"):
 * sent without an answer and opened 2–14 days ago, or expiring within 3 days; or made
 * but still not sent after 2 days (it would expire unseen). At most one per proposal
 * per run; expiring wins.
 */
export function dueReminders(proposals: WebsiteProposal[], now: Date): ProposalReminder[] {
  const t = now.getTime();
  const out: ProposalReminder[] = [];
  for (const p of proposals) {
    if (!p.createdById || p.akkoord) continue;
    const left = Date.parse(p.expiresAt) - t;
    if (!(left > 0)) continue;
    if (p.status === "concept") {
      if (t - Date.parse(p.createdAt) >= 2 * 86_400_000) {
        out.push({ id: `${p.id}:versturen`, proposal: p, title: "✉️ Websitevoorstel nog niet verstuurd", body: `Het voorstel voor ${p.bedrijf} staat sinds ${dayName(p.createdAt)} klaar, maar is nog niet verstuurd. Verstuur het, of trek het in als het niet meer nodig is.` });
      }
      continue;
    }
    if (p.status !== "verstuurd" && p.status !== "bekeken") continue;
    if (left <= 3 * 86_400_000) {
      out.push({ id: `${p.id}:verloopt:${p.expiresAt}`, proposal: p, title: "⏳ Websitevoorstel verloopt bijna", body: `Het voorstel voor ${p.bedrijf} verloopt op ${dayName(p.expiresAt)}. Bel even na, of verleng het met 30 dagen.` });
      continue;
    }
    const seen = p.viewedAt ? t - Date.parse(p.viewedAt) : 0;
    if (p.status === "bekeken" && p.viewedAt && seen >= 2 * 86_400_000 && seen <= 14 * 86_400_000) {
      out.push({ id: `${p.id}:nabellen`, proposal: p, title: "📞 Even nabellen?", body: `${p.bedrijf} opende je websitevoorstel op ${dayName(p.viewedAt)} en reageerde nog niet. Een kort belletje helpt vaak.` });
    }
  }
  return out;
}

/** Sends a follow-up from dueReminders to the maker. */
export async function pushReminder(r: ProposalReminder): Promise<void> {
  await pushMaker(r.proposal, { title: r.title, body: r.body });
}

/**
 * A push to whoever made the proposal, opening their own list (Admin or Sales).
 * `skipAdmins` when platform admins already hear it from alertOwner.
 */
async function pushMaker(p: WebsiteProposal, push: { title: string; body: string }, opts: { skipAdmins?: boolean } = {}): Promise<void> {
  if (!p.createdById) return;
  try {
    const admin = (await prisma.membership.count({ where: { userId: p.createdById, role: "PLATFORM_ADMIN" } })) > 0;
    if (admin && opts.skipAdmins) return;
    await sendUserPush([p.createdById], {
      ...push,
      data: { type: "SALES", url: admin ? "/admin/websitevoorstellen" : "/sales/websitevoorstellen", tag: `wvoorstel-${p.id}` },
      ttlSeconds: 6 * 3600,
    });
  } catch (err) {
    logger.warn("website proposal push failed", { id: p.id, error: (err as Error).message });
  }
}

export type ProposalAction = "verstuurd" | "afgewezen" | "ingetrokken" | "verlengen" | "plek-vrijgeven";

export async function updateWebsiteProposal(id: string, action: ProposalAction, by: { userId: string; name: string }): Promise<WebsiteProposal> {
  const p = await getWebsiteProposal(id);
  if (!p) throw AppError.notFound("Dit voorstel bestaat niet.");
  // the site belongs to the company now: withdrawing or extending would touch their website
  if (p.status === "overgezet") throw AppError.validation("Dit voorstel is al overgezet; de website is nu van het bedrijf.");
  let next: WebsiteProposal;
  if (action === "verstuurd") {
    next = await save(p, "Gemarkeerd als verstuurd", by.name, { sentAt: new Date().toISOString(), status: p.status === "concept" ? "verstuurd" : p.status });
  } else if (action === "afgewezen") {
    next = await save(p, "Bedrijf heeft afgezegd", by.name, { status: "afgewezen" });
  } else if (action === "ingetrokken") {
    // offline, and the address free again for a real company or a new proposal
    await setLiveBuild(p.siteId, null, by).catch((err) => logger.warn("proposal offline failed", { id, err: String(err) }));
    await freeSlug(p.siteId).catch(() => undefined);
    if (p.akkoord?.plek) await kvDelete(spotKey(p.akkoord.plek));
    next = await save(p, "Ingetrokken: website offline", by.name, { status: "ingetrokken", ...(p.akkoord ? { akkoord: { ...p.akkoord, plek: null } } : {}) });
  } else if (action === "verlengen") {
    if (p.status === "ingetrokken") throw AppError.validation("Een ingetrokken voorstel kun je niet verlengen; maak een nieuw.");
    const pricing = await getProposalPricing();
    const expiresAt = new Date(Math.max(Date.now(), Date.parse(p.expiresAt)) + pricing.geldigDagen * 86_400_000).toISOString();
    const site = await getSite(p.siteId);
    if (site) {
      await markProposal(site.id, { officieel: p.host, verloopt: expiresAt });
      await publishSite(site.id, by);
    }
    next = await save(p, `Verlengd tot ${amsterdamDayKey(new Date(expiresAt))}`, by.name, { expiresAt });
  } else {
    if (!p.akkoord?.plek) throw AppError.validation("Dit voorstel heeft geen plek met introductiekorting.");
    await kvDelete(spotKey(p.akkoord.plek));
    next = await save(p, `Introductieplek ${p.akkoord.plek} vrijgegeven`, by.name, { akkoord: { ...p.akkoord, plek: null } });
  }
  await recordAudit({ category: "SALES", action: `website-proposal.${action}`, actorUserId: by.userId, summary: `Websitevoorstel ${p.bedrijf}: ${next.history[0]?.what ?? action}`, targetType: "website-proposal", targetId: id });
  return next;
}

/** The company accounts this e-mail manages (HQ_ADMIN). A transfer needs exactly one. */
async function companiesOf(email: string): Promise<{ tenantId: string; tenant: { name: string } }[]> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
    select: { memberships: { where: { role: "HQ_ADMIN" }, select: { tenantId: true, tenant: { select: { name: true } } } } },
  });
  return user?.memberships ?? [];
}

/**
 * Admin list: for each proposal with a "ja", the companies its e-mail already
 * manages, so the team sees whether it can transfer now (the company can make
 * the account itself from the thank-you screen). Proposal id → company names;
 * a transfer needs exactly one.
 */
export async function proposalAccounts(proposals: Pick<WebsiteProposal, "id" | "status" | "akkoord">[]): Promise<Record<string, string[]>> {
  const found: Record<string, string[]> = {};
  for (const p of proposals) {
    if (p.status !== "akkoord" || !p.akkoord?.email) continue;
    const companies = await companiesOf(p.akkoord.email).catch(() => []);
    if (companies.length > 0) found[p.id] = companies.map((c) => c.tenant.name);
  }
  return found;
}

/**
 * After a yes: hand the site to the company's own account (the admin of that
 * company, found by e-mail address). In the builder it is then their site,
 * offline until they publish it with Website-beheer; their launch place stays.
 */
export async function transferWebsiteProposal(id: string, email: string, by: { userId: string; name: string }): Promise<WebsiteProposal> {
  const p = await getWebsiteProposal(id);
  if (!p) throw AppError.notFound("Dit voorstel bestaat niet.");
  if (p.status !== "akkoord") throw AppError.validation("Zet een voorstel pas over als het bedrijf ja heeft gezegd.");
  const admin = await companiesOf(email);
  if (admin.length === 0) throw AppError.validation("Geen beheerder van een bedrijf gevonden met dit e-mailadres. Zet eerst een account voor het bedrijf klaar (Buitendienst) en probeer het daarna opnieuw.");
  if (admin.length > 1) throw AppError.validation(`Dit account beheert meer dan één bedrijf (${admin.map((m) => m.tenant.name).join(", ")}). Gebruik het e-mailadres van de beheerder van het juiste bedrijf.`);
  const target = admin[0]!;
  await transferSite(p.siteId, target.tenantId, by);
  const next = await save(p, `Overgezet naar ${target.tenant.name}`, by.name, { status: "overgezet", overgezet: { at: new Date().toISOString(), tenantId: target.tenantId, bedrijf: target.tenant.name } });
  await recordAudit({ category: "SALES", action: "website-proposal.transferred", actorUserId: by.userId, summary: `Websitevoorstel ${p.bedrijf} overgezet naar ${target.tenant.name}`, targetType: "website-proposal", targetId: id });
  return next;
}

export const acceptSchema = z.object({
  naam: z.string().trim().min(2, "Vul je naam in.").max(100),
  email: z.string().trim().max(200).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Vul een geldig e-mailadres in."),
  telefoon: z.string().trim().max(30).regex(/^[\d\s+()-]*$/, "Vul een geldig telefoonnummer in.").default(""),
  pakket: z.enum(["basis", "pro"]),
  domein: z.enum(["houden", "verhuizen", "geen", "weet-niet"]),
  opmerking: z.string().trim().max(2000).default(""),
  /** the form's own confirmation box */
  begrepen: z.literal(true, { errorMap: () => ({ message: "Vink aan dat je begrijpt hoe het verder gaat." }) }),
});

/** The company says yes: claim a launch place if there is one, and let our team know. `nieuw` is false for a repeat of an earlier yes. */
export async function acceptWebsiteProposal(id: string, input: z.infer<typeof acceptSchema>): Promise<{ proposal: WebsiteProposal; nieuw: boolean }> {
  const p = await getWebsiteProposal(id);
  if (!p || p.status === "ingetrokken") throw AppError.notFound("Dit voorstel bestaat niet (meer).");
  if (p.akkoord) return { proposal: p, nieuw: false };
  if (isExpired(p)) throw AppError.validation("Dit voorstel is verlopen. Neem contact met ons op, dan maken we graag een nieuw voorstel.");
  // one "ja" per proposal, even when the button is pressed twice at once
  try {
    await prisma.keyValueStore.create({ data: { key: `wvoorstel-akkoord:${id}`, value: new Date().toISOString() } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { proposal: (await getWebsiteProposal(id)) ?? p, nieuw: false };
    throw err;
  }
  const pricing = await getProposalPricing();
  const plek = await claimPlace(id, pricing.plekken);
  const kortingPct = plek ? pricing.kortingPct : 0;
  const plan = WEBSITE_PLANS[input.pakket];
  const akkoord: ProposalAcceptance = {
    at: new Date().toISOString(),
    naam: input.naam,
    email: input.email,
    telefoon: input.telefoon,
    pakket: input.pakket,
    domein: input.domein,
    opmerking: input.opmerking,
    plek,
    prijs: { websiteCents: pricing.websiteCents, kortingPct, teBetalenCents: Math.round((pricing.websiteCents * (100 - kortingPct)) / 100), maandCents: plan.priceCentsPerMonth },
  };
  const next = await save(p, `Ja gezegd: ${plan.label}${plek ? `, introductieplek ${plek}` : ""}`, input.naam, { status: "akkoord", akkoord });
  await recordAudit({ category: "SALES", action: "website-proposal.accepted", summary: `${p.bedrijf} zegt ja op het websitevoorstel (${plan.label})`, targetType: "website-proposal", targetId: id });

  if (p.leadId) {
    await markLeadReplied(p.leadId, null).catch((err) => logger.warn("proposal lead update failed", { id, err: String(err) }));
    const lead = await prisma.salesLead.findUnique({ where: { id: p.leadId }, select: { notes: true } }).catch(() => null);
    const note = `${amsterdamDayKey(new Date())}: ja op het websitevoorstel (${plan.label}${plek ? `, introductieplek ${plek}` : ""}).`;
    await prisma.salesLead.update({ where: { id: p.leadId }, data: { notes: [lead?.notes, note].filter(Boolean).join("\n").slice(-4000) } }).catch(() => undefined);
  }
  if (!isReservedTestEmail(input.email)) {
    await alertOwner({
      key: `websitevoorstel:akkoord:${id}`,
      severity: "warning",
      title: "Ja op een websitevoorstel",
      detail: `${p.bedrijf} wil de nieuwe website met ${plan.label}${plek ? ` (introductieplek ${plek} van ${pricing.plekken})` : ""}. Bekijk de gegevens en neem contact op.`,
      url: "/admin/websitevoorstellen",
    });
    // a sales person who made it hears it too; they promised contact within one working day
    await pushMaker(p, { title: "🎉 Ja op je websitevoorstel", body: `${p.bedrijf} wil de nieuwe website met ${plan.label}. We beloofden binnen één werkdag contact op te nemen.` }, { skipAdmins: true });
  }
  return { proposal: next, nieuw: true };
}
