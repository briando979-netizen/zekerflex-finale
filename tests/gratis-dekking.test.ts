import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GRATIS_DIENSTEN } from "@/lib/gratis/diensten";

// Bewaker (13 nov 2026, AGENTS.md "Alles gratis"): elke koppeling naar buiten staat in lib/gratis/diensten.ts
// (Admin -> Alles gratis), met een eigen alternatief. Deze test zoekt in lib/ en app/api/ naar hosts van buiten
// (https://...). Elke host moet in een dienst staan (veld `hosts`) of hieronder op de basislijn, met een reden.
// Een nieuwe host zonder een van beide faalt: zet hem in diensten.ts als het een echte koppeling is, of op de
// basislijn als het alleen een link, een standaard of een eigen adres is. Commentaar telt niet mee.

const ROOT = process.cwd();
const HOST = /https?:\/\/([A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}|localhost|[a-z0-9-]+:\d+)/g;

function groep(reden: string, hosts: string[]): Record<string, string> {
  return Object.fromEntries(hosts.map((h) => [h, reden]));
}

/** Hosts die bewust niet in diensten.ts staan, per host met de reden. */
const BASISLIJN: Record<string, string> = {
  ...groep("eigen domein of een eigen dienst in ons netwerk (geen derde partij)", [
    "zekerflex.com", "localhost", "app:3000", "bouwer:4100", "android-bouwer:4300", "scraper:4300", "headscale:8080",
    "crowdsec:8080", "whatsapp-brug:3900", "ollama:11434", "git.37-97-226-24.sslip.io",
  ]),
  ...groep("voorbeeldnaam in een tekst of formulier (jouwdomein, jouwbedrijf), geen aanroep", [
    "code.jouwdomein.nl", "term.jouwdomein.nl", "jouwbedrijf.nl", "schwarzwald.stackbase.nl",
  ]),
  ...groep("standaard of naamruimte (XML, SVG, JSON-LD, sitemap), geen aanroep", [
    "schema.org", "www.w3.org", "www.sitemaps.org", "graphml.graphdrawing.org", "www.topografix.com", "www.auditfiles.nl",
  ]),
  ...groep("al gedekt als koppeling: Stripe (betalen) en pdok/OSM/VIES/Google/Apple op de afgesproken lijst; hier alleen link of inlog", [
    "dashboard.stripe.com", "stripe.com", "ec.europa.eu", "accounts.google.com", "oauth2.googleapis.com",
    "openidconnect.googleapis.com", "www.googleapis.com", "appleid.apple.com", "apps.apple.com", "play.google.com",
  ]),
  ...groep("standaardadres in lib/env.ts dat nergens wordt aangeroepen", ["api.openov.nl"]),
  ...groep("link naar een sociaal netwerk of een Google-pagina voor de gebruiker (geen koppeling; plaatsen gaat met de hand)", [
    "instagram.com", "www.instagram.com", "www.facebook.com", "nl-nl.facebook.com", "twitter.com", "x.com", "www.linkedin.com",
    "www.tiktok.com", "www.youtube.com", "studio.youtube.com", "business.google.com", "search.google.com", "www.google.com",
    "groups.google.com", "base.google.com", "wa.me",
  ]),
  ...groep("link of knop naar de webmail of agenda van de gebruiker zelf", [
    "calendar.google.com", "outlook.live.com", "mail.google.com", "mail.proton.me", "mail.yahoo.com", "www.icloud.com",
  ]),
  ...groep("klik-om-af-te-spelen-video in een frame (CSP); de bezoeker laadt het pas na een klik", ["www.youtube-nocookie.com"]),
  ...groep("trackinglink van een vervoerder voor de klant, geen aanroep", [
    "gls-group.com", "jouw.postnl.nl", "tracking.dpd.de", "www.dhl.com", "www.ups.com",
  ]),
  ...groep("link naar een leverancier in de hardwarecatalogus, geen aanroep", [
    "cat.sysworks.nl", "jarltech.com", "risolutions.eu", "shop.pay.nl", "takeaware.nl", "www.123inkt.be", "www.123inkt.nl",
    "www.alibaba.com", "www.bypos.ae", "www.bypos.nl", "www.globalsources.com", "www.paradigit.nl", "www.szzcs.com",
    "www.vergelijkeven.nl",
  ]),
  ...groep("bronvermelding of link naar wet, regel of instantie in teksten en rekentools, geen aanroep", [
    "corp.delaware.gov", "icis.corp.delaware.gov", "wetten.overheid.nl", "www.belastingdienst.nl", "www.irs.gov", "www.kvk.nl",
    "www.toelatinguitleenmarkt.nl", "zoek.officielebekendmakingen.nl",
  ]),
  ...groep("bronvermelding op de kaart (OpenStreetMap, Protomaps, Beeldmateriaal), geen aanroep", [
    "protomaps.com", "www.openstreetmap.org", "www.beeldmateriaal.nl",
  ]),
};

const GEDEKT = new Set<string>([...GRATIS_DIENSTEN.flatMap((d) => d.hosts ?? []), ...Object.keys(BASISLIJN)]);

function bronnen(): string[] {
  const uit: string[] = [];
  const loop = (dir: string) => {
    for (const naam of readdirSync(dir)) {
      const p = path.join(dir, naam);
      if (statSync(p).isDirectory()) loop(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(naam) && !/\.d\.ts$/.test(naam)) uit.push(p);
    }
  };
  loop(path.join(ROOT, "lib"));
  loop(path.join(ROOT, "app", "api"));
  return uit;
}

/** De hosts in de code van een bestand: zonder regels in commentaar en zonder commentaar achter de code. */
function hostsIn(tekst: string): string[] {
  const uit: string[] = [];
  for (const regel of tekst.split("\n")) {
    const t = regel.trimStart();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
    const code = regel.replace(/\s\/\/\s.*$/, "");
    for (const m of code.matchAll(HOST)) uit.push((m[1] ?? "").toLowerCase());
  }
  return uit;
}

describe("alles gratis: elke externe host is gedekt", () => {
  it("elke host in lib/ en app/api/ staat in een dienst of op de basislijn", () => {
    const nieuw = new Map<string, string>();
    let bestanden = 0;
    for (const f of bronnen()) {
      bestanden += 1;
      const rel = path.relative(ROOT, f).replace(/\\/g, "/");
      for (const h of hostsIn(readFileSync(f, "utf8"))) if (!GEDEKT.has(h) && !nieuw.has(h)) nieuw.set(h, rel);
    }
    expect(bestanden, "de bewaker vindt geen bestanden meer: zoekt hij op de goede plek?").toBeGreaterThan(300);
    expect(
      [...nieuw].map(([h, f]) => `${h} (${f})`),
      "zet een echte koppeling in lib/gratis/diensten.ts (veld hosts, met een eigen alternatief); een link of standaard met een reden op BASISLIJN",
    ).toEqual([]);
  });

  it("de hosts in diensten.ts zijn geldige namen en elke basislijnregel heeft een reden", () => {
    for (const d of GRATIS_DIENSTEN) {
      for (const h of d.hosts ?? []) expect(h, `${d.id}: ${h}`).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
    }
    for (const [h, reden] of Object.entries(BASISLIJN)) expect(reden.length, h).toBeGreaterThan(10);
  });

  it("de commentaarregels tellen niet mee", () => {
    expect(hostsIn("// zie https://voorbeeld.com/x\n * https://nog.een.nl\nconst a = 1; // https://derde.nl\n")).toEqual([]);
    expect(hostsIn('const u = "https://api.voorbeeld.nl/v1";')).toEqual(["api.voorbeeld.nl"]);
  });
});
