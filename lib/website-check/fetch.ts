import http from "node:http";
import https from "node:https";
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { isIP } from "node:net";
import zlib from "node:zlib";
import { isPrivateAddress } from "@/lib/security/public-host";

// ---------------------------------------------------------------------------
// Een website ophalen die een bezoeker intypt. De server mag daarbij nooit een
// doorgeefluik naar zijn eigen netwerk worden (app, postgres, ollama, cloud-
// metadata): alleen http(s) op poort 80/443, geen IP-adressen uit privé-
// reeksen, en de DNS-controle zit in de verbinding zelf (lookup), zodat een
// naam die tussen controle en verbinden van adres wisselt er niet doorheen
// glipt. Elke redirect wordt opnieuw gecontroleerd. Antwoorden zijn begrensd
// in tijd en grootte.
// ---------------------------------------------------------------------------

export const USER_AGENT = "ZekerFlexWebsiteCheck/1.0 (+https://zekerflex.com/website-check)";
const MAX_TRANSFER_BYTES = 3_000_000;
const MAX_BODY_BYTES = 5_000_000;

export class FetchError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_URL" | "BLOCKED" | "DNS" | "TLS" | "TIMEOUT" | "NETWORK" | "REDIRECTS",
  ) {
    super(message);
  }
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  /** bytes over de lijn (gecomprimeerd) */
  transferBytes: number;
  /** bytes na uitpakken */
  bytes: number;
  ttfbMs: number;
  totalMs: number;
  redirects: string[];
  truncated: boolean;
}

/** Gooit FetchError als dit adres niet opgehaald mag worden. */
export function assertFetchableUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchError("Dit is geen geldig webadres.", "INVALID_URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchError("Alleen http- en https-adressen kunnen we controleren.", "INVALID_URL");
  if (u.username || u.password) throw new FetchError("Een adres met inloggegevens erin controleren we niet.", "INVALID_URL");
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443) throw new FetchError("Alleen websites op de gewone poorten (80 en 443).", "BLOCKED");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new FetchError("Dit is geen openbaar internetadres.", "BLOCKED");
  } else if (!host.includes(".") || host === "localhost" || /\.(local|localhost|internal|lan|home|corp|intranet)$/.test(host)) {
    throw new FetchError("Dit is geen openbaar internetadres.", "BLOCKED");
  }
  return u;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS-opzoeking die privé-adressen weigert; wordt door de verbinding zelf gebruikt. */
export function guardedLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      const blocked: NodeJS.ErrnoException = new Error(`${hostname} is geen openbaar internetadres`);
      blocked.code = "ZF_BLOCKED";
      return callback(blocked, "", 4);
    }
    if (options.all) return callback(null, addresses);
    const first = addresses[0]!;
    return callback(null, first.address, first.family);
  });
}

const TLS_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_NOT_YET_VALID",
]);

function toFetchError(err: NodeJS.ErrnoException, host: string): FetchError {
  if (err instanceof FetchError) return err;
  const code = err.code ?? "";
  if (code === "ZF_BLOCKED") return new FetchError("Dit is geen openbaar internetadres.", "BLOCKED");
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return new FetchError(`We kunnen ${host} niet vinden. Klopt het adres?`, "DNS");
  if (code === "CERT_HAS_EXPIRED") return new FetchError(`Het beveiligingscertificaat van ${host} is verlopen. Bezoekers krijgen een waarschuwing in hun browser.`, "TLS");
  if (TLS_CODES.has(code)) return new FetchError(`Het beveiligingscertificaat van ${host} klopt niet. Bezoekers krijgen een waarschuwing in hun browser.`, "TLS");
  if (code === "ECONNREFUSED") return new FetchError(`${host} weigert de verbinding.`, "NETWORK");
  return new FetchError(`We konden ${host} niet bereiken.`, "NETWORK");
}

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  raw: Buffer;
  transferBytes: number;
  ttfbMs: number;
  truncated: boolean;
}

