import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// ---------------------------------------------------------------------------
// A server a user types in (their own mail host) must be a public internet
// address — never loopback, the private LAN, link-local / cloud metadata or
// carrier-grade NAT — or the platform becomes a proxy into its own network.
// Callers connect to the returned, already-vetted IP (with the hostname kept
// for TLS), so a DNS answer that changes between check and connect can't
// slip a private address in.
// ---------------------------------------------------------------------------

export class HostRejectedError extends Error {}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number, number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateAddress(mapped[1]!);
  // IPv6-vormen die een IPv4-adres verbergen: ::ffff:7f00:1 (= 127.0.0.1), ::7f00:1,
  // 64:ff9b::7f00:1 (NAT64), 2002:7f00:1::(6to4). Uitvouwen en het IPv4-adres erin keuren.
  const woorden = vouwUit(v6);
  if (woorden) {
    const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    const [w0 = 0, w1 = 0, w2 = 0, w3 = 0, w4 = 0, w5 = 0, w6 = 0, w7 = 0] = woorden;
    if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && (w5 === 0xffff || w5 === 0)) return isPrivateAddress(v4(w6, w7));
    if (w0 === 0x64 && w1 === 0xff9b && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) return isPrivateAddress(v4(w6, w7));
    if (w0 === 0x2002) return isPrivateAddress(v4(w1, w2));
    if (w0 === 0x2001 && w1 === 0) return true; // Teredo: het achterliggende adres is niet te vertrouwen
  }
  return (
    v6 === "::" ||
    v6 === "::1" ||
    /^fe[89ab]/.test(v6) || // link-local fe80::/10
    /^f[cd]/.test(v6) || // unique local fc00::/7
    v6.startsWith("ff") // multicast
  );
}

/** Een IPv6-adres als acht getallen (0–65535), of null als het niet te lezen is. */
function vouwUit(v6: string): number[] | null {
  const kaal = v6.replace(/%.*$/, "");
  const delen = kaal.split("::");
  if (delen.length > 2) return null;
  const links = delen[0] ? delen[0].split(":") : [];
  const rechts = delen.length === 2 && delen[1] ? delen[1].split(":") : [];
  const laatste = rechts.length ? rechts[rechts.length - 1] : links[links.length - 1];
  // een IPv4-staart (…:1.2.3.4) telt als twee woorden
  const staart: number[] = [];
  if (laatste && laatste.includes(".")) {
    const o = laatste.split(".").map(Number);
    if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    staart.push(((o[0] ?? 0) << 8) | (o[1] ?? 0), ((o[2] ?? 0) << 8) | (o[3] ?? 0));
    (rechts.length ? rechts : links).pop();
  }
  const naarWoord = (h: string) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN);
  const l = links.map(naarWoord);
  const r = [...rechts.map(naarWoord), ...staart];
  if ([...l, ...r].some(Number.isNaN)) return null;
  const vulling = 8 - l.length - r.length;
  if (delen.length === 2 ? vulling < 1 : vulling !== 0) return null;
  return [...l, ...new Array<number>(delen.length === 2 ? vulling : 0).fill(0), ...r];
}

/** Resolves `host` and returns one public address to connect to, or throws HostRejectedError. */
export async function resolvePublicHost(host: string): Promise<string> {
  const h = host.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(h) || h === "localhost" || /\.(local|internal|localhost)$/.test(h)) {
    throw new HostRejectedError(`"${host}" is geen geldige servernaam`);
  }
  let addresses: string[];
  try {
    addresses = isIP(h) ? [h] : (await lookup(h, { all: true })).map((a) => a.address);
  } catch {
    throw new HostRejectedError(`Server "${host}" niet gevonden`);
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new HostRejectedError(`Server "${host}" is geen openbaar internetadres`);
  }
  return addresses[0]!;
}
