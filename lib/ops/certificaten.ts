import tls from "node:tls";
import { env } from "@/lib/env";
import { alertOwner, type OpsAlert } from "@/lib/ops/alert";

// ---------------------------------------------------------------------------
// Certificaten van onze domeinen (13 nov 2026, cert-ronde). Caddy vernieuwt zelf, ±30 dagen vooraf; lukt dat niet (DNS
// gewijzigd, poort 80 dicht, de uitgever blokkeert ons), dan stond dat alleen in het log van Caddy, en de rondgang zag
// het pas als het certificaat al verlopen was (de pagina's halen hem via https). Nu meet de rondgang elke nacht hoe lang
// elk certificaat nog geldt en waarschuwt de eigenaar 14 dagen vooraf (kritiek onder 7 dagen, of bij een verkeerd of
// onbetrouwbaar certificaat). We meten bij Caddy zelf (de dienst "caddy" in docker-compose.vps.yml), dus precies het
// certificaat dat wij uitgeven. Klantdomeinen (klantsites en rijscholen) zijn er sinds 22 nov 2026 niet meer (fase C):
// alleen het hoofdadres en www.
// ---------------------------------------------------------------------------

export const CERT_WAARSCHUW_DAGEN = 14;
export const CERT_KRITIEK_DAGEN = 7;
const CADDY = process.env.CADDY_HOST || "caddy";

export interface CertMeting {
  host: string;
  /** ISO-tijd; null = geen certificaat gekregen */
  geldigTot: string | null;
  /** iets mis met het certificaat (andere naam, niet vertrouwd) of de verbinding */
  fout?: string;
}

/** Het certificaat dat Caddy voor `host` geeft. Faalt nooit: een fout staat in de meting. */
export function leesCertificaat(host: string, opts: { via?: string; poort?: number; timeoutMs?: number } = {}): Promise<CertMeting> {
  return new Promise((resolve) => {
    const sock = tls.connect({ host: opts.via ?? CADDY, port: opts.poort ?? 443, servername: host, rejectUnauthorized: false });
    const klaar = (m: CertMeting) => {
      sock.destroy();
      resolve(m);
    };
    sock.setTimeout(opts.timeoutMs ?? 8000, () => klaar({ host, geldigTot: null, fout: "geen antwoord" }));
    sock.once("error", (err) => klaar({ host, geldigTot: null, fout: err.message.slice(0, 120) }));
    sock.once("secureConnect", () => {
      const cert = sock.getPeerCertificate();
      const t = cert?.valid_to ? Date.parse(cert.valid_to) : Number.NaN;
      if (Number.isNaN(t)) return klaar({ host, geldigTot: null, fout: "geen certificaat" });
      const geldigTot = new Date(t).toISOString();
      if (tls.checkServerIdentity(host, cert)) return klaar({ host, geldigTot, fout: "certificaat hoort bij een andere naam" });
      // verlopen meten we in dagen; elke andere reden (eigen certificaat van Caddy, onbekende uitgever) is een fout
      // (Node geeft hier de code als tekst, de typen zeggen Error: String() kan allebei aan)
      const reden = sock.authorized ? null : String(sock.authorizationError ?? "onbekend");
      if (reden && !reden.includes("CERT_HAS_EXPIRED")) return klaar({ host, geldigTot, fout: `niet vertrouwd (${reden.slice(0, 60)})` });
      klaar({ host, geldigTot });
    });
  });
}

const datumNl = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

/** De melding voor de eigenaar, of null als alles nog lang genoeg geldt. */
export function certOordeel(metingen: CertMeting[], now = Date.now()): OpsAlert | null {
  const regels: string[] = [];
  let kritiek = false;
  for (const m of metingen) {
    if (!m.geldigTot) {
      regels.push(`${m.host}: geen certificaat (${m.fout ?? "onbekend"})`);
      kritiek = true;
      continue;
    }
    if (m.fout) {
      regels.push(`${m.host}: ${m.fout}`);
      kritiek = true;
      continue;
    }
    const dagen = Math.floor((Date.parse(m.geldigTot) - now) / 86_400_000);
    if (dagen >= CERT_WAARSCHUW_DAGEN) continue;
    if (dagen < CERT_KRITIEK_DAGEN) kritiek = true;
    regels.push(dagen < 0 ? `${m.host}: verlopen op ${datumNl(m.geldigTot)}` : `${m.host}: verloopt over ${dagen} ${dagen === 1 ? "dag" : "dagen"} (${datumNl(m.geldigTot)})`);
  }
  if (regels.length === 0) return null;
  return {
    key: "tls:certificaten",
    title: regels.length === 1 ? "Certificaat van een domein niet in orde" : `${regels.length} certificaten niet in orde`,
    detail: `${regels.join(" · ")}. Caddy vernieuwt normaal 30 dagen vooraf; lukt dat niet, dan staat de reden in het log van Caddy ("obtaining certificate"). Meestal wijst de DNS niet (meer) naar de server of is poort 80 dicht.`,
    severity: kritiek ? "critical" : "warning",
    url: "/admin/systeem",
  };
}

/** Onze eigen domeinen: het hoofdadres en www. */
export function teMetenDomeinen(): string[] {
  const hoofd = new URL(env.APP_BASE_URL).hostname.toLowerCase();
  return [...new Set([hoofd, hoofd.startsWith("www.") ? hoofd.slice(4) : `www.${hoofd}`])];
}

/** Elke nacht mee met de rondgang: meten, en de eigenaar waarschuwen als een certificaat bijna verloopt of niet klopt. */
export async function controleerCertificaten(now = Date.now()): Promise<{ metingen: CertMeting[]; gemeld: boolean }> {
  const metingen: CertMeting[] = [];
  for (const host of teMetenDomeinen()) metingen.push(await leesCertificaat(host));
  const melding = certOordeel(metingen, now);
  if (melding) await alertOwner(melding);
  return { metingen, gemeld: Boolean(melding) };
}
