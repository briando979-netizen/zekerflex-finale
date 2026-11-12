import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Klusvoorstel, ABU-fase en urencorrectie aan een werker, in de app-taal (12 nov 2026). In het Nederlands byte voor byte gelijk
// (zie tests/mail-werker-nl.test.ts voor de hashes); hier: alle vijf talen en de koppeling in de aanroepers.

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { klusVoorstelEmailT } from "@/lib/mail/werker/klusvoorstel";
import { abuFaseEmailT } from "@/lib/mail/werker/abu-fase";
import { hoursCorrectionProposedEmailT } from "@/lib/mail/werker/geschil";
import { pushWhen } from "@/lib/i18n/worker-push";
import type { MailTaal } from "@/lib/mail/vorm";

const TALEN: MailTaal[] = ["nl", "en", "pl", "ro", "uk"];
const link = "https://zf.test/dashboard/klussen/s1";
const klus = { fullName: "Anna Kowalska", title: "Barista <b>", branch: "Café Noord", city: "Groningen", when: "ma 10 nov 09:00–17:00", rate: "€ 16,50", link };

describe("klusvoorstel in vijf talen", () => {
  for (const taal of TALEN) {
    it(`${taal}: onderwerp, link, lang en geen HTML van de opdrachtgever`, () => {
      const m = klusVoorstelEmailT({ ...klus, travelMinutes: 25 }, taal);
      expect(m.kind).toBe("klus-alert");
      expect(m.subject).toContain("Barista <b>");
      expect(m.subject).toContain("Groningen");
      expect(m.text).toContain(link);
      expect(m.text).toContain("€ 16,50");
      expect(m.text).toContain("25");
      expect(m.text).toContain("ma 10 nov 09:00–17:00");
      expect(m.html).toContain(`<html lang="${taal}">`);
      expect(m.html).toContain(`href="${link}"`);
      expect(m.html).toContain("Barista &lt;b&gt;");
      expect(m.html).not.toContain("<b>");
      expect(m.html).not.toMatch(/\{\w+\}/);
      expect(m.text).not.toMatch(/\{\w+\}/);
    });
    it(`${taal}: zonder reistijd geen reisregel`, () => {
      const m = klusVoorstelEmailT({ ...klus, travelMinutes: null }, taal);
      expect(m.text).not.toContain("25");
      expect(m.text).not.toContain(" , ");
    });
  }
  it("buiten het Nederlands staat er geen Nederlandse kernzin", () => {
    for (const taal of TALEN.filter((t) => t !== "nl")) {
      const m = klusVoorstelEmailT({ ...klus, travelMinutes: 25 }, taal);
      expect(m.text + m.html + m.subject).not.toMatch(/Bekijk|Wie het eerst|een klus voor je|per uur|reizen/);
    }
  });
  it("de datum is taalbewust: de tekst van de aanroeper komt ongewijzigd terug", () => {
    const w = { startsAt: new Date("2026-11-10T09:00:00+01:00"), endsAt: new Date("2026-11-10T17:00:00+01:00") };
    expect(pushWhen("en", w)).toBe("Tue 10 Nov 09:00–17:00");
    expect(pushWhen("nl", w)).toBe("di 10 nov 09:00–17:00");
    const m = klusVoorstelEmailT({ ...klus, when: pushWhen("en", w), travelMinutes: null }, "en");
    expect(m.text).toContain("Tue 10 Nov 09:00–17:00");
  });
});

