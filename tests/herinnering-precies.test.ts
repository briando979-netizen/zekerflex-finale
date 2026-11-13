import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { HERINNERING_NL, HERINNERING_TEKSTEN, MIST_HREF, herinneringMist, werkerHerinnering, type HerinneringFeitenWerker, type MistStuk } from "@/lib/onboarding/herinnering-teksten";
import { onboardingReminderEmail } from "@/lib/mail";

// 12 nov 2026: de herinnering zei "maak je account af" zonder te zeggen wat. Nu noemt ze precies wat er mist, in de app-taal
// van de werker, met per onderdeel een link. Tweestap is optioneel en komt er nooit in; er staan geen persoonsgegevens in.

const leeg: HerinneringFeitenWerker = { soortGekozen: true, branchesGekozen: true, identiteitIngestuurd: true, fotoGezet: true, gegevens: null };
const gegevens = (over: Record<string, unknown> = {}) => ({ soort: "uitzendkracht" as const, fiscaalIngevuld: false, contractGetekend: false, bedrijfOk: false, postcodeOk: false, ...over });
const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;

describe("herinneringMist: per soort en toestand", () => {
  it("een uitzendkracht zonder BSN ziet het BSN, daarna de overeenkomst, postcode, ID en foto", () => {
    expect(herinneringMist({ ...leeg, identiteitIngestuurd: false, fotoGezet: false, gegevens: gegevens() })).toEqual(["bsn", "contract", "postcode", "identiteit", "foto"]);
  });

  it("een zzp'er of flexwerker mist btw/KOR, nooit BSN of overeenkomst", () => {
    for (const soort of ["zzp", "flexwerker"] as const) {
      const mist = herinneringMist({ ...leeg, gegevens: gegevens({ soort }) });
      expect(mist).toEqual(["btw", "postcode"]);
    }
  });

  it("zonder gekozen soort: eerst soort en branches, de gegevens volgen pas daarna", () => {
    expect(herinneringMist({ ...leeg, soortGekozen: false, branchesGekozen: false, gegevens: gegevens({ soort: null }) })).toEqual(["soort", "branches"]);
  });

  it("alles op orde: niets te herinneren", () => {
    expect(herinneringMist(leeg)).toEqual([]);
  });

  it("een ID-scan die al is ingestuurd (in behandeling) wordt niet meer genoemd; tweestap bestaat niet als onderdeel", () => {
    expect(herinneringMist({ ...leeg, fotoGezet: false })).toEqual(["foto"]);
    const alle: MistStuk[] = Object.keys(MIST_HREF) as MistStuk[];
    expect(alle).not.toContain("tweestap" as MistStuk);
  });

  it("elk onderdeel wijst naar een bestaande plek; de overeenkomst naar het anker", () => {
    expect(MIST_HREF.contract).toBe("/dashboard/verificatie#uitzendovereenkomst");
    expect(MIST_HREF.bsn).toBe("/dashboard/verificatie#gegevens-mist-kop");
    for (const href of Object.values(MIST_HREF)) expect(href).toMatch(/^\/dashboard\//);
  });
});

describe("de mail", () => {
  const mist: MistStuk[] = ["bsn", "contract", "identiteit"];

  it("in elke taal: onderwerp, aanhef en lijst in die taal, met de volledige link per onderdeel", () => {
    for (const taal of TALEN) {
      const t = HERINNERING_TEKSTEN[taal];
      const h = werkerHerinnering(mist, t, "Anna", 1);
      const mail = onboardingReminderEmail("Anna Kowalska", "uitzendkracht", "https://zf.test/", 1, undefined, h);
      expect(mail.subject, taal).toBe(t.onderwerp);
      expect(mail.text, taal).toContain(t.aanhef.replace("{naam}", "Anna"));
      for (const m of mist) {
        expect(mail.text, `${taal} ${m}`).toContain(t.stuk[m]);
        expect(mail.text, `${taal} ${m}`).toContain(`https://zf.test${MIST_HREF[m]}`);
        expect(mail.html, `${taal} ${m}`).toContain(`href="https://zf.test${MIST_HREF[m]}"`);
      }
      if (taal !== "nl") {
        expect(mail.subject, taal).not.toBe(HERINNERING_NL.onderwerp);
        expect(mail.text, taal).not.toContain(HERINNERING_NL.stuk.bsn);
      }
    }
  });

  it("de uitzendkracht zonder BSN leest 'BSN' (de zzp'er niet), zonder een nummer of ander persoonsgegeven", () => {
    const uitzend = onboardingReminderEmail("Jan", "uitzendkracht", "https://zf.test", 1, undefined, werkerHerinnering(["bsn"], HERINNERING_NL, "Jan", 1));
    expect(uitzend.text).toMatch(/BSN/);
    expect(uitzend.text).not.toMatch(/\d{9}/);
    const zzp = onboardingReminderEmail("Jan", "freelancer", "https://zf.test", 1, undefined, werkerHerinnering(["btw", "postcode"], HERINNERING_NL, "Jan", 1));
    expect(zzp.text).not.toMatch(/BSN/);
    expect(zzp.text).toMatch(/btw/);
  });

  it("de laatste herinnering (stap 3) heeft een eigen onderwerp, in de taal van de werker", () => {
    for (const taal of TALEN) {
      const t = HERINNERING_TEKSTEN[taal];
      expect(werkerHerinnering(["foto"], t, "A", 2).onderwerp).toBe(t.onderwerp);
      expect(werkerHerinnering(["foto"], t, "A", 3).onderwerp).toBe(t.onderwerpLaatste);
    }
  });

  it("tweestap wordt in geen enkele taal genoemd", () => {
    for (const taal of TALEN) {
      const t = HERINNERING_TEKSTEN[taal];
      const alles = JSON.stringify(t).toLowerCase();
      expect(alles, taal).not.toMatch(/tweestap|two-step|2fa|passkey|dwuetap|doi pași|двоетап|двофактор/);
    }
  });

  it("html-tekens in een naam worden onschadelijk gemaakt", () => {
    const h = werkerHerinnering(["foto"], HERINNERING_NL, "<b>Jan</b>", 1);
    const mail = onboardingReminderEmail("<b>Jan</b>", "freelancer", "https://zf.test", 1, undefined, h);
    expect(mail.html).not.toContain("<b>Jan</b>");
  });

  it("zonder onderdelen valt de mail terug op de algemene tekst (oude gedrag blijft)", () => {
    const h = werkerHerinnering([], HERINNERING_NL, "Jan", 1);
    const mail = onboardingReminderEmail("Jan", "uitzendkracht", "https://zf.test", 1, undefined, h);
    expect(mail.text).toMatch(/uitzendovereenkomst/);
  });
});

describe("de teksten in vijf talen", () => {
  it("elke taal heeft elk onderdeel, dezelfde plaatshouders en een echte vertaling", () => {
    const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]!).sort().join(",");
    for (const taal of TALEN) {
      const t = HERINNERING_TEKSTEN[taal];
      expect(Object.keys(t.stuk).sort(), taal).toEqual(Object.keys(HERINNERING_NL.stuk).sort());
      for (const [sleutel, nl] of Object.entries(HERINNERING_NL)) {
        if (sleutel === "stuk") continue;
        const v = (t as unknown as Record<string, string>)[sleutel] ?? "";
        expect(v.length, `${taal} ${sleutel}`).toBeGreaterThan(0);
        expect(plaats(v), `${taal} ${sleutel}`).toBe(plaats(nl as string));
        if (taal !== "nl") expect(v, `${taal} ${sleutel}`).not.toBe(nl);
      }
      for (const m of Object.keys(t.stuk) as MistStuk[]) {
        expect(t.stuk[m].length, `${taal} ${m}`).toBeGreaterThan(5);
        if (taal !== "nl") expect(t.stuk[m], `${taal} ${m}`).not.toBe(HERINNERING_NL.stuk[m]);
      }
    }
  });

  it("de push heeft dezelfde lijst, in dezelfde taal", () => {
    const h = werkerHerinnering(["bsn", "foto"], HERINNERING_TEKSTEN.pl, "A", 1);
    expect(h.pushBody).toContain(HERINNERING_TEKSTEN.pl.stuk.bsn);
    expect(h.pushBody).toContain(HERINNERING_TEKSTEN.pl.stuk.foto);
    expect(h.pushTitel).toBe(HERINNERING_TEKSTEN.pl.pushTitel);
  });
});
