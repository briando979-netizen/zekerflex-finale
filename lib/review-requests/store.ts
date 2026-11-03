import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { hasRole, type Principal } from "@/lib/auth";
import { mailButton, mailShell, sendMail } from "@/lib/mail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { isTenantVerified } from "@/lib/company/verified";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { EMAIL_RE, isReviewToken, normalizeGoogleReviewUrl, type ReviewRequest, type ReviewSettings } from "@/lib/review-requests/shared";

// ---------------------------------------------------------------------------
// Google-reviews verzamelen: een bedrijf vraagt zijn eigen klanten om een
// review. De klant krijgt een mail (afmeldbaar: categorie "Review-verzoeken"),
// geeft op /review/<token> sterren, en krijgt dan altijd de knop naar Google en
// de keuze om het bedrijf privé te schrijven. Geen gating (zie shared.ts).
//   KV "grev-settings:<tenantId>"        — Google-link, feedbackadres, naam
//   KV "grev-req:<tenantId>:<token>"     — één verzoek (token = het geheim in de link)
//   KV "grev-token:<token>"              — token → bedrijf
// ---------------------------------------------------------------------------

const settingsKey = (tenantId: string) => `grev-settings:${tenantId}`;
const reqPrefix = (tenantId: string) => `grev-req:${tenantId}:`;
const reqKey = (tenantId: string, token: string) => `grev-req:${tenantId}:${token}`;
const tokenKey = (token: string) => `grev-token:${token}`;
const SAME_CUSTOMER_DAYS = 30;
const PER_DAY = 50;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The company whose reviews this person collects (its admin, or a platform admin's own company). */
export async function reviewTenantOf(p: Principal): Promise<string> {
  const grant = p.grants.find((g) => g.role === "HQ_ADMIN");
  if (grant) return grant.organizationId;
  if (hasRole(p, "PLATFORM_ADMIN")) {
    const own = (await resolveEmployerScope(p)).tenantIds[0];
    if (own) return own;
  }
  throw AppError.forbidden("Alleen de beheerder van een bedrijf kan reviews verzamelen.");
}

export async function getReviewSettings(tenantId: string, fallbackEmail: string): Promise<ReviewSettings> {
  const saved = await kvGet<ReviewSettings>(settingsKey(tenantId)).catch(() => null);
  if (saved) return saved;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }).catch(() => null);
  return { googleUrl: null, feedbackEmail: fallbackEmail, naam: tenant?.name ?? "", updatedAt: null };
}

export async function saveReviewSettings(tenantId: string, input: { googleUrl: string; feedbackEmail: string; naam: string }, by: Principal): Promise<ReviewSettings> {
  const googleUrl = input.googleUrl.trim() ? normalizeGoogleReviewUrl(input.googleUrl) : null;
  if (input.googleUrl.trim() && !googleUrl) throw AppError.validation("Dit is geen link naar Google. Kopieer de link 'Een review schrijven' uit je Google-bedrijfsprofiel.");
  const feedbackEmail = input.feedbackEmail.trim();
  if (!EMAIL_RE.test(feedbackEmail) || feedbackEmail.length > 200) throw AppError.validation("Vul een geldig e-mailadres in voor de feedback.");
  const naam = input.naam.trim().slice(0, 100);
  if (naam.length < 2) throw AppError.validation("Vul de naam van je bedrijf in zoals klanten hem kennen.");
  const settings: ReviewSettings = { googleUrl, feedbackEmail, naam, updatedAt: new Date().toISOString() };
  await kvSet(settingsKey(tenantId), settings);
  await recordAudit({ category: "SALES", action: "google-reviews.settings", actorUserId: by.userId, summary: "Instellingen Google-reviews opgeslagen", targetType: "tenant", targetId: tenantId });
  return settings;
}

