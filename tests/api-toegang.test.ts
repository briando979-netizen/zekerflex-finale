import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isPublicApiRoute } from "@/lib/auth/public-routes";

// De middleware weigert elke /api-route zonder sessie, behalve wat in public-routes staat. Dat is de eerste
// deur. Deze test bewaakt de tweede: een route die een sessie vraagt, moet zelf ook controleren WIE er aanklopt
// (rol, bedrijf of eigen gegevens), en een interne route moet de cron-sleutel eisen. Zo kan een nieuwe route
// niet stilletjes open staan voor elke ingelogde werker, en kan een interne route niet zonder sleutel draaien.

const ROOT = process.cwd();
const rel = (file: string) => relative(ROOT, file).split(sep).join("/");

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routes(full);
    return entry === "route.ts" ? [full] : [];
  });
}

const alle = routes(join(ROOT, "app", "api")).map((f) => ({ pad: rel(f), bron: readFileSync(f, "utf8") }));
const urlVan = (pad: string) => "/" + pad.replace(/^app\//, "").replace(/\/route\.ts$/, "");

// Elke vorm waarmee de code in dit project vaststelt wie er is, en wat die persoon mag.
const WIE =
  /requirePrincipal|getPrincipal|currentPrincipal|requireRole|hasRole|withAuth|withAdminAccess|withOrganizationAccess|withBranchAccess|employerTenant|requireWorker|requireEmployer|requireFreelancer|eigenOrganisatie|beheerContext|eisBeheer|medewerkerContext|auth\(\)|getServerSession|verifyApiKey|requireApiKey|checkInternalToken|handtekening|signature|verifySignature/;

// Bewust zonder eigen identiteitscontrole: ze geven niets terug dat per persoon of per bedrijf verschilt, en staan toch
// achter de sessie van de middleware (ze zijn niet openbaar). Een nieuwe route hier toevoegen vraagt een reden.
const ZONDER_IDENTITEIT = new Set([
  "app/api/analytics/funnel/route.ts", // telt een anonieme funnelstap, IP-begrensd
  "app/api/captcha/challenge/route.ts", // zegt welke captcha getoond wordt; geen gegevens
  "app/api/tenancy/resolve/route.ts", // merk per host; openbare branding, alleen gelezen door het beheerbord
]);

describe("elke route die een sessie vraagt, controleert ook wie er aanklopt", () => {
  it("er is geen beschermde route zonder eigen controle", () => {
    const open = alle.filter((r) => !isPublicApiRoute(urlVan(r.pad)) && !ZONDER_IDENTITEIT.has(r.pad) && !WIE.test(r.bron)).map((r) => r.pad);
    expect(open).toEqual([]);
  });
});

describe("interne routes eisen de cron-sleutel", () => {
  // eigen sleutel in plaats van de cron-sleutel (de AI-sleutel van het eigen model, lib/ai-node)
  const EIGEN_SLEUTEL = new Set(["app/api/internal/ai-node/register/route.ts"]);
  const intern = alle.filter((r) => r.pad.startsWith("app/api/internal/") || r.pad.startsWith("app/api/metrics/"));

  it("elke interne route controleert de sleutel", () => {
    const zonder = intern.filter((r) => !EIGEN_SLEUTEL.has(r.pad) && !/checkInternalToken|internal-auth|INTERNAL_CRON_TOKEN/.test(r.bron)).map((r) => r.pad);
    expect(zonder).toEqual([]);
  });

  it("de uitzondering heeft echt een eigen sleutelcontrole", () => {
    for (const pad of EIGEN_SLEUTEL) {
      const bron = alle.find((r) => r.pad === pad)?.bron ?? "";
      expect(bron).toMatch(/authorized\(/);
      expect(bron).toMatch(/401/);
    }
  });
});

describe("werkgeversroutes bepalen het bedrijf uit de sessie, nooit uit de aanvraag", () => {
  const werkgever = alle.filter((r) => r.pad.startsWith("app/api/werkgever/"));

  it("er zijn werkgeversroutes om te bewaken", () => {
    expect(werkgever.length).toBeGreaterThan(50);
  });

  it("geen werkgeversroute vertrouwt een tenantId uit de body of querystring zonder controle", () => {
    // een tenantId uit de aanvraag is pas veilig naast een controle dat de ingelogde persoon bij dat bedrijf hoort
    const gevaar = werkgever
      .filter((r) => /(?:body|searchParams|query|params)[^\n]{0,60}tenantId|tenantId[^\n]{0,40}(?:searchParams\.get|body\.)/.test(r.bron))
      .filter((r) => !/withOrganizationAccess|resolveEmployerScope|tenantIds\.includes|hasGrant|assertTenant|employerTenant|eigenOrganisatie|requireRole|hasRole/.test(r.bron))
      .map((r) => r.pad);
    expect(gevaar).toEqual([]);
  });
});
