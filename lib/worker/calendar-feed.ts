import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";

// ---------------------------------------------------------------------------
// Agenda-abonnement voor werkers: een geheime iCal-link met al je diensten,
// waarop Google Agenda, Apple Agenda of Outlook zich abonneert. Nieuwe
// diensten verschijnen vanzelf; een afgezegde dienst krijgt STATUS:CANCELLED.
// Zelfde opzet als de bedrijfsagenda in lib/integrations/employer-links.ts:
//   KV "werker-agenda:<userId>"           → token
//   KV "werker-agenda-token:<sha(token)>" → userId
// De link werkt alleen zolang beide kloppen. Vernieuwen of het account
// verwijderen (werker-agenda: staat in ERASABLE_KV_PREFIXES) maakt een oude
// link dus meteen dood.
// ---------------------------------------------------------------------------

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ownKey = (userId: string) => `werker-agenda:${userId}`;
const lookupKey = (token: string) => `werker-agenda-token:${sha(token)}`;
const langKey = (userId: string) => `werker-agenda-taal:${userId}`;

export async function workerFeedToken(userId: string, rotate = false): Promise<string> {
  const existing = await kvGet<string>(ownKey(userId));
  if (existing && !rotate) return existing;
  if (existing) await kvDelete(lookupKey(existing));
  const token = randomBytes(24).toString("base64url");
  await kvSet(ownKey(userId), token);
  await kvSet(lookupKey(token), userId);
  return token;
}

