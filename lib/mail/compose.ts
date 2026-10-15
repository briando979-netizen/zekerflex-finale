import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Plain-text RFC 5322 message for mail a user sends from their own connected
// mailbox. Every header value passes through oneLine() — user input must not
// be able to start a new header line.
// ---------------------------------------------------------------------------

const ADDRESS = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;

export function isPlainAddress(s: string): boolean {
  return ADDRESS.test(s.trim()) && s.trim().length <= 254;
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

function encodeWord(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function wrap64(s: string): string {
  return (Buffer.from(s, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");
}

export interface PlainMessage {
  fromAddress: string;
  fromName?: string | null;
  to: string;
  subject: string;
  text: string;
  /** Message-ID being answered (no angle brackets) */
  inReplyTo?: string | null;
}

export function buildPlainMessage(m: PlainMessage): { raw: string; messageId: string } {
  if (!isPlainAddress(m.fromAddress) || !isPlainAddress(m.to)) throw new Error("compose: invalid address");
  const domain = m.fromAddress.split("@")[1]!;
  const messageId = `${randomUUID()}@${domain}`;
  const name = m.fromName ? oneLine(m.fromName).replace(/"/g, "'") : "";
  // an encoded-word may not sit inside a quoted string (RFC 2047 §5)
  const display = !name ? "" : encodeWord(name) === name ? `"${name}" ` : `${encodeWord(name)} `;
  const replyRef = m.inReplyTo && /^[\x21-\x7e]{3,250}$/.test(m.inReplyTo) && !/[<>]/.test(m.inReplyTo) ? m.inReplyTo : null;
  const headers = [
    `From: ${display}<${m.fromAddress.trim()}>`,
    `To: <${m.to.trim()}>`,
    `Subject: ${encodeWord(oneLine(m.subject))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}>`,
    ...(replyRef ? [`In-Reply-To: <${replyRef}>`, `References: <${replyRef}>`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  return { raw: [...headers, "", wrap64(m.text), ""].join("\r\n"), messageId };
}
