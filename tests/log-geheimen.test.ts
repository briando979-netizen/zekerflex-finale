import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Bewaker (13 nov 2026, AGENTS.md "Veiligheid en privacy"): nooit capability-URL's in een log (push-endpoints, getekende
// links, tokens in een querystring); log alleen de host. Deze test zoekt in app/ en lib/ naar logger.*, log.* en
// console.* met een veld (of ingevulde waarde) waarvan de naam op een geheim wijst. Een veld dat alleen een host, lengte,
// aantal, soort of naam draagt mag. Wat overblijft staat hieronder met een reden; een nieuw veld zonder reden faalt.

const ROOT = process.cwd();
const AANROEP = /\b(?:logger|log|console)\.(?:info|warn|error|debug|log)\(/g;
const GEHEIM = /(endpoint|url|href|link|token|secret|signature|^sig$|sig[A-Z]|code|key|password|wachtwoord|session|sessie|cookie|authorization|bearer)/i;
const TOEGESTAAN = /(host|Host|length|Length|lengte|aanwezig|Aanwezig|count|Count|aantal|soort|kind|type|status|Status|naam|name|Name|id|Id|Seconden|Tokens|Code)$/;
const SLEUTEL = /(?:^|[{,]\s*)(?:\.\.\.)?([A-Za-z_][A-Za-z0-9_]*)\s*(?=[:,}])/g;

/** Velden die bewust blijven, per "bestand|veld", met de reden (nagekeken 13 nov). */
const BASISLIJN: Record<string, string> = {
  "lib/redis.ts|key": "naam van een Redis-slot of cache-sleutel (geen geheim; geen sleutel met een token gevonden)",
  "lib/ops/alert.ts|key": "vaste id van een eigenaarsmelding (bv. fout:<hash>), geen geheim",
  "app/api/admin/console/confirm/route.ts|code": "foutcode van AppError (bv. VALIDATION), geen geheim",
  "app/api/company/register/route.ts|code": "foutcode van AppError, geen geheim",
  "app/api/timesheets/approve/route.ts|code": "foutcode van AppError, geen geheim",
  "app/api/webhooks/stripe/route.ts|authorization": "id van een Stripe Issuing-autorisatie (iauth_…), alleen te gebruiken met de geheime sleutel",
  "lib/kyc/stripe-identity.ts|session": "id van een Stripe Identity-sessie (vs_…), alleen te gebruiken met de geheime sleutel",
  "lib/sales/discovery/careers.ts|url": "openbare vacaturepagina van een bedrijf, geen capability",
  "lib/integrations/pdok.ts|postcode": "postcode van een adreszoektocht bij PDOK; geen geheim",
  "lib/pricing/dynamic.ts|signals": "telling van prijssignalen, geen geheim",
  "lib/storage/local.ts|storageKey": "interne opslagnaam van een upload (geen URL; alleen via een ingelogde route te halen)",
  "lib/integrations/kvkbase.ts|code": "foutcode van de KVK-dienst (of HTTP_<status>); de sleutel gaat in de kop, niet in het pad",
  "lib/sites/branche-demo.ts|key": "naam van een voorbeeldfoto (PhotoKey), geen geheim",
  "lib/sites/burger-demo.ts|key": "naam van een voorbeeldfoto (PhotoKey), geen geheim",
  "lib/sites/demo.ts|key": "naam van een voorbeeldfoto (PhotoKey), geen geheim",
  "lib/sites/winkel-demo.ts|key": "naam van een voorbeeldfoto (PhotoKey), geen geheim",
  "lib/voice/tts.ts|code": "afsluitcode van het Piper-proces, geen geheim",
};

function argumenten(tekst: string, start: number): string {
  let d = 0;
  for (let i = start; i < tekst.length; i++) {
    const c = tekst[i];
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") {
      d--;
      if (d === 0) return tekst.slice(start + 1, i);
    } else if (c === '"' || c === "'" || c === "`") {
      const q = c;
      for (i++; i < tekst.length && tekst[i] !== q; i++) if (tekst[i] === "\\") i++;
    }
  }
  return "";
}

function bronnen(): string[] {
  const uit: string[] = [];
  const loop = (dir: string) => {
    for (const naam of readdirSync(dir)) {
      const p = path.join(dir, naam);
      if (statSync(p).isDirectory()) loop(p);
      else if (/\.(ts|tsx)$/.test(naam)) uit.push(p);
    }
  };
  loop(path.join(ROOT, "app"));
  loop(path.join(ROOT, "lib"));
  return uit;
}

describe("logs: geen capability-URL's of tokens, alleen de host", () => {
  it("geen nieuw logveld met een naam die op een geheim wijst (zonder reden op de basislijn)", () => {
    const nieuw: string[] = [];
    let aanroepen = 0;
    for (const f of bronnen()) {
      const tekst = readFileSync(f, "utf8");
      const rel = path.relative(ROOT, f).replace(/\\/g, "/");
      for (const m of tekst.matchAll(AANROEP)) {
        aanroepen += 1;
        const args = argumenten(tekst, (m.index ?? 0) + m[0].length - 1);
        const obj = args.includes("{") ? args.slice(args.indexOf("{")) : "";
        for (const k of obj.matchAll(SLEUTEL)) {
          const veld = k[1] ?? "";
          if (!GEHEIM.test(veld) || TOEGESTAAN.test(veld)) continue;
          if (Object.hasOwn(BASISLIJN, `${rel}|${veld}`)) continue;
          const regel = tekst.slice(0, m.index).split("\n").length;
          nieuw.push(`${rel}:${regel} ${veld}`);
        }
      }
    }
    expect(aanroepen, "de bewaker vindt geen logregels meer: zoekt hij op de goede plek?").toBeGreaterThan(300);
    expect(nieuw, "log alleen de host (new URL(x).host) of een lengte; is het geen geheim, zet het dan met een reden op de basislijn").toEqual([]);
  });
});
