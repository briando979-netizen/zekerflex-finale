import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NOTIFICATIONS_NL } from "@/components/app/notifications-texts";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// De meldingenbel is van drie omgevingen: werker, werkgever en beheer. Alleen het werkersdashboard geeft zijn eigen taal
// mee (texts-prop, zoals components/auth/two-factor-texts.ts); werkgever en beheer houden het Nederlands zonder iets te merken.

const ROOT = process.cwd();
const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;

describe("meldingenbel: teksten", () => {
  it("de Nederlandse standaard is exact wat er altijd stond", () => {
    expect(NOTIFICATIONS_NL).toEqual({
      bell: "Meldingen",
      close: "Sluiten",
      all: "Alles",
      markAllRead: "Alles als gelezen markeren",
      groups: { klussen: "Over je klussen", geld: "Uren & uitbetaling", berichten: "Berichten", account: "Account" },
      sections: { today: "Vandaag", yesterday: "Gisteren", earlier: "Eerder" },
      empty: "Niets nieuws — je bent bij.",
      emptyTab: "Geen meldingen in dit tabblad.",
      open: "Openen",
      read: "Gelezen",
    });
    expect(FREELANCER_DICTS.nl.meldingen).toBe(NOTIFICATIONS_NL);
  });

  it("elke taal heeft alle teksten, en een andere taal is echt vertaald", () => {
    for (const taal of TALEN) {
      const t = FREELANCER_DICTS[taal].meldingen;
      for (const x of [t.bell, t.close, t.all, t.markAllRead, t.groups.klussen, t.groups.geld, t.groups.berichten, t.groups.account, t.sections.today, t.sections.yesterday, t.sections.earlier, t.empty, t.emptyTab, t.open, t.read]) {
        expect(x.trim().length, `${taal}: ${x}`).toBeGreaterThan(1);
      }
      if (taal !== "nl") {
        expect(t.bell, taal).not.toBe(NOTIFICATIONS_NL.bell);
        expect(t.markAllRead, taal).not.toBe(NOTIFICATIONS_NL.markAllRead);
        expect(t.sections.today, taal).not.toBe(NOTIFICATIONS_NL.sections.today);
      }
    }
  });
});

describe("meldingenbel: wie geeft welke teksten", () => {
  it("alleen FreelancerShell geeft de vertaling mee; werkgever, beheer, OS en de algemene shell blijven Nederlands", () => {
    expect(bron("components/app/FreelancerShell.tsx")).toContain("<NotificationsBell texts={ft.meldingen} />");
    for (const f of ["components/app/EmployerShell.tsx", "components/admin/AdminShell.tsx", "components/app/AppShell.tsx", "components/os/Taakbalk.tsx"]) {
      const src = bron(f);
      expect(src, f).toContain("<NotificationsBell");
      expect(src, f).not.toMatch(/<NotificationsBell[^>]*texts=/);
    }
  });

  it("de bel haalt zijn teksten uit de prop (met Nederlands als standaard), niet meer uit losse zinnen", () => {
    const src = bron("components/app/NotificationsBell.tsx");
    expect(src).toContain("texts: t = NOTIFICATIONS_NL");
    for (const zin of ["Over je klussen", "Uren & uitbetaling", "Niets nieuws", "Geen meldingen in dit tabblad", "Vandaag", "Gisteren"]) {
      expect(src, zin).not.toContain(zin);
    }
  });

  it("de teksten-module is puur: geen imports, dus ook veilig voor de werkgeversbundel", () => {
    expect(bron("components/app/notifications-texts.ts")).not.toMatch(/^import /m);
  });
});
