import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STANDAARD_KOLOMMEN, voettekstZonderDubbel } from "@/lib/ontwerp/menu";

// De voorpagina na het gebruikersonderzoek van 22 nov 2026 (rapport: punt 9, punt 10 en KAN WEG).

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("de voorpagina na het gebruikersonderzoek", () => {
  const home = lees("app/(marketing)/page.tsx");

  // de voorbeeldaccounts zijn op 21 nov op verzoek van de eigenaar gewist: geen belofte van meekijken, de knop gaat naar /app
  it("'Zo ziet de app eruit': geen belofte van een voorbeeldaccount, de knop gaat eerlijk naar /app", () => {
    expect(home).not.toContain("Bekijk de app van binnen");
    expect(home).toContain("Zo ziet de app eruit");
    expect(home).not.toContain("/voorbeeld/werker");
    expect(home).not.toMatch(/voorbeeldaccount met verzonnen/);
    expect(home).toContain('<Link href="/app" className="btn-mint text-base">{tx("Bekijk de app")}</Link>');
  });

  it("onder de kop één regel voor bedrijven: Personeel nodig? Plaats een klus", () => {
    const kop = home.indexOf("WERK_HERO.punten.map");
    const regel = home.indexOf("Personeel nodig?");
    expect(regel).toBeGreaterThan(kop);
    expect(regel).toBeLessThan(home.indexOf("<BranchShowcase"));
    expect(home.slice(regel, regel + 300)).toContain('href="/klus-plaatsen"');
  });

  it("'Werk per stad' staat in de voettekst, niet meer op de voorpagina; /bedrijven houdt zijn steden", () => {
    expect(home).toContain("<BranchShowcase minRateCents={env.MIN_SHIFT_RATE_CENTS} steden={false} />");
    expect(lees("components/marketing/BranchShowcase.tsx")).toContain("{steden && (");
    const voet = lees("components/marketing/SiteFooter.tsx");
    expect(voet).toContain("topSteden(STEDEN_IN_VOETTEKST)");
    expect(voet).toContain("href={`/freelance-werk/${c.slug}`}");
    // het nieuwsbriefblok staat al in de voettekst (niet los op de voorpagina)
    expect(home).not.toContain("NewsletterSignup");
    expect(voet).toContain('<NewsletterSignup source="footer" />');
  });

  it("de voettekst: /status één keer, telefoon en info@ alleen in de regel met de bedrijfsgegevens, Delaware blijft", () => {
    const voet = lees("components/marketing/SiteFooter.tsx");
    expect(voet).not.toContain("Bekijk de systeemstatus");
    expect(voet).toContain("voettekstZonderDubbel(zichtbaar, [SITE.phoneHref, `mailto:${SITE.email}`])");
    expect(voet).toContain("BEDRIJF.registerUrl");
    const links = STANDAARD_KOLOMMEN.flatMap((k) => k.links.map((l) => l.href));
    expect(links.filter((h) => h === "/status")).toHaveLength(1);
    expect(links.some((h) => h.startsWith("tel:") || h.startsWith("mailto:"))).toBe(false);
    expect(links).not.toContain("/voor-bedrijven");
    // ook een eigen versie uit de Site-ontwerper wordt ontdubbeld
    const eigen = voettekstZonderDubbel(
      [
        { titel: "A", links: [{ href: "/status", label: "Systeemstatus" }, { href: "tel:+3197010251797", label: "Bel" }] },
        { titel: "B", links: [{ href: "/status", label: "Uptime" }, { href: "MAILTO:info@zekerflex.com", label: "Mail" }] },
      ],
      ["tel:+3197010251797", "mailto:info@zekerflex.com"],
    );
    expect(eigen).toEqual([{ titel: "A", links: [{ href: "/status", label: "Systeemstatus" }] }]);
  });

  it("/app heeft één kop", () => {
    expect(lees("app/(marketing)/app/page.tsx")).toContain("De flexwerk-app voor je bijbaan en klussen");
    const blok = lees("components/marketing/AppDownload.tsx");
    const tweede = blok.indexOf("Neem ZekerFlex mee in je zak");
    expect(blok.lastIndexOf("{!standalone && (", tweede)).toBeGreaterThan(-1);
  });
});
