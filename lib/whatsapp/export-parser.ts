import { amsterdamToUtc } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Parser for WhatsApp's "Chat exporteren" text file. The format depends on
// phone OS and language:
//   Android  15-10-2026 09:41 - Jan de Vries: Hoi!
//   iPhone   [15-10-2026 09:41:12] Jan de Vries: Hoi!
//   US       10/15/26, 9:41 AM - Jan: Hi!
// Lines without a timestamp continue the previous message. Timestamps are the
// phone's local time, read as Europe/Amsterdam.
// ---------------------------------------------------------------------------

export interface WhatsAppMessage {
  at: string;
  author: string | null;
  text: string;
  /** media that was left out or attached by filename */
  media: boolean;
}

export interface WhatsAppChat {
  participants: string[];
  messages: WhatsAppMessage[];
}

const INVISIBLE = /[‎‏‪-‮﻿]/g;
const START =
  /^\[?(\d{1,4})[-/.](\d{1,2})[-/.](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s*([AaPp])\.?\s?[Mm]\.?)?\]?\s*(?:[-–]\s+)?(.*)$/;
const MEDIA =
  /<(?:bijgevoegd|attached|media weggelaten|media omitted)[^>]*>|\b(?:afbeelding|video|audio|sticker|GIF|document) weggelaten\b|\b(?:image|video|audio|sticker|GIF|document) omitted\b|<Media weggelaten>|<Media omitted>/i;

const SYSTEM_PHRASE =
  /\s(heeft|hebt|is|zijn|werd|changed|has|have|was|were|gewijzigd|toegevoegd|verwijderd|verlaten|aangemaakt|added|removed|left|created|joined)(\s|$)/i;

interface Raw {
  a: number;
  b: number;
  year: number;
  hour: number;
  minute: number;
  second: number;
  rest: string;
}

export function parseWhatsAppExport(source: string): WhatsAppChat {
  const lines = source.replace(INVISIBLE, "").split(/\r?\n/);
  const raws: Raw[] = [];
  let current: Raw | null = null;
  for (const line of lines) {
    const m = START.exec(line);
    if (m) {
      const [, p1, p2, p3, hh, mm, ss, ampm, rest] = m;
      let year = Number(p3);
      let a = Number(p1);
      let b = Number(p2);
      if (p1!.length === 4) {
        // ISO-style 2026-10-15
        year = Number(p1);
        a = Number(p3);
        b = Number(p2);
      }
      if (year < 100) year += 2000;
      let hour = Number(hh);
      if (ampm) {
        const pm = ampm.toLowerCase() === "p";
        if (hour === 12) hour = pm ? 12 : 0;
        else if (pm) hour += 12;
      }
      current = { a, b, year, hour, minute: Number(mm), second: Number(ss ?? 0), rest: rest ?? "" };
      raws.push(current);
    } else if (current && line.trim()) {
      current.rest += `\n${line}`;
    }
  }

  // Day-month or month-day? Decide once for the whole file: a first field over
  // 12 must be the day, a second field over 12 must be the day. Default: Dutch order.
  const monthFirst = raws.some((r) => r.b > 12) && !raws.some((r) => r.a > 12);

  const participants = new Set<string>();
  const messages: WhatsAppMessage[] = [];
  for (const r of raws) {
    const day = monthFirst ? r.b : r.a;
    const month = monthFirst ? r.a : r.b;
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const at = amsterdamToUtc(r.year, month, day, r.hour, r.minute, r.second).toISOString();
    const colon = r.rest.indexOf(": ");
    const firstLineEnd = r.rest.indexOf("\n");
    // a sender name sits before ": " on the first line; system lines have none,
    // though some ("… gewijzigd in: Team") do contain a colon
    const candidate = colon > 0 ? r.rest.slice(0, colon) : "";
    const hasAuthor =
      colon > 0 && (firstLineEnd === -1 || colon < firstLineEnd) && colon <= 60 && !SYSTEM_PHRASE.test(candidate);
    const author = hasAuthor ? r.rest.slice(0, colon).trim() : null;
    const text = (hasAuthor ? r.rest.slice(colon + 2) : r.rest).trim();
    if (author) participants.add(author);
    messages.push({ at, author, text, media: MEDIA.test(text) });
  }
  return { participants: [...participants], messages };
}
