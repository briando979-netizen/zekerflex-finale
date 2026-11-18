import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIRECT_PER_UUR,
  DIRECT_WERKERS_PER_UUR,
  GEMELDE_AUDIT_ACTIES,
  SOORTEN,
  auditNaarGebeurtenis,
  binnenMeldtijd,
  magDirect,
  maakGebeurtenis,
  normaliseerNummer,
  samenvattingTekst,
  telefoonTekst,
  toonNummer,
  whatsappJid,
  zonderContactgegevens,
} from "@/lib/ops/gebeurtenis";

// Tijden met een zone: in november is Amsterdam UTC+1.
const OCHTEND = new Date("2026-11-18T10:00:00+01:00"); // 10:00 in Amsterdam
const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("melder: contactgegevens weghalen", () => {
  it("haalt e-mailadressen, telefoonnummers en de rest van een link weg", () => {
    expect(zonderContactgegevens("Mail jan@voorbeeld.nl of bel 06 12 34 56 78 of +31 6 1234 5678")).toBe("Mail [e-mail] of bel [nummer] of [nummer]");
    expect(zonderContactgegevens("Kijk op https://zekerflex.com/t/abc123?token=geheim en klaar")).toBe("Kijk op zekerflex.com en klaar");
  });

  it("laat datums, tijden en bedragen staan en kapt af", () => {
    expect(zonderContactgegevens("Klus op 2026-11-18 20:00 voor € 1.234,56")).toBe("Klus op 2026-11-18 20:00 voor € 1.234,56");
    const lang = zonderContactgegevens("a".repeat(300), 50);
    expect(lang).toHaveLength(50);
    expect(lang.endsWith("…")).toBe(true);
  });

  it("een gebeurtenis bewaart nooit een e-mailadres, ook niet in het detail", () => {
    const g = maakGebeurtenis({ soort: "overig", titel: "Mail aan jan@voorbeeld.nl", detail: "bel 0687654321", url: "https://evil.example/x" }, OCHTEND, "ab12");
    expect(JSON.stringify(g)).not.toMatch(/@voorbeeld|0687654321/);
    expect(g.url).toBeNull(); // alleen een eigen pad
    expect(g.gemeld).toBe("wacht");
    expect(g.belang).toBe("direct");
  });
});

describe("melder: telefoonnummer", () => {
  it("maakt van alle schrijfwijzen dezelfde cijfers met landcode", () => {
    for (const n of ["0612345678", "06 12 34 56 78", "06-12345678", "+31 6 12345678", "0031612345678", "+31(0)612345678".replace("(0)", "")]) {
      expect(normaliseerNummer(n)).toBe("31612345678");
    }
  });

  it("wijst iets wat geen nummer is af", () => {
    for (const n of ["", "abc", "12", "06 12", "0634 abc 780"]) expect(normaliseerNummer(n)).toBeNull();
  });

  it("geeft de WhatsApp-code en een leesbaar nummer", () => {
    expect(whatsappJid("31612345678")).toBe("31612345678@s.whatsapp.net");
    expect(toonNummer("31612345678")).toBe("+31 6 1234 5678");
    expect(toonNummer(null)).toBe("niet ingesteld");
  });
});