export async function listReviewRequests(tenantId: string): Promise<ReviewRequest[]> {
  const rows = await kvListValues<ReviewRequest>(reqPrefix(tenantId), 5000).catch(() => []);
  return rows.filter((r) => r && typeof r.token === "string").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Ask one customer for a review. The mail always offers Google and a private message; it is skipped for addresses that opted out. */
export async function sendReviewRequest(tenantId: string, input: { naam: string; email: string }, by: Principal): Promise<ReviewRequest> {
  const settings = await getReviewSettings(tenantId, by.email);
  if (!settings.googleUrl || !settings.updatedAt) throw AppError.validation("Zet eerst je Google-reviewlink en je feedbackadres bij Instellingen.");
  // an unverified company could turn this into a spam channel; a platform admin may test with its own company
  if (!hasRole(by, "PLATFORM_ADMIN") && !(await isTenantVerified(tenantId))) {
    throw AppError.forbidden("Review-verzoeken versturen kan zodra je bedrijf geverifieerd is.");
  }
  const naam = input.naam.trim().slice(0, 100);
  const email = input.email.trim().toLowerCase();
  if (!naam) throw AppError.validation("Vul de naam van je klant in.");
  if (!EMAIL_RE.test(email) || email.length > 200) throw AppError.validation("Vul een geldig e-mailadres van je klant in.");
  const since = Date.now() - SAME_CUSTOMER_DAYS * 86_400_000;
  const earlier = (await listReviewRequests(tenantId)).find((r) => r.email === email && Date.parse(r.createdAt) > since);
  if (earlier) throw AppError.conflict(`Je hebt ${naam} op ${new Date(earlier.createdAt).toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" })} al om een review gevraagd. Eén keer per ${SAME_CUSTOMER_DAYS} dagen is genoeg.`);
  await enforceRateLimit({ name: "google-review-verzoek", identifier: tenantId, limit: PER_DAY, windowSeconds: 86_400, message: `Je kunt ${PER_DAY} review-verzoeken per dag versturen. Probeer het morgen weer.` });

  const token = randomBytes(12).toString("hex");
  const link = `${env.APP_BASE_URL.replace(/\/+$/, "")}/review/${token}`;
  const result = await sendMail({
    to: email,
    replyTo: settings.feedbackEmail,
    kind: "google-review-verzoek",
    subject: `Hoe was je ervaring met ${settings.naam}?`,
    text: `Hoi ${naam},\n\n${settings.naam} wil graag weten hoe je ervaring was. Het kost een halve minuut: geef een cijfer, en deel je ervaring op Google of laat ${settings.naam} weten wat er beter kan.\n\n${link}\n\nVerstuurd via ZekerFlex namens ${settings.naam}.`,
    html: mailShell(
      `Hoe was je ervaring met ${esc(settings.naam)}?`,
      `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${esc(naam)}, ${esc(settings.naam)} wil graag weten hoe je ervaring was. Het kost een halve minuut: geef een cijfer, en deel je ervaring op Google of laat ${esc(settings.naam)} weten wat er beter kan.</p>
       <p style="margin:0 0 14px">${mailButton(link, "Geef je ervaring een cijfer")}</p>
       <p style="margin:0;font-size:13px;color:#6B7A72">Verstuurd via ZekerFlex namens ${esc(settings.naam)}.</p>`,
    ),
  }).catch((err) => {
    logger.warn("review request mail failed", { tenantId, err: String(err) });
    throw AppError.validation("De mail kon niet worden verstuurd. Probeer het later opnieuw.");
  });
  const req: ReviewRequest = { token, tenantId, naam, email, createdAt: new Date().toISOString(), createdBy: by.fullName || by.email, sent: !result.suppressed, openedAt: null, rating: null, ratedAt: null, feedback: null, feedbackAt: null, googleAt: null };
  await kvSet(reqKey(tenantId, token), req);
  await kvSet(tokenKey(token), tenantId);
  await recordAudit({ category: "SALES", action: "google-reviews.requested", actorUserId: by.userId, summary: req.sent ? "Review-verzoek verstuurd" : "Review-verzoek niet verstuurd: klant afgemeld", targetType: "tenant", targetId: tenantId });
  return req;
}

export async function deleteReviewRequest(tenantId: string, token: string): Promise<void> {
  if (!isReviewToken(token)) throw AppError.notFound("Dit verzoek bestaat niet.");
  if (!(await kvGet<ReviewRequest>(reqKey(tenantId, token)))) throw AppError.notFound("Dit verzoek bestaat niet.");
  await kvDelete(reqKey(tenantId, token));
  await kvDelete(tokenKey(token));
}

// ---- the customer's side (/review/<token>) ------------------------------------

export async function reviewByToken(token: string): Promise<{ req: ReviewRequest; settings: ReviewSettings } | null> {
  if (!isReviewToken(token)) return null;
  const tenantId = await kvGet<string>(tokenKey(token)).catch(() => null);
  const req = tenantId ? await kvGet<ReviewRequest>(reqKey(tenantId, token)).catch(() => null) : null;
  const settings = tenantId ? await kvGet<ReviewSettings>(settingsKey(tenantId)).catch(() => null) : null;
  return req && settings ? { req, settings } : null;
}

async function update(token: string, patch: (r: ReviewRequest) => Partial<ReviewRequest>): Promise<{ req: ReviewRequest; settings: ReviewSettings }> {
  const found = await reviewByToken(token);
  if (!found) throw AppError.notFound("Deze link werkt niet (meer).");
  const req = { ...found.req, ...patch(found.req) };
  await kvSet(reqKey(req.tenantId, token), req);
  return { req, settings: found.settings };
}

export const markReviewOpened = (token: string) => update(token, (r) => (r.openedAt ? {} : { openedAt: new Date().toISOString() }));

export async function rateReview(token: string, rating: number): Promise<{ req: ReviewRequest; settings: ReviewSettings }> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw AppError.validation("Kies 1 tot 5 sterren.");
  return update(token, () => ({ rating, ratedAt: new Date().toISOString() }));
}

export const markReviewGoogle = (token: string) => update(token, (r) => (r.googleAt ? {} : { googleAt: new Date().toISOString() }));

/** Private feedback for the company: kept here and mailed to its feedback address (replies go to the customer). */
export async function reviewFeedback(token: string, text: string): Promise<void> {
  const body = text.trim().slice(0, 3000);
  if (body.length < 3) throw AppError.validation("Schrijf even wat er beter kan.");
  const before = await reviewByToken(token);
  if (!before) throw AppError.notFound("Deze link werkt niet (meer).");
  if (before.req.feedback) throw AppError.conflict("Je feedback is al verstuurd. Dank je wel!");
  const { req, settings } = await update(token, () => ({ feedback: body, feedbackAt: new Date().toISOString() }));
  const stars = req.rating ? `${req.rating} van de 5 sterren` : "geen cijfer";
  await sendMail({
    to: settings.feedbackEmail,
    replyTo: req.email,
    kind: "review-feedback",
    subject: `Feedback van ${req.naam} (${stars})`,
    text: `${req.naam} (${req.email}) gaf ${stars} en schreef:\n\n${body}\n\nBeantwoord deze mail om direct te reageren. Je vindt alle feedback ook in ZekerFlex onder Google-reviews.`,
  }).catch((err) => logger.warn("review feedback mail failed", { tenantId: req.tenantId, err: String(err) }));
}
