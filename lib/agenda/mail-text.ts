// ---------------------------------------------------------------------------
// Mail clean-up before the agenda reads it: the quoted conversation below a
// reply ("Op do 15 okt 2026 om 09:12 schreef Jan:") is full of dates and
// times that are not new appointments, and bulk mail isn't someone making an
// appointment with you.
// ---------------------------------------------------------------------------

const REPLY_HEADER =
  /^\s*(?:Op\s.{4,120}\s(?:schreef|heeft)\b.*:\s*$|On\s.{4,120}\swrote:\s*$|-{2,}\s*(?:Oorspronkelijk bericht|Origineel bericht|Original Message|Doorgestuurd bericht|Forwarded message)\s*-{2,}.*$|_{8,}\s*$)/i;
const HEADER_BLOCK_START = /^\s*(?:Van|From):\s.+/i;
const HEADER_BLOCK_NEXT = /^\s*(?:Verzonden|Sent|Datum|Date|Aan|To):\s/i;

/** The new part of a mail: drops "> quoted" lines and everything from the reply/forward header down. */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (REPLY_HEADER.test(line)) break;
    if (HEADER_BLOCK_START.test(line) && HEADER_BLOCK_NEXT.test(lines[i + 1] ?? "")) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

/** Newsletters, no-reply robots and bounces — not a person making an appointment. */
export function isBulkSender(address: string | null, name: string | null): boolean {
  return /\b(no-?reply|do-?not-?reply|nieuwsbrief|newsletter|mailer-daemon|postmaster|bounce|notifications?|marketing|nieuws)\b/i.test(
    `${address ?? ""} ${name ?? ""}`,
  );
}

/** "Re: Fwd: Afspraak dinsdag" → "Afspraak dinsdag". */
export function cleanSubject(subject: string | null): string | null {
  const s = (subject ?? "").replace(/^\s*((re|fw|fwd|antw|doorst)\s*:\s*)+/i, "").trim();
  return s || null;
}
