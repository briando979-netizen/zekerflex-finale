import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { guessAndVerifyDomain } from "@/lib/sales/discovery/domain-guess";
import { placesEnabled, lookupCompanyContact } from "@/lib/sales/discovery/places-lookup";

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
function safeHost(origin: string): string | null {
  try {
    return new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Contactgegevens-verrijker. KVKBase-leads zijn kale stubs (naam + KVK, geen
// telefoon/mail). Deze haalt via het bedrijfsdomein (uit sourceUrl of geraden
// via guessAndVerifyDomain) de homepage + een paar contactpagina's op en haalt
// er een TELEFOONNUMMER en een e-mailadres uit. Alleen publieke HTML.
// ---------------------------------------------------------------------------

const UA = "ZekerFlexBot/1.0 (+https://zekerflex.com/bot; zakelijke kennismaking)";
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_200_000;
const CONTACT_PATHS = ["/", "/contact", "/contact/", "/contact-us", "/over-ons", "/nl/contact", "/contactgegevens"];
const JUNK_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|@(sentry|wixpress|example|domain|email|test|godaddy)\./i;

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!res.ok || !/text\/html|xhtml/.test(ct)) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf.slice(0, MAX_BYTES)).toString("utf8");
  } catch {
    return null;
  }
}

/** Normaliseer een ruw gevonden nummer; null als het geen plausibel NL/intl nummer is. */
function cleanPhone(raw: string): string | null {
  let n = raw.replace(/[^\d+]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  const digits = n.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 13) return null;
  // Weiger KVK-achtige 8-cijferige reeksen en jaartallen: NL vast/mobiel = 10 cijfers (0..) of +31 + 9.
  if (!n.startsWith("+") && !n.startsWith("0")) return null;
  return n;
}

function extractPhone(html: string): string | null {
  for (const m of html.matchAll(/tel:([+0-9()\s.\-]{7,20})/gi)) {
    const p = cleanPhone(m[1] ?? "");
    if (p) return p;
  }
  for (const m of html.matchAll(/(?:\+31|0031|0)[\s.\-]?\d(?:[\s.\-]?\d){7,9}/g)) {
    const p = cleanPhone(m[0] ?? "");
    if (p) return p;
  }
  return null;
}

function extractEmail(html: string, siteDomain: string | null): string | null {
  const found = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) found.add((m[1] ?? "").toLowerCase());
  for (const m of html.matchAll(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi)) found.add((m[0] ?? "").toLowerCase());
  const clean = [...found].filter((e) => e.includes("@") && !JUNK_EMAIL.test(e));
  if (!clean.length) return null;
  const onDomain = siteDomain ? clean.filter((e) => (e.split("@")[1] ?? "").endsWith(siteDomain)) : [];
  return onDomain[0] ?? clean[0] ?? null;
}

export interface ContactScrapeResult {
  origin: string | null;
  phone: string | null;
  email: string | null;
  updated: boolean;
}

/** Zoek telefoon + e-mail voor één lead en vul de ontbrekende velden aan.
 *  Bron-volgorde: Google Places (echt nummer + website) → domein raden →
 *  website afzoeken op (nog ontbrekende) telefoon + e-mail. */
export async function enrichLeadContact(leadId: string): Promise<ContactScrapeResult> {
  const lead = await prisma.salesLead.findUnique({ where: { id: leadId } });
  if (!lead) return { origin: null, phone: null, email: null, updated: false };

  let phone: string | null = null;
  let email: string | null = null;
  let origin: string | null = lead.sourceUrl ? safeOrigin(lead.sourceUrl) : null;

  // 1. Google Places: echt telefoonnummer + website (beste bron, als geconfigureerd).
  if (placesEnabled()) {
    const p = await lookupCompanyContact(lead.companyName, lead.city).catch(() => null);
    if (p?.phone) phone = p.phone;
    if (p?.website && !origin) origin = safeOrigin(p.website);
  }

  // 2. Nog geen website? Raad het domein.
  if (!origin) {
    const guess = await guessAndVerifyDomain(lead.companyName).catch(() => null);
    origin = guess?.origin ?? null;
  }

  // 3. Website afzoeken op ontbrekende telefoon + e-mail.
  if (origin) {
    const siteDomain = safeHost(origin);
    for (const path of CONTACT_PATHS) {
      if (phone && email) break;
      const html = await fetchPage(origin + path);
      if (!html) continue;
      phone = phone ?? extractPhone(html);
      email = email ?? extractEmail(html, siteDomain);
    }
  }

  if (!phone && !email && !origin) return { origin: null, phone: null, email: null, updated: false };

  const update: Prisma.SalesLeadUpdateInput = {
    ...(phone && !lead.contactPhone ? { contactPhone: phone } : {}),
    ...(email && !lead.discoveredEmail ? { discoveredEmail: email } : {}),
    ...(email && !lead.contactEmail ? { contactEmail: email } : {}),
    ...(origin && !lead.sourceUrl ? { sourceUrl: origin } : {}),
  };
  let updated = false;
  if (Object.keys(update).length > 0) {
    await prisma.salesLead.update({ where: { id: leadId }, data: update });
    updated = true;
  }
  logger.info("contact scrape", { leadId, origin, phone: Boolean(phone), email: Boolean(email), updated });
  return { origin, phone, email, updated };
}
