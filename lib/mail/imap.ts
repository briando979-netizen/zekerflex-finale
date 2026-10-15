import tls from "node:tls";
import net from "node:net";

// ---------------------------------------------------------------------------
// Minimal read-only IMAP client — zero dependencies, same spirit as the
// from-scratch SMTP client in lib/mail/smtp.ts. Just enough IMAP4rev1 to list
// recent messages (UID/FLAGS/ENVELOPE) and fetch one message's text body, for
// the admin "Postvak in" view. Not a general-purpose IMAP library: no IDLE,
// no write operations beyond marking \Seen, no folder management.
// ---------------------------------------------------------------------------

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  timeout?: number;
}

export interface ImapEnvelope {
  uid: number;
  seq: number;
  date: string | null;
  subject: string | null;
  fromName: string | null;
  fromAddress: string | null;
  seen: boolean;
}

class ImapError extends Error {}

/** Buffers arbitrary socket chunks into line- and byte-addressable reads. */
class ByteStream {
  private chunks: Buffer[] = [];
  private waiting: (() => void)[] = [];
  private ended = false;
  private err: Error | null = null;

  constructor(sock: net.Socket | tls.TLSSocket) {
    sock.on("data", (d: Buffer) => {
      this.chunks.push(d);
      this.wake();
    });
    sock.on("end", () => {
      this.ended = true;
      this.wake();
    });
    sock.on("close", () => {
      this.ended = true;
      this.wake();
    });
    sock.on("error", (e) => {
      this.err = e;
      this.ended = true;
      this.wake();
    });
  }

  private wake() {
    const w = this.waiting.splice(0);
    w.forEach((fn) => fn());
  }

  private buffered(): Buffer {
    if (this.chunks.length > 1) this.chunks = [Buffer.concat(this.chunks)];
    return this.chunks[0] ?? Buffer.alloc(0);
  }

  private async waitForMore(): Promise<void> {
    if (this.err) throw this.err;
    if (this.ended) throw new ImapError("IMAP connection closed unexpectedly");
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  async readBytes(n: number): Promise<Buffer> {
    for (;;) {
      const buf = this.buffered();
      if (buf.length >= n) {
        this.chunks = [buf.subarray(n)];
        return buf.subarray(0, n);
      }
      await this.waitForMore();
    }
  }

  async readLine(): Promise<string> {
    for (;;) {
      const buf = this.buffered();
      const idx = buf.indexOf("\r\n");
      if (idx !== -1) {
        this.chunks = [buf.subarray(idx + 2)];
        return buf.subarray(0, idx).toString("utf8");
      }
      await this.waitForMore();
    }
  }

  /** One logical IMAP response line, inlining any {n}-byte literals as quoted strings. */
  async readResponseLine(): Promise<string> {
    let line = await this.readLine();
    for (;;) {
      const m = /\{(\d+)\}$/.exec(line);
      if (!m) return line;
      const n = Number(m[1]);
      const literal = await this.readBytes(n);
      // Keep CRLFs intact — MIME body parsing depends on the literal \r\n\r\n
      // header/body separator surviving the round trip through this string.
      const escaped = literal.toString("utf8").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      line = `${line.slice(0, m.index)}"${escaped}"`;
      line += await this.readLine();
    }
  }
}

// ---- tiny IMAP s-expression parser (atoms / quoted strings / NIL / lists) ----
function parseSexp(s: string, pos: { i: number }): unknown {
  while (s[pos.i] === " ") pos.i++;
  if (s[pos.i] === "(") {
    pos.i++;
    const out: unknown[] = [];
    while (s[pos.i] === " ") pos.i++;
    while (pos.i < s.length && s[pos.i] !== ")") {
      out.push(parseSexp(s, pos));
      while (s[pos.i] === " ") pos.i++;
    }
    pos.i++; // skip ')'
    return out;
  }
  if (s[pos.i] === '"') {
    pos.i++;
    let out = "";
    while (pos.i < s.length && s[pos.i] !== '"') {
      if (s[pos.i] === "\\") {
        out += s[pos.i + 1];
        pos.i += 2;
      } else {
        out += s[pos.i];
        pos.i++;
      }
    }
    pos.i++; // skip closing quote
    return out;
  }
  const start = pos.i;
  while (pos.i < s.length && !/[\s()]/.test(s[pos.i]!)) pos.i++;
  const atom = s.slice(start, pos.i);
  if (atom === "NIL") return null;
  return atom;
}

function parseParenListAfter(line: string, keyword: string): unknown[] | null {
  const idx = line.indexOf(keyword);
  if (idx === -1) return null;
  const pos = { i: idx + keyword.length };
  const value = parseSexp(line, pos);
  return Array.isArray(value) ? value : null;
}

function decodeQ(text: string): Buffer {
  const bytes: number[] = [];
  const raw = text.replace(/_/g, " ");
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "=" && i + 2 < raw.length && /[0-9A-Fa-f]{2}/.test(raw.slice(i + 1, i + 3))) {
      bytes.push(parseInt(raw.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(raw.charCodeAt(i));
    }
  }
  return Buffer.from(bytes);
}

/** Decodes RFC 2047 encoded-words (=?UTF-8?B?...?= / =?UTF-8?Q?...?=) in headers like Subject/From. */
export function decodeMimeWords(s: string): string {
  return s.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_m, charset: string, enc: string, text: string) => {
    try {
      const cs: BufferEncoding = /utf-?8/i.test(charset) ? "utf8" : "latin1";
      if (enc.toUpperCase() === "B") return Buffer.from(text, "base64").toString(cs);
      return decodeQ(text).toString(cs);
    } catch {
      return text;
    }
  });
}