describe("ABU-fase in vijf talen", () => {
  for (const taal of TALEN) {
    it(`${taal}: fases, weken en pad staan erin`, () => {
      const m = abuFaseEmailT({ fullName: "Jan de Vries", van: "A", naar: "B", weken: 53 }, taal);
      expect(m.kind).toBe("abu-fase-overgang");
      expect(m.subject).toContain("B");
      expect(m.text).toContain("Jan de Vries");
      expect(m.text).toContain("53");
      expect(m.text).toContain("ABU");
      expect(m.text).toContain("/dashboard/verloning");
      expect(m.text).not.toMatch(/\{\w+\}/);
    });
  }
  it("nl is de oude tekst", () => {
    const m = abuFaseEmailT({ fullName: "Jan de Vries", van: "A", naar: "B", weken: 53 }, "nl");
    expect(m.subject).toBe("Je ABU-fase is overgegaan naar fase B");
    expect(m.text).toBe(
      "Hoi Jan de Vries,\n\nJe bent overgegaan van ABU-fase A naar fase B (53 gewerkte weken). Dit kan gevolgen hebben voor je contractvorm, opzegtermijn en pensioenopbouw (StiPP).\n\nBekijk je actuele status op /dashboard/verloning.\n\nZekerFlex",
    );
  });
  it("buiten het Nederlands geen Nederlandse kernzin", () => {
    for (const taal of TALEN.filter((t) => t !== "nl")) {
      const m = abuFaseEmailT({ fullName: "Jan", van: "A", naar: "B", weken: 53 }, taal);
      expect(m.text + m.subject).not.toMatch(/Je bent overgegaan|gewerkte weken|Bekijk je/);
    }
  });
});

describe("urencorrectie (geschil) in vijf talen", () => {
  const url = "https://zf.test/dashboard/uren/ts1";
  for (const taal of TALEN) {
    it(`${taal}: titel, uren, link, lang en escapen`, () => {
      const m = hoursCorrectionProposedEmailT("Anna Kowalska", url, "Vakken <i>vullen</i>", 8, 7.5, taal);
      expect(m.kind).toBe("uren-correctie-voorstel");
      expect(m.subject).toContain("Vakken <i>vullen</i>");
      expect(m.text).toContain("8,00");
      expect(m.text).toContain("7,50");
      expect(m.text).toContain(url);
      expect(m.html).toContain(`<html lang="${taal}">`);
      expect(m.html).toContain("Vakken &lt;i&gt;vullen&lt;/i&gt;");
      expect(m.html).not.toContain("<i>");
      expect(m.html).not.toMatch(/\{\w+\}/);
    });
    it(`${taal}: zonder titel een eigen standaardwoord`, () => {
      const m = hoursCorrectionProposedEmailT("Anna", url, null, 8, 7, taal);
      expect(m.subject).not.toContain("null");
      expect(m.subject.length).toBeGreaterThan(20);
    });
  }
  it("nl zonder titel is 'je dienst', zoals voorheen", () => {
    expect(hoursCorrectionProposedEmailT("Anna", url, null, 8, 7, "nl").subject).toBe("Voorstel voor correctie van je uren — je dienst");
  });
  it("buiten het Nederlands geen Nederlandse kernzin", () => {
    for (const taal of TALEN.filter((t) => t !== "nl")) {
      const m = hoursCorrectionProposedEmailT("Anna", url, "X", 8, 7, taal);
      expect(m.text + m.html + m.subject).not.toMatch(/Voorstel voor correctie|opdrachtgever van|Bekijk voorstel|Ben je het er/);
    }
  });
});

describe("de aanroepers kiezen de taal van de werker", () => {
  const lees = (p: string) => readFileSync(p, "utf8").split("\r\n").join("\n");
  it("klus-mail", () => {
    const s = lees("lib/notifications/klus-mail.ts");
    expect(s).toContain("mailTaalVoorWerker(profiel.userId)");
    expect(s).toContain("klusVoorstelEmailT(");
    expect(s).not.toContain("klusVoorstelEmail(");
  });
  it("abu-phase-sweep: alleen de mail aan de werker, de beheermail blijft Nederlands", () => {
    const s = lees("lib/payroll/abu-phase-sweep.ts");
    expect(s).toContain("mailTaalVoorWerker(p.userId)");
    expect(s).toContain("abuFaseEmailT(");
    expect(s).toContain("ABU-fase overgang: ${p.user.fullName}");
  });
  it("disputes/raise", () => {
    const s = lees("lib/disputes/raise.ts");
    expect(s).toContain("mailTaalVoorWerker(ts.freelancer.userId)");
    expect(s).toContain("hoursCorrectionProposedEmailT(");
    expect(s).not.toContain("hoursCorrectionProposedEmail(");
  });
});