describe("melder: wanneer direct", () => {
  it("alleen overdag, van 07:00 tot 23:00 Amsterdam", () => {
    expect(binnenMeldtijd(new Date("2026-11-18T06:59:00+01:00"))).toBe(false);
    expect(binnenMeldtijd(new Date("2026-11-18T07:00:00+01:00"))).toBe(true);
    expect(binnenMeldtijd(new Date("2026-11-18T22:59:00+01:00"))).toBe(true);
    expect(binnenMeldtijd(new Date("2026-11-18T23:00:00+01:00"))).toBe(false);
    // zomertijd: 23:30 UTC is dan 01:30 in Amsterdam
    expect(binnenMeldtijd(new Date("2026-07-01T23:30:00Z"))).toBe(false);
  });

  it("een samenvatting-gebeurtenis gaat nooit direct, en 's nachts ook niet", () => {
    expect(magDirect({ belang: "samenvatting" }, OCHTEND)).toBe(false);
    expect(magDirect({ belang: "direct" }, OCHTEND)).toBe(true);
    expect(magDirect({ belang: "direct" }, new Date("2026-11-18T03:00:00+01:00"))).toBe(false);
  });

  it("de grenzen per uur staan vast; het tellen zelf doet lib/ops/melder.ts met atomaire tellers (tests/melder.test.ts)", () => {
    expect(DIRECT_PER_UUR).toBe(30);
    expect(DIRECT_WERKERS_PER_UUR).toBe(10);
    const bron = lees("lib/ops/melder.ts");
    expect(bron).toContain('fixedWindow("melder:direct", DIRECT_PER_UUR, 3600, { failOpen: false })');
    expect(bron).toContain('fixedWindow("melder:werker", DIRECT_WERKERS_PER_UUR, 3600, { failOpen: false })');
  });
});
describe("melder: teksten", () => {
  it("de telefoontekst is icoon plus titel", () => {
    expect(telefoonTekst({ soort: "bestelling", titel: "Nieuwe webshopbestelling" })).toBe("🛒 Nieuwe webshopbestelling");
  });

  it("het uurbericht telt per soort, noemt de drie meest voorkomende en verwijst naar het logboek", () => {
    const tekst = samenvattingTekst(
      [
        { soort: "mail", titel: "E-mail verstuurd: welkom" },
        { soort: "mail", titel: "E-mail verstuurd: welkom" },
        { soort: "mail", titel: "E-mail verstuurd: factuur" },
        { soort: "chat", titel: "Een chatbericht verstuurd" },
      ],
      "https://zekerflex.com/",
    );
    expect(tekst).toContain("4 gebeurtenissen");
    expect(tekst).toContain("✉️ Verstuurde e-mails: 3");
    expect(tekst).toContain("2× E-mail verstuurd: welkom");
    expect(tekst).toContain("💬 Chatberichten: 1");
    expect(tekst?.endsWith("https://zekerflex.com/admin/automatisch")).toBe(true);
    expect(samenvattingTekst([], "https://zekerflex.com")).toBeNull();
    expect(samenvattingTekst([{ soort: "klus", titel: "Nieuwe klus geplaatst" }], "https://zekerflex.com")).toContain("1 gebeurtenis\n");
  });
});