function addressFromList(list: unknown): { name: string | null; address: string | null } {
  if (!Array.isArray(list) || list.length === 0) return { name: null, address: null };
  const first = list[0];
  if (!Array.isArray(first)) return { name: null, address: null };
  const [name, , mailbox, host] = first as unknown[];
  const n = typeof name === "string" ? decodeMimeWords(name) : null;
  const addr = typeof mailbox === "string" && typeof host === "string" ? `${mailbox}@${host}` : null;
  return { name: n, address: addr };
}

async function connect(cfg: ImapConfig): Promise<{ sock: net.Socket | tls.TLSSocket; bs: ByteStream }> {
  const timeoutMs = (cfg.timeout ?? 20) * 1000;
  const sock = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
    const s = cfg.secure
      ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, rejectUnauthorized: false })
      : net.connect({ host: cfg.host, port: cfg.port });
    const t = setTimeout(() => {
      s.destroy();
      reject(new ImapError(`IMAP connect timeout (${cfg.host}:${cfg.port})`));
    }, timeoutMs);
    s.once(cfg.secure ? "secureConnect" : "connect", () => {
      clearTimeout(t);
      resolve(s);
    });
    s.once("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
  const bs = new ByteStream(sock);
  await bs.readResponseLine(); // server greeting ("* OK ...")
  return { sock, bs };
}

let tagCounter = 0;
function nextTag(): string {
  tagCounter = (tagCounter + 1) % 10000;
  return `z${tagCounter}`;
}

/** Sends a tagged command and returns every response line up to (and including) the tagged completion. */
async function command(sock: net.Socket | tls.TLSSocket, bs: ByteStream, line: string, timeoutMs: number): Promise<string[]> {
  const tag = nextTag();
  sock.write(`${tag} ${line}\r\n`);
  const lines: string[] = [];
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) throw new ImapError(`IMAP command timed out: ${line}`);
    const resp = await bs.readResponseLine();
    lines.push(resp);
    if (resp.startsWith(`${tag} `)) {
      if (!/^\S+ OK/i.test(resp)) throw new ImapError(`IMAP command failed: ${line} -> ${resp}`);
      return lines;
    }
  }
}

function quote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Recent messages in INBOX, newest first — UID, FLAGS and ENVELOPE only (no bodies, for a fast list view). */
export async function fetchInboxList(cfg: ImapConfig, limit = 50): Promise<ImapEnvelope[]> {
  const timeoutMs = (cfg.timeout ?? 20) * 1000;
  const { sock, bs } = await connect(cfg);
  try {
    await command(sock, bs, `LOGIN ${quote(cfg.user)} ${quote(cfg.pass)}`, timeoutMs);
    const selectLines = await command(sock, bs, "SELECT INBOX", timeoutMs);
    let exists = 0;
    for (const l of selectLines) {
      const m = /^\* (\d+) EXISTS/i.exec(l);
      if (m) exists = Number(m[1]);
    }
    if (exists === 0) return [];

    const start = Math.max(1, exists - limit + 1);
    const fetchLines = await command(sock, bs, `FETCH ${start}:${exists} (UID FLAGS ENVELOPE)`, timeoutMs);

    const out: ImapEnvelope[] = [];
    for (const l of fetchLines) {
      const m = /^\* (\d+) FETCH/i.exec(l);
      if (!m) continue;
      const seq = Number(m[1]);
      // UID is a bare number in the response ("UID 123"), not a parenthesized list.
      const uidMatch = /UID (\d+)/i.exec(l);
      const flagsList = parseParenListAfter(l, "FLAGS ") ?? [];
      const seen = flagsList.some((f) => typeof f === "string" && f.toUpperCase() === "\\SEEN");
      const envList = parseParenListAfter(l, "ENVELOPE ");
      const [date, subject, from] = (envList ?? []) as unknown[];
      const { name: fromName, address: fromAddress } = addressFromList(from);
      if (!uidMatch) continue;
      out.push({
        uid: Number(uidMatch[1]),
        seq,
        date: typeof date === "string" ? date : null,
        subject: typeof subject === "string" ? decodeMimeWords(subject) : null,
        fromName,
        fromAddress,
        seen,
      });
    }
    await command(sock, bs, "LOGOUT", 5000).catch(() => undefined);
    return out.sort((a, b) => b.uid - a.uid);
  } finally {
    sock.destroy();
  }
}

