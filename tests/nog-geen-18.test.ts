import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { JONGEREN_ANTWOORD, JONGEREN_BRON, JONGEREN_PAD, JONGEREN_VRAAG } from "@/lib/marketing/jongeren";
import { topicAnswer } from "@/lib/chat/public-intents";
import { PUBLIEK_SYSTEEM } from "@/lib/chat/publiek-systeem";

// 21 nov 2026 (eigenaar): een meisje van 16 vroeg de assistent of ze kon werken en kreeg "alleen vanaf 18, veel succes". Nu: wie
// 16 of 17 is, laat op /nog-geen-18 een e-mailadres achter (nieuwsbrief met dubbele bevestiging, eigen bron); onder de 16 vragen we
// niets; klussen voor jongeren beloven we niet.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("jongeren onder de 18", () => {
  it("de pagina bestaat, staat in de sitemap en gebruikt de nieuwsbrief met een eigen bron", () => {
    expect(JONGEREN_PAD).toBe("/nog-geen-18");
    expect(APP_PAGES.map((p) => p.route)).toContain(JONGEREN_PAD);
    expect(lees("app/sitemap.ts")).toContain(`"${JONGEREN_PAD}"`);
    const bron = lees("app/(marketing)/nog-geen-18/page.tsx");
    expect(bron).toContain("<NewsletterSignup source={JONGEREN_BRON} toestemming={JONGEREN_TOESTEMMING} />");
    expect(bron).toContain("Jonger dan 16?");
    expect(JONGEREN_BRON.length).toBeLessThanOrEqual(40);
  });

  it("de assistent herkent een vraag over leeftijd en laat de jongere niet zomaar gaan", () => {
    for (const vraag of ["ik ben 16", "Ik ben 17 en zoek werk", "hoe oud moet je zijn?", "kan ik werken als ik minderjarig ben", "ik ben nog geen 18", "15 jaar oud"]) {
      expect(JONGEREN_VRAAG.test(vraag), vraag).toBe(true);
      expect(topicAnswer(vraag)?.reply, vraag).toBe(JONGEREN_ANTWOORD);
    }
    // ervaring is geen leeftijd
    for (const vraag of ["ik heb 15 jaar ervaring in de horeca", "ik ben 25"]) expect(JONGEREN_VRAAG.test(vraag), vraag).toBe(false);
    expect(JONGEREN_ANTWOORD).toContain("zekerflex.com/nog-geen-18");
    expect(JONGEREN_ANTWOORD).not.toMatch(/veel succes/i);
  });

  it("de vaste instructie van het model zegt hetzelfde, en verwijst niet meer naar /uitzendbureau", () => {
    expect(PUBLIEK_SYSTEEM).toContain("zekerflex.com/nog-geen-18");
    expect(PUBLIEK_SYSTEEM).toContain("vanaf 18 jaar");
    expect(PUBLIEK_SYSTEEM).toContain("jonger dan 16, vraag dan geen gegevens");
    expect(PUBLIEK_SYSTEEM).not.toContain("zekerflex.com/uitzendbureau");
  });
});
