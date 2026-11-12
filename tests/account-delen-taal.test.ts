import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { PUSH_KAART_NL, ZIEK_NL, THEMA_NL } from "@/lib/account/teksten";

// Opmaakmeting 12 nov (PL): in het werker-Account waren de pushkaart, "Ziek melden" en de weergave-schakelaar (ook in de kop van de
// werker-app) nog Nederlands. Nu via een texts-prop met Nederlandse standaard; alleen de werker-app geeft de vijf talen mee.

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");

describe("de teksten in vijf talen", () => {
  it("Nederlands is de standaard: het woordenboek gebruikt dezelfde objecten", () => {
    expect(FREELANCER_DICTS.nl.accountDelen).toEqual({ push: PUSH_KAART_NL, ziek: ZIEK_NL, thema: THEMA_NL });
  });

  it("elke taal heeft alle sleutels, dezelfde plaatshouders en een echte vertaling", () => {
    for (const taal of TALEN) {
      const d = FREELANCER_DICTS[taal].accountDelen;
      for (const sectie of ["push", "ziek", "thema"] as const) {
        const nl = FREELANCER_DICTS.nl.accountDelen[sectie] as Record<string, string>;
        const v = d[sectie] as Record<string, string>;
        expect(Object.keys(v).sort(), `${taal} ${sectie}`).toEqual(Object.keys(nl).sort());
        for (const [k, x] of Object.entries(nl)) {
          expect(v[k]!.length, `${taal} ${sectie}.${k}`).toBeGreaterThan(0);
          expect(plaats(v[k]!), `${taal} ${sectie}.${k}`).toBe(plaats(x));
          if (taal !== "nl" && x.length > 14) expect(v[k], `${taal} ${sectie}.${k}`).not.toBe(x);
        }
      }
    }
  });
});

describe("de onderdelen gebruiken de teksten", () => {
  it("PushToggle (kaart), ZiekMelden en ThemeToggle hebben een texts-prop met Nederlandse standaard en geen vaste zinnen meer", () => {
    const push = bron("components/app/PushToggle.tsx");
    expect(push).toContain("cardTexts = PUSH_KAART_NL");
    for (const zin of ["Pushmeldingen", "Stuur test-melding", "Niet beschikbaar", "Geblokkeerd in je browser", "Aanzetten lukte niet", "Je hebt meldingen eerder geweigerd"]) expect(push, zin).not.toContain(zin);
    const ziek = bron("components/app/ZiekMelden.tsx");
    expect(ziek).toContain("texts = ZIEK_NL");
    for (const zin of ["Beterschap!", "Bevestig ziekmelding", "Tot (optioneel)"]) expect(ziek, zin).not.toContain(zin);
    const thema = bron("components/theme/ThemeToggle.tsx");
    expect(thema).toContain("texts = THEMA_NL");
    for (const zin of ["Zet lichte weergave aan", "Zet donkere weergave aan", "<span>Weergave</span>"]) expect(thema, zin).not.toContain(zin);
  });

  it("alleen de werker-app geeft de vertaling mee: het Account, en de kop van de werker-shell; werkgever en chat houden Nederlands", () => {
    const account = bron("app/dashboard/account/page.tsx");
    expect(account).toContain("<PushToggle cardTexts={ft.accountDelen.push} />");
    expect(account).toContain("<ZiekMelden texts={ft.accountDelen.ziek} />");
    expect(account).toContain("texts={ft.accountDelen.thema}");
    expect(bron("components/app/FreelancerShell.tsx")).toContain("texts={ft.accountDelen.thema}");
    expect(bron("app/werkgever/instellingen/page.tsx")).not.toContain("cardTexts");
  });

  it("de logica van PushToggle is niet veranderd: dezelfde aanroepen en statussen", () => {
    const push = bron("components/app/PushToggle.tsx");
    for (const s of ['"/api/me/push"', '"/api/me/push/test"', "Notification.requestPermission()", "pushManager.subscribe", "setState(\"on\")", "onAan?.()"]) expect(push, s).toContain(s);
  });
});
