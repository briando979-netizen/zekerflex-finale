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
  return (
    v6 === "::" ||
    v6 === "::1" ||
    /^fe[89ab]/.test(v6) || // link-local fe80::/10
    /^f[cd]/.test(v6) || // unique local fc00::/7
    v6.startsWith("ff") // multicast
  );
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