describe("melder: vertaling van audit-acties", () => {
  it("een nieuwe werker en een nieuw bedrijf, met het soort dashboard maar zonder gegevens van de persoon", () => {
    expect(auditNaarGebeurtenis("auth.register", { type: "freelancer" })).toMatchObject({ soort: "werker-aangemeld", titel: "Nieuwe werker aangemeld" });
    expect(auditNaarGebeurtenis("auth.register", { type: "bedrijf", dashboard: "rijschool" })).toMatchObject({ soort: "bedrijf-aangemeld", titel: "Nieuw bedrijf aangemeld (rijschool)" });
    // een veld met een e-mailadres wordt niet overgenomen
    expect(auditNaarGebeurtenis("auth.register", { type: "bedrijf", dashboard: "jan@voorbeeld.nl" })?.titel).toBe("Nieuw bedrijf aangemeld");
  });

  it("de gevraagde gebeurtenissen zijn er: verwijderd, bestelling en wat daarna gebeurt, klus, verkoopmail", () => {
    expect(auditNaarGebeurtenis("privacy.user.erased", {})?.soort).toBe("account-verwijderd");
    for (const a of ["shop.order.created", "shop.order.paid", "shop.order.cj-geplaatst", "shop.order.cj-verzonden", "shop.order.cj-mislukt"]) {
      expect(auditNaarGebeurtenis(a, {})?.soort).toBe("bestelling");
    }
    expect(auditNaarGebeurtenis("shift.created", {})?.soort).toBe("klus");
    expect(auditNaarGebeurtenis("sales.outreach.sent", {})).toMatchObject({ soort: "marketing", belang: "samenvatting" });
    expect(auditNaarGebeurtenis("sales.lead.replied", {})?.belang).toBeUndefined(); // een reactie is direct
  });

  it("een testaccount (metadata.test) wordt nooit gemeld, en de aanmelding zet die vlag voor testadressen", () => {
    expect(auditNaarGebeurtenis("auth.register", { type: "freelancer", test: true })).toBeNull();
    expect(auditNaarGebeurtenis("auth.register", { type: "bedrijf", test: true })).toBeNull();
    expect(auditNaarGebeurtenis("auth.register", { type: "freelancer", test: false })?.soort).toBe("werker-aangemeld");
    const bron = lees("lib/auth/register.ts");
    expect(bron).toContain('from "@/lib/mail/test-adres"');
    expect(bron).toMatch(/isReservedTestAddress\(email\) \? \{ test: true \} : \{\}/);
  });

  it("onbekende acties en namen uit het prototype worden niet gemeld", () => {
    for (const a of ["auth.login", "constructor", "__proto__", "toString", ""]) expect(auditNaarGebeurtenis(a, {})).toBeNull();
  });

  it("elke titel is Nederlands, zonder contactgegevens, en elke url is een eigen pad", () => {
    for (const actie of GEMELDE_AUDIT_ACTIES) {
      const g = auditNaarGebeurtenis(actie, { type: "bedrijf" });
      expect(g, actie).not.toBeNull();
      expect(g?.titel).toBe(zonderContactgegevens(g?.titel ?? ""));
      expect(g?.url?.startsWith("/admin/"), actie).toBe(true);
      expect(Object.hasOwn(SOORTEN, g?.soort ?? "")).toBe(true);
    }
  });

  it("de gemelde acties bestaan echt in de code (een typfout meldt anders nooit iets)", () => {
    const plekken: [string, string][] = [
      ["lib/auth/register.ts", "auth.register"],
      ["lib/shifts/create.ts", "shift.created"],
      ["app/api/shop/orders/route.ts", "shop.order.created"],
      ["lib/privacy/anonymize.ts", "privacy.user.erased"],
      ["lib/sales/send.ts", "sales.outreach.sent"],
      ["lib/shop/cj/bestelling.ts", "shop.order.cj-verzonden"],
    ];
    for (const [bestand, actie] of plekken) {
      expect(lees(bestand), `${bestand} ${actie}`).toContain(`"${actie}"`);
      expect(GEMELDE_AUDIT_ACTIES).toContain(actie);
    }
  });
});

describe("melder: aangesloten op de auditketen", () => {
  it("de haak staat pas na de commit, wordt los ingeladen en niet afgewacht", () => {
    const bron = lees("lib/audit.ts");
    expect(bron).not.toMatch(/^import [^\n]*ops\/(melder|gebeurtenis)/m);
    expect(bron).toMatch(/import\("@\/lib\/ops\/melder"\)/);
    // na de transactie, binnen dezelfde try (alleen bij een gelukte schrijfactie), zonder await
    const transactie = bron.indexOf("await prisma.$transaction");
    const haak = bron.indexOf("meldVanuitAudit(input.action");
    expect(transactie).toBeGreaterThan(-1);
    expect(haak).toBeGreaterThan(transactie);
    expect(bron).not.toMatch(/await meldVanuitAudit/);
    expect(bron).toMatch(/void import\("@\/lib\/ops\/gebeurtenis"\)[\s\S]*\.catch\(\(\) => undefined\)/);
  });

  it("de uurtaak staat in cron, hartslag en route", () => {
    expect(lees("deploy/cron/entrypoint.sh")).toMatch(/^50 \* \* \* \* wget [^\n]*\/api\/internal\/melder\/samenvatting"/m);
    expect(lees("lib/ops/heartbeat.ts")).toContain('job: "melder-samenvatting"');
    expect(lees("app/api/internal/melder/samenvatting/route.ts")).toContain("checkInternalToken");
  });
});