function flatHeaders(h: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

function requestOnce(url: URL, opts: { timeoutMs: number; headersOnly: boolean; maxBytes: number }): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const mod = url.protocol === "https:" ? https : http;
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      fn();
    };
    const req = mod.request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: guardedLookup,
        timeout: opts.timeoutMs,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "nl-NL,nl;q=0.9,en;q=0.7",
        },
      },
      (res) => {
        const ttfbMs = performance.now() - started;
        const headers = flatHeaders(res.headers);
        const status = res.statusCode ?? 0;
        if (opts.headersOnly) {
          res.destroy();
          return done(() => resolve({ status, headers, raw: Buffer.alloc(0), transferBytes: 0, ttfbMs, truncated: false }));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.maxBytes) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        const finish = () => done(() => resolve({ status, headers, raw: Buffer.concat(chunks), transferBytes: Math.min(size, opts.maxBytes), ttfbMs, truncated }));
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", (e) => (truncated ? finish() : done(() => reject(toFetchError(e, url.hostname)))));
      },
    );
    const deadline = setTimeout(() => {
      req.destroy();
      done(() => reject(new FetchError(`${url.hostname} reageerde niet binnen ${Math.round(opts.timeoutMs / 1000)} seconden.`, "TIMEOUT")));
    }, opts.timeoutMs);
    req.on("timeout", () => {
      req.destroy();
      done(() => reject(new FetchError(`${url.hostname} reageerde niet binnen ${Math.round(opts.timeoutMs / 1000)} seconden.`, "TIMEOUT")));
    });
    req.on("error", (e: NodeJS.ErrnoException) => done(() => reject(toFetchError(e, url.hostname))));
    req.end();
  });
}

function decode(raw: Buffer, encoding: string | undefined, maxBytes: number): Buffer {
  const enc = (encoding ?? "").toLowerCase().trim();
  try {
    if (enc === "gzip" || enc === "x-gzip") return zlib.gunzipSync(raw, { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: maxBytes });
    if (enc === "deflate") return zlib.inflateSync(raw, { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: maxBytes });
    if (enc === "br") return zlib.brotliDecompressSync(raw, { finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH, maxOutputLength: maxBytes });
  } catch {
    return Buffer.alloc(0);
  }
  return raw.subarray(0, maxBytes);
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);

export interface FetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  headersOnly?: boolean;
  /** maximale grootte over de lijn; standaard 3 MB (genoeg voor een HTML-pagina) */
  maxBytes?: number;
}

/** Zoals fetchPage, maar met de ruwe bytes (afbeeldingen, lettertypes). */
export async function fetchResource(rawUrl: string, opts: FetchOptions = {}): Promise<Omit<FetchedPage, "body"> & { data: Buffer }> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  const maxBytes = opts.maxBytes ?? MAX_TRANSFER_BYTES;
  const started = performance.now();
  const redirects: string[] = [];
  let current = assertFetchableUrl(rawUrl);
  for (let hop = 0; ; hop++) {
    const res = await requestOnce(current, { timeoutMs, headersOnly: Boolean(opts.headersOnly), maxBytes });
    const location = res.headers.location;
    if (REDIRECT.has(res.status) && location) {
      if (hop >= maxRedirects) throw new FetchError("Deze website stuurt te vaak door.", "REDIRECTS");
      redirects.push(current.toString());
      current = assertFetchableUrl(new URL(location, current).toString());
      continue;
    }
    const data = decode(res.raw, res.headers["content-encoding"], Math.max(maxBytes, MAX_BODY_BYTES));
    return {
      url: rawUrl,
      finalUrl: current.toString(),
      status: res.status,
      headers: res.headers,
      data,
      transferBytes: res.transferBytes,
      bytes: data.length,
      ttfbMs: Math.round(res.ttfbMs),
      totalMs: Math.round(performance.now() - started),
      redirects,
      truncated: res.truncated,
    };
  }
}

/** Haalt een pagina op en volgt maximaal `maxRedirects` doorverwijzingen, elk opnieuw gecontroleerd. */
export async function fetchPage(rawUrl: string, opts: FetchOptions = {}): Promise<FetchedPage> {
  const { data, ...rest } = await fetchResource(rawUrl, opts);
  return { ...rest, body: data.toString("utf8") };
}
