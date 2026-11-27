import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Apart voor werkers en bedrijven (15 nov 2026, eigenaar: zoals WhatsApp en WhatsApp Business):
// - mailvoorkeuren per kant: een bedrijf zag "Nieuwe klussen die bij je passen", een werker "Zakelijke introductie";
// - account verwijderen in de werkgeversapp, met wat er met het bedrijf gebeurt, en nooit een bedrijf zonder beheerder;
// - gegevens downloaden, privacy en feedback ook bij de instellingen van een bedrijf.

const h = vi.hoisted(() => ({
  beheer: [] as { tenantId: string; tenant: { name: string } }[],
  andereBeheerders: 0,
  collegas: [] as { userId: string }[],
  diensten: 0,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: {
      findMany: async (q: { where: { role?: string } }) => (q.where.role === "HQ_ADMIN" ? h.beheer : h.collegas),
      count: async () => h.andereBeheerders,
    },
    shift: { count: async () => h.diensten },
  },
}));

import { categorieenVoor, OPTIONAL_CATEGORIES } from "@/lib/mail/categories";
import { bedrijfBlokkeertVertrek } from "@/lib/privacy/bedrijf-vertrek";
import { DELETE_ACCOUNT_EN, DELETE_ACCOUNT_NL } from "@/components/app/delete-account-texts";

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

beforeEach(() => {
  h.beheer = [{ tenantId: "t1", tenant: { name: "Bakkerij De Korst" } }];
  h.andereBeheerders = 0;
  h.collegas = [];
  h.diensten = 0;
});

describe("mailvoorkeuren per kant", () => {
  it("een bedrijf ziet geen klusvoorstellen en geen zakelijke introductie; een werker geen zakelijke introductie", () => {
    const bedrijf = categorieenVoor("bedrijf").map((c) => c.slug);
    const werker = categorieenVoor("werker").map((c) => c.slug);
    expect(bedrijf).not.toContain("klus-alerts");
    expect(bedrijf).not.toContain("sales-outreach");
    expect(werker).toContain("klus-alerts");
    expect(werker).not.toContain("sales-outreach");
  });

  it("de omschrijving past bij wie hem leest; zonder kant (de afmeldpagina) alles zoals het was", () => {
    const desc = (kant: "werker" | "bedrijf", slug: string) => categorieenVoor(kant).find((c) => c.slug === slug)?.desc ?? "";
    expect(desc("bedrijf", "herinneringen")).not.toMatch(/je uren niet in te dienen|je dienst begint/);
    expect(desc("werker", "herinneringen")).toContain("vergeet je uren niet in te dienen");
    expect(desc("bedrijf", "reviews")).toContain("een kracht te beoordelen");
    expect(categorieenVoor()).toBe(OPTIONAL_CATEGORIES);
    expect(bron("app/werkgever/bedrijf/page.tsx")).toContain('mailPrefsView(principal.email, "bedrijf")');
    expect(bron("app/dashboard/profiel/page.tsx")).toContain('mailPrefsView(user?.email ?? principal.email, "werker")');
  });

  it("na opslaan blijft de lijst per kant", () => {
    // de schakelaars sturen hun kant mee en de API geeft dezelfde lijst terug (anders kwamen de werkersmails na één klik terug)
    for (const [f, kant] of [["app/werkgever/bedrijf/page.tsx", "bedrijf"], ["app/dashboard/profiel/page.tsx", "werker"]] as const) {
      expect(bron(f), f).toMatch(new RegExp(`<MailPrefsToggles[^>]*kant="${kant}"`));
    }
    expect(bron("components/marketing/MailPrefsToggles.tsx")).toContain("...(kant ? { kant } : {})");
    expect(bron("app/api/mail/voorkeuren/route.ts")).toContain("mailPrefsView(rec.email, kant)");
  });
});