interface MimePart {
  contentType: string;
  encoding: string;
  body: Buffer;
}

function splitHeadersBody(raw: Buffer): { headers: string; body: Buffer } {
  const sep = raw.indexOf("\r\n\r\n");
  if (sep === -1) return { headers: raw.toString("utf8"), body: Buffer.alloc(0) };
  return { headers: raw.subarray(0, sep).toString("utf8"), body: raw.subarray(sep + 4) };
}

function headerValue(headers: string, name: string): string | null {
  // Unfold continuation lines (header values can wrap onto lines starting with whitespace).
  const unfolded = headers.replace(/\r\n[ \t]+/g, " ");
  const m = new RegExp(`^${name}:\\s*(.*)$`, "im").exec(unfolded);
  return m ? m[1]!.trim() : null;
}

function decodeBody(body: Buffer, encoding: string | null): Buffer {
  const enc = (encoding ?? "7bit").toLowerCase();
  if (enc === "base64") {
    try {
      return Buffer.from(body.toString("utf8").replace(/\s+/g, ""), "base64");
    } catch {
      return body;
    }
  }
  if (enc === "quoted-printable") {
    return decodeQ(body.toString("binary").replace(/=\r\n/g, ""));
  }
  return body;
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Walks a (possibly multipart) MIME message and returns the first matching part, preferring text/plain. */
function walkMime(raw: Buffer): MimePart[] {
  const { headers, body } = splitHeadersBody(raw);
  const contentType = headerValue(headers, "Content-Type") ?? "text/plain";
  const boundaryMatch = /boundary="?([^";]+)"?/i.exec(contentType);

  if (!/^multipart\//i.test(contentType) || !boundaryMatch) {
    const encoding = headerValue(headers, "Content-Transfer-Encoding");
    return [{ contentType: contentType.split(";")[0]!.trim().toLowerCase(), encoding: encoding ?? "7bit", body }];
  }

  const boundary = boundaryMatch[1]!;
  const delimiter = `--${boundary}`;
  const text = body.toString("binary");
  const segments = text.split(delimiter).slice(1, -1); // drop preamble and trailing "--" epilogue
  const parts: MimePart[] = [];
  for (const seg of segments) {
    const partBuf = Buffer.from(seg.replace(/^\r\n/, ""), "binary");
    parts.push(...walkMime(partBuf));
  }
  return parts;
}

/** Plain-text rendering of one message's body (best effort — prefers text/plain, falls back to stripped text/html). */
export async function fetchMessageText(cfg: ImapConfig, uid: number): Promise<string> {
  const timeoutMs = (cfg.timeout ?? 20) * 1000;
  const { sock, bs } = await connect(cfg);
  try {
    await command(sock, bs, `LOGIN ${quote(cfg.user)} ${quote(cfg.pass)}`, timeoutMs);
    await command(sock, bs, "SELECT INBOX", timeoutMs);
    const lines = await command(sock, bs, `UID FETCH ${uid} (BODY.PEEK[])`, timeoutMs);
    await command(sock, bs, "LOGOUT", 5000).catch(() => undefined);

    // The literal was inlined as a quoted string by readResponseLine() — pull
    // it back out of the one `* n FETCH (... BODY[] "...")` line.
    const fetchLine = lines.find((l) => /FETCH/i.test(l) && /BODY\[\]/i.test(l));
    if (!fetchLine) return "(kon bericht niet laden)";
    const pos = { i: fetchLine.indexOf("BODY[]") + "BODY[]".length };
    while (fetchLine[pos.i] === " ") pos.i++;
    const value = parseSexp(fetchLine, pos);
    if (typeof value !== "string") return "(leeg bericht)";
    const raw = Buffer.from(value, "utf8");

    const parts = walkMime(raw);
    const plain = parts.find((p) => p.contentType === "text/plain");
    if (plain) return decodeBody(plain.body, plain.encoding).toString("utf8").trim();
    const html = parts.find((p) => p.contentType === "text/html");
    if (html) return stripTags(decodeBody(html.body, html.encoding).toString("utf8"));
    const any = parts[0];
    return any ? decodeBody(any.body, any.encoding).toString("utf8").trim() : "(leeg bericht)";
  } finally {
    sock.destroy();
  }
}

/** True when IMAP_HOST/USER/PASS (or their SMTP fallbacks) resolve to something usable. */
export function imapConfigured(cfg: Partial<ImapConfig>): cfg is ImapConfig {
  return Boolean(cfg.host && cfg.user && cfg.pass);
}