export async function userForFeedToken(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const userId = await kvGet<string>(lookupKey(token));
  if (!userId) return null;
  return (await kvGet<string>(ownKey(userId))) === token ? userId : null;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** UTC met Z: de server draait in UTC, een zwevende tijd zou een uur verschuiven. */
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** RFC 5545: regels van meer dan 75 tekens vouwen. */
const fold = (l: string) => (l.length <= 75 ? l : l.match(/.{1,74}/g)!.join("\r\n "));

export interface FeedAssignment {
  id: string;
  cancelledAt: Date | null;
  shift: {
    id: string;
    title: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    breakMinutes: number;
    dresscode: string | null;
    updatedAt: Date;
    branch: { name: string; addressLine: string; postalCode: string; city: string; tenant: { name: string } };
  };
}

/** Teksten in de feed, in de app-taal van de werker (een agenda-app stuurt geen taal mee). */
const FEED_TEXT: Record<Locale, {
  calName: string;
  intro: (company: string) => string;
  pause: (minutes: number) => string;
  dress: (text: string) => string;
  cancelledLine: string;
  checkIn: string;
  cancelledPrefix: string;
  alarm: (company: string) => string;
}> = {
  nl: {
    calName: "ZekerFlex diensten",
    intro: (c) => `Je dienst via ZekerFlex bij ${c}.`,
    pause: (n) => `Pauze: ${n} minuten.`,
    dress: (x) => `Kleding: ${x}`,
    cancelledLine: "Deze dienst gaat niet door.",
    checkIn: "Check op tijd in op locatie.",
    cancelledPrefix: "Gaat niet door: ",
    alarm: (c) => `Over 2 uur begint je dienst bij ${c}`,
  },
  en: {
    calName: "ZekerFlex shifts",
    intro: (c) => `Your shift via ZekerFlex at ${c}.`,
    pause: (n) => `Break: ${n} minutes.`,
    dress: (x) => `Clothing: ${x}`,
    cancelledLine: "This shift is cancelled.",
    checkIn: "Check in on site on time.",
    cancelledPrefix: "Cancelled: ",
    alarm: (c) => `Your shift at ${c} starts in 2 hours`,
  },
  pl: {
    calName: "Zmiany ZekerFlex",
    intro: (c) => `Twoja zmiana przez ZekerFlex u ${c}.`,
    pause: (n) => `Przerwa: ${n} min.`,
    dress: (x) => `Strój: ${x}`,
    cancelledLine: "Ta zmiana jest odwołana.",
    checkIn: "Zamelduj się na miejscu na czas.",
    cancelledPrefix: "Odwołana: ",
    alarm: (c) => `Za 2 godziny zaczyna się Twoja zmiana u ${c}`,
  },
  ro: {
    calName: "Ture ZekerFlex",
    intro: (c) => `Tura ta prin ZekerFlex la ${c}.`,
    pause: (n) => `Pauză: ${n} minute.`,
    dress: (x) => `Îmbrăcăminte: ${x}`,
    cancelledLine: "Această tură a fost anulată.",
    checkIn: "Fă check-in la locație la timp.",
    cancelledPrefix: "Anulată: ",
    alarm: (c) => `Tura ta la ${c} începe în 2 ore`,
  },
  uk: {
    calName: "Зміни ZekerFlex",
    intro: (c) => `Ваша зміна через ZekerFlex у ${c}.`,
    pause: (n) => `Перерва: ${n} хв.`,
    dress: (x) => `Одяг: ${x}`,
    cancelledLine: "Цю зміну скасовано.",
    checkIn: "Вчасно відмітьтеся на місці.",
    cancelledPrefix: "Скасовано: ",
    alarm: (c) => `Через 2 години починається ваша зміна у ${c}`,
  },
};

/** Onthoud de app-taal (gezet als de werker de koppelpagina opent). */
export async function setFeedLanguage(userId: string, locale: Locale): Promise<void> {
  if ((await kvGet<string>(langKey(userId))) !== locale) await kvSet(langKey(userId), locale);
}

async function feedLanguage(userId: string): Promise<Locale> {
  const v = await kvGet<string>(langKey(userId));
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export function feedIcs(assignments: FeedAssignment[], siteUrl: string, lang: Locale = DEFAULT_LOCALE): string {
  const tx = FEED_TEXT[lang];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZekerFlex//Mijn diensten//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(tx.calName)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const a of assignments) {
    const s = a.shift;
    const b = s.branch;
    const cancelled = a.cancelledAt !== null || s.status === "CANCELLED";
    const desc = [
      tx.intro(b.tenant.name),
      s.breakMinutes > 0 ? tx.pause(s.breakMinutes) : null,
      s.dresscode ? tx.dress(s.dresscode) : null,
      cancelled ? tx.cancelledLine : tx.checkIn,
      `${siteUrl}/dashboard/klussen/${s.id}`,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:shift-${a.id}@zekerflex.com`,
      `DTSTAMP:${stamp(a.cancelledAt && a.cancelledAt > s.updatedAt ? a.cancelledAt : s.updatedAt)}`,
      `DTSTART:${stamp(s.startsAt)}`,
      `DTEND:${stamp(s.endsAt)}`,
      `SUMMARY:${esc(`${cancelled ? tx.cancelledPrefix : ""}${s.title} · ${b.tenant.name}`)}`,
      `LOCATION:${esc(`${b.name}, ${b.addressLine}, ${b.postalCode} ${b.city}`)}`,
      `DESCRIPTION:${esc(desc)}`,
      `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
      `TRANSP:${cancelled ? "TRANSPARENT" : "OPAQUE"}`,
    );
    if (!cancelled) {
      lines.push("BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${esc(tx.alarm(b.tenant.name))}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Je diensten van 30 dagen terug tot een jaar vooruit, ook afgezegde (zodat de agenda ze weghaalt). */
export async function workerCalendarIcs(userId: string, siteUrl: string, now = new Date()): Promise<string> {
  const profile = await prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } });
  const assignments = profile
    ? await prisma.shiftAssignment.findMany({
        where: {
          freelancerId: profile.id,
          shift: { startsAt: { gte: new Date(now.getTime() - 30 * 864e5), lte: new Date(now.getTime() + 365 * 864e5) } },
        },
        select: {
          id: true,
          cancelledAt: true,
          shift: {
            select: {
              id: true,
              title: true,
              status: true,
              startsAt: true,
              endsAt: true,
              breakMinutes: true,
              dresscode: true,
              updatedAt: true,
              branch: { select: { name: true, addressLine: true, postalCode: true, city: true, tenant: { select: { name: true } } } },
            },
          },
        },
        orderBy: { shift: { startsAt: "asc" } },
        take: 1000,
      })
    : [];
  return feedIcs(assignments, siteUrl, await feedLanguage(userId));
}
