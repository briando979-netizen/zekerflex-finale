// Shared types + helpers for the chat UI (dock + full page).

import { SHARED_NL, type SharedTeksten } from "@/lib/chat/teksten-shared";
import { vulIn } from "@/lib/i18n/vul-in";
import { amsterdamClock, amsterdamDayKey, amsterdamParts, amsterdamStartOfDay } from "@/lib/time/amsterdam";
import type { MessagePoll } from "@/lib/messaging/poll";

export interface ChatUser {
  userId: string;
  name: string;
  role: "freelancer" | "employer" | "admin" | "support";
  meta: string;
}

export interface Presence {
  online: boolean;
  lastSeen: string | null;
}

export interface Attachment {
  mediaId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSec?: number;
}

export interface CallInfo {
  mode: "audio" | "video" | "screen";
  status: "started" | "ended" | "missed" | "declined";
  durationSec?: number;
}

export interface Msg {
  id: string;
  from: string;
  at: string;
  text: string;
  kind: "text" | "system" | "voice" | "file" | "image" | "location" | "call" | "poll";
  attachment?: Attachment;
  location?: { lat: number; lng: number; label?: string };
  call?: CallInfo;
  replyTo?: { id: string; from: string; excerpt: string; kind: Msg["kind"] };
  auto?: boolean;
  readByOthers?: boolean;
  pending?: boolean;
  /** alleen in de browser: versturen mislukte, met de reden */
  failed?: string;
  reactions?: Record<string, string[]>;
  deleted?: boolean;
  forwarded?: boolean;
  /** bewerkt door de afzender: wanneer */
  editedAt?: string;
  /** kind "poll": keuzes en stemmen; de vraag staat in `text` (lib/messaging/poll.ts) */
  poll?: MessagePoll;
  /** @vermeldingen in een groep (userIds; lib/messaging/vermelding.ts) */
  mentions?: string[];
  /** spraakbericht: de uitgeschreven tekst; "" = geen spraak gehoord */
  transcript?: string;
  /** voorbeeld van de eerste link (zonder afbeelding) */
  linkVoorbeeld?: { url: string; host: string; titel: string; omschrijving?: string };
  /** foto die maar één keer te bekijken is, en wie hem al opende */
  eenmalig?: boolean;
  eenmaligGezien?: string[];
}

/** Je eigen tekstbericht mag je tot 24 uur na het versturen bewerken (gelijk aan lib/messaging/store EDIT_WINDOW_MS). */
export const EDIT_WINDOW_MS = 24 * 3_600_000;
export const canEdit = (m: Msg, myUserId: string | null | undefined, now = Date.now()): boolean =>
  Boolean(myUserId) && m.from === myUserId && m.kind === "text" && !m.deleted && !m.pending && now - new Date(m.at).getTime() < EDIT_WINDOW_MS;

/** Je eigen bericht voor iedereen verwijderen kan tot 48 uur na het versturen (gelijk aan lib/messaging/store DELETE_WINDOW_MS). */
export const DELETE_WINDOW_MS = 48 * 3_600_000;
export const canDeleteForAll = (m: Msg, myUserId: string | null | undefined, now = Date.now()): boolean =>
  Boolean(myUserId) && m.from === myUserId && !m.deleted && !m.pending && now - new Date(m.at).getTime() < DELETE_WINDOW_MS;

/** Telt als ongelezen: echte ongelezen berichten, of "Markeer als ongelezen" (een stip zonder aantal). */
export const isOngelezen = (t: Pick<ThreadRow, "unread" | "gemarkeerd">): boolean => t.unread > 0 || Boolean(t.gemarkeerd);

/** Zet reacties op een bericht (of haalt het veld weg als er geen zijn). */
export function withReactions(m: Msg, reactions: Record<string, string[]>): Msg {
  const next: Msg = { ...m };
  const cleaned: Record<string, string[]> = {};
  for (const [e, u] of Object.entries(reactions)) if (u.length) cleaned[e] = u;
  if (Object.keys(cleaned).length) next.reactions = cleaned;
  else delete next.reactions;
  return next;
}

/** Toggle één emoji-reactie van een gebruiker (max één emoji per persoon). */
export function toggleReaction(m: Msg, userId: string, emoji: string): Msg {
  const reactions: Record<string, string[]> = {};
  for (const [e, u] of Object.entries(m.reactions ?? {})) reactions[e] = u.filter((x) => x !== userId);
  const had = (m.reactions?.[emoji] ?? []).includes(userId);
  if (!had) reactions[emoji] = [...(reactions[emoji] ?? []), userId];
  return withReactions(m, reactions);
}

/** Een bericht dat je met een ster bewaarde (GET /api/inbox/bewaard, lib/messaging/bewaard.ts). */
export interface SavedMsg {
  threadId: string;
  messageId: string;
  excerpt: string;
  kind: Msg["kind"];
  from: string;
  at: string;
  savedAt: string;
}

export interface ThreadRow {
  id: string;
  kind: "direct" | "support" | "group";
  participants: string[];
  subject: string | null;
  title?: string | null;
  communityId?: string | null;
  shiftTitle: string | null;
  branch: string | null;
  lastMessage: { from: string; text: string; at: string } | null;
  lastMessageAt: string;
  unread: number;
  /** "Markeer als ongelezen" en geen echte ongelezen berichten */
  gemarkeerd?: boolean;
  /** per-user chat settings (lib/messaging/thread-prefs.ts) */
  archived?: boolean;
  muted?: boolean;
  locked?: boolean;
  favorite?: boolean;
  lists?: string[];
}

