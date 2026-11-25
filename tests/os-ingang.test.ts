import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ZekerFlex OS toont elke app in een frame van de eigen site. Alleen het document
// van /os zelf staat dat toe (frame-src 'self', lib/security/csp.ts). Een <Link>
// naar /os laadt de pagina niet opnieuw, dus dan blijft de CSP van het vorige
// scherm gelden en blijft elk app-venster leeg (zo gemeld door de eigenaar, 6 nov).
const ROOT = join(__dirname, "..");
// ZekerFlex OS is uit de werkgeversschil gehaald (eigenaar, 25 nov 2026: "niet relevant voor bedrijven")
const SCHILLEN = ["components/admin/AdminShell.tsx", "components/app/AppShell.tsx"];

describe("ingang naar ZekerFlex OS", () => {
  it.each(SCHILLEN)("%s opent /os met een volledige paginalading", (pad) => {
    const bron = readFileSync(join(ROOT, pad), "utf8");
    expect(bron, "een <Link> naar /os houdt de CSP van dit scherm").not.toMatch(/<Link\s[^>]*href="\/os"/);
    expect(bron).toMatch(/<a\s[^>]*href="\/os"[^>]*target="_top"/);
  });

  it("de werker-app heeft geen ingang meer via Account: ZekerFlex OS is geen flexwerk (20 nov)", () => {
    const bron = readFileSync(join(ROOT, "app/dashboard/account/page.tsx"), "utf8");
    expect(bron).not.toMatch(/href: "\/os"/);
    expect(bron).not.toContain('label: "ZekerFlex OS"');
  });

  it("het bureaublad herlaadt één keer als de browser een app-venster blokkeert", () => {
    const bron = readFileSync(join(ROOT, "components/os/Bureaublad.tsx"), "utf8");
    expect(bron).toContain("securitypolicyviolation");
    expect(bron).toContain('searchParams.has("opnieuw")');
  });
});