describe("account verwijderen laat geen bedrijf zonder beheerder achter", () => {
  it("geen beheerder van een bedrijf: niets in de weg", async () => {
    h.beheer = [];
    expect(await bedrijfBlokkeertVertrek("u1")).toBeNull();
  });

  it("er is nog een andere beheerder: niets in de weg", async () => {
    h.andereBeheerders = 1;
    h.collegas = [{ userId: "u2" }];
    h.diensten = 3;
    expect(await bedrijfBlokkeertVertrek("u1")).toBeNull();
  });

  it("de enige beheerder met collega's: eerst een collega beheerder maken", async () => {
    h.collegas = [{ userId: "u2" }, { userId: "u3" }];
    expect(await bedrijfBlokkeertVertrek("u1")).toEqual({ reden: "collegas", aantal: 2, bedrijf: "Bakkerij De Korst" });
  });

  it("de enige beheerder zonder collega's maar met geplande diensten: die eerst afronden", async () => {
    h.diensten = 4;
    expect(await bedrijfBlokkeertVertrek("u1")).toEqual({ reden: "diensten", aantal: 4, bedrijf: "Bakkerij De Korst" });
  });

  it("de actie controleert dit vóór het wissen, voor beide ingangen", () => {
    const actie = bron("app/dashboard/account/verwijderen/actions.ts");
    expect(actie.indexOf("bedrijfBlokkeertVertrek(principal.userId)")).toBeGreaterThan(0);
    expect(actie.indexOf("bedrijfBlokkeertVertrek(principal.userId)")).toBeLessThan(actie.indexOf("anonymizeUser(principal.userId"));
  });

  it("de teksten van het formulier in het Nederlands en Engels, met dezelfde plaatshouders; het woord blijft VERWIJDEREN", () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(",");
    for (const k of Object.keys(DELETE_ACCOUNT_NL) as (keyof typeof DELETE_ACCOUNT_NL)[]) expect(ph(DELETE_ACCOUNT_EN[k]), k).toBe(ph(DELETE_ACCOUNT_NL[k]));
    expect(DELETE_ACCOUNT_NL.typ).toContain("VERWIJDEREN");
    expect(DELETE_ACCOUNT_EN.typ).toContain("VERWIJDEREN");
  });
});

describe("de instellingen van een bedrijf", () => {
  // 25 nov 2026 (eigenaar, zoals YoungOnes): de kaarten "Account verwijderen" en "Gegevens downloaden" staan niet meer op
  // het scherm Instellingen; de pagina's zelf (/werkgever/account/verwijderen, /api/me/gegevens/export) blijven bestaan.
  it("privacy en feedback zoals bij werkers; verwijderen en downloaden staan niet meer op het scherm", () => {
    const s = bron("app/werkgever/instellingen/page.tsx");
    expect(s).not.toContain('href: "/werkgever/account/verwijderen"');
    expect(s).not.toContain('href: "/account-verwijderen"');
    expect(s).not.toContain('href: "/api/me/gegevens/export"');
    expect(s).toContain('href: "/privacy"');
    expect(s).toMatch(/href: "mailto:info@zekerflex\.com\?subject=Feedback/);
    // een download of mail is een gewone link: geen Link die een API-route voorlaadt
    expect(s).toContain("c.gewoon ? (");
  });

  it("de verwijderpagina van het bedrijf haalt zijn tekst uit de woordenlijst en geeft Engels mee als de app op Engels staat", () => {
    const p = bron("app/werkgever/account/verwijderen/page.tsx");
    expect(p).toContain("d.verwijderen");
    expect(p).toContain("<DeleteOwnAccountForm texts={en ? DELETE_ACCOUNT_EN : DELETE_ACCOUNT_NL} />");
    for (const f of ["lib/i18n/dictionaries.ts", "lib/i18n/dictionary-en.ts"]) expect(bron(f), f).toContain("bedrijfKop:");
  });

  it("de persoonlijke accountpagina van een bedrijf is tweetalig, ook de passkeys (tweestapsverificatie is weg, 21 nov 2026)", () => {
    const p = bron("app/werkgever/account/page.tsx");
    expect(p).toContain("d.persoonlijkAccount");
    expect(p).not.toContain("TwoFactorSettings");
    expect(p).toContain("FREELANCER_DICTS.en.passkeys");
    expect(p).not.toContain("Persoonlijke accountinstellingen");
    expect(bron("tests/werkgever-taal-basislijn.json")).not.toContain("app/werkgever/account/page.tsx");
  });
});
