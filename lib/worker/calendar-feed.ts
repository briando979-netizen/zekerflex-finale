import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";

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

export function feedIcs(assignments: FeedAssignment[], siteUrl: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZekerFlex//Mijn diensten//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ZekerFlex diensten",
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const a of assignments) {
    const s = a.shift;
    const b = s.branch;
    const cancelled = a.cancelledAt !== null || s.status === "CANCELLED";
    const desc = [
      `Je dienst via ZekerFlex bij ${b.tenant.name}.`,
      s.breakMinutes > 0 ? `Pauze: ${s.breakMinutes} minuten.` : null,
      s.dresscode ? `Kleding: ${s.dresscode}` : null,
      cancelled ? "Deze dienst gaat niet door." : "Check op tijd in op locatie.",
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
      `SUMMARY:${esc(`${cancelled ? "Gaat niet door: " : ""}${s.title} · ${b.tenant.name}`)}`,
      `LOCATION:${esc(`${b.name}, ${b.addressLine}, ${b.postalCode} ${b.city}`)}`,
      `DESCRIPTION:${esc(desc)}`,
      `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
      `TRANSP:${cancelled ? "TRANSPARENT" : "OPAQUE"}`,
    );
    if (!cancelled) {
      lines.push("BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${esc(`Over 2 uur begint je dienst bij ${b.tenant.name}`)}`, "END:VALARM");
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
  return feedIcs(assignments, siteUrl);
}