export const ROLE_COLOR: Record<string, string> = {
  freelancer: "#0E5C4A",
  employer: "#1D4ED8",
  admin: "#0C0E12",
  support: "#0C0E12",
};

export const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

// Dutch time, like every time on the platform (the server runs in UTC; lib/time/amsterdam)
export const fmtTime = (iso: string, tx: SharedTeksten = SHARED_NL) =>
  new Date(iso).toLocaleTimeString(tx.locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

const TZ = "Europe/Amsterdam";

/** Dagkop in een gesprek: Vandaag, Gisteren, maandag (deze week), 4 november, 4 november 2025. Nederlandse tijd. */
export function dayLabel(iso: string, now: Date = new Date(), tx: SharedTeksten = SHARED_NL): string {
  const key = amsterdamDayKey(iso);
  if (key === amsterdamDayKey(now)) return tx.vandaag;
  if (key === amsterdamDayKey(amsterdamStartOfDay(now, -1))) return tx.gisteren;
  const d = new Date(iso);
  if (d >= amsterdamStartOfDay(now, -6)) return d.toLocaleDateString(tx.locale, { weekday: "long", timeZone: TZ });
  const sameYear = amsterdamParts(d).year === amsterdamParts(now).year;
  return d.toLocaleDateString(tx.locale, { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }), timeZone: TZ });
}

/** Tijd in de gesprekkenlijst, zoals WhatsApp: 14:05, Gisteren, dinsdag, 28-10-26. */
export function listTime(iso: string, now: Date = new Date(), tx: SharedTeksten = SHARED_NL): string {
  const key = amsterdamDayKey(iso);
  if (key === amsterdamDayKey(now)) return amsterdamClock(iso);
  if (key === amsterdamDayKey(amsterdamStartOfDay(now, -1))) return tx.gisteren;
  const d = new Date(iso);
  if (d >= amsterdamStartOfDay(now, -6)) return d.toLocaleDateString(tx.locale, { weekday: "long", timeZone: TZ });
  return d.toLocaleDateString(tx.locale, { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: TZ });
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Scherm delen kan alleen in browsers op een computer; telefoons hebben geen getDisplayMedia. */
export function canShareScreen(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function lastSeenLabel(p: Presence | undefined, now: Date = new Date(), tx: SharedTeksten = SHARED_NL): string {
  if (!p) return "";
  if (p.online) return tx.online;
  if (!p.lastSeen) return "";
  const key = amsterdamDayKey(p.lastSeen);
  if (key === amsterdamDayKey(now)) return vulIn(tx.laatstGezienOm, { tijd: amsterdamClock(p.lastSeen) });
  if (key === amsterdamDayKey(amsterdamStartOfDay(now, -1))) return vulIn(tx.laatstGezienGisteren, { tijd: amsterdamClock(p.lastSeen) });
  return vulIn(tx.laatstGezien, { datum: new Date(p.lastSeen).toLocaleDateString(tx.locale, { day: "numeric", month: "short", timeZone: TZ }) });
}

/* ───────────── tekst in een bericht ───────────── */

export type TextPart = { link: false; text: string } | { link: true; text: string; href: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** Knipt een bericht in tekst en links (alleen http(s) en www.), zodat links aanklikbaar worden. */
export function linkParts(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    // leestekens achter een link horen bij de zin, niet bij de link
    const trail = /[.,!?;:)\]}'"]+$/.exec(url)?.[0] ?? "";
    if (trail) url = url.slice(0, -trail.length);
    if (!url) continue;
    const at = m.index ?? 0;
    if (at > last) out.push({ link: false, text: text.slice(last, at) });
    out.push({ link: true, text: url, href: /^https?:\/\//i.test(url) ? url : `https://${url}` });
    last = at + url.length;
  }
  if (last < text.length) out.push({ link: false, text: text.slice(last) });
  return out;
}

/** 1 tot 3 emoji zonder andere tekst → aantal (dan tonen we ze groot), anders 0. */
export function emojiOnlyCount(text: string): number {
  const t = text.trim();
  if (!t || t.length > 32 || /[0-9#*]/.test(t)) return 0;
  if (!/^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|\u200d|\ufe0f|\s)+$/u.test(t)) return 0;
  if (!/\p{Extended_Pictographic}/u.test(t)) return 0;
  const n =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? [...new Intl.Segmenter("nl", { granularity: "grapheme" }).segment(t.replace(/\s+/g, ""))].length
      : (t.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  return n <= 3 ? n : 0;
}

/* ───────────── lijst en gesprek ───────────── */

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Zoeken in de gesprekkenlijst: op naam, laatste bericht of klus, zonder hoofdletters/accenten. */
export function threadMatches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return fields.some((f) => (f ? fold(f).includes(q) : false));
}

/**
 * Het eerste ongelezen bericht bij het openen van een gesprek (voor de streep "3 ongelezen berichten"):
 * het n-de bericht van de ander, van achteren geteld. Systeemregels tellen niet mee.
 */
export function firstUnreadId(messages: Msg[], unread: number, myUserId: string | null | undefined): string | null {
  if (unread <= 0) return null;
  let seen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.from === myUserId || m.kind === "system") continue;
    seen++;
    if (seen === unread) return m.id;
  }
  return null;
}

export function avatarSrc(userId: string, avatars: Record<string, string>): string | null {
  return avatars[userId] ? `/api/profile/${userId}/avatar` : null;
}
