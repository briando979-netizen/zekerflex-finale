import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Bewaker (21 nov 2026, eigenaar): ZekerFlex is zelf geen uitzendbureau of werkgever meer. Uitzenden loopt via aangesloten
// uitzendbureaus; dat bureau is de werkgever en regelt contract, loon, vakantiegeld en pensioen volgens zijn cao. Op de
// openbare pagina's, in de teksten voor AI-assistenten, de chat, de telefoon en de kennisbank staat dus nergens meer dat
// ZekerFlex de werkgever is of zelf verloont (wekelijks loon, StiPP via ZekerFlex, ABU-fasen bij ZekerFlex). Komt het eigen
// uitzendspoor terug (lib/uitzend/model.ts), pas deze bewaker dan bewust aan.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

const OPENBAAR = [
  "app/(marketing)/uitzendbureau/page.tsx",
  "app/(marketing)/bedrijven/page.tsx",
  "app/(marketing)/freelance-werk/page.tsx",
  "app/(marketing)/freelance-werk/[stad]/page.tsx",
  "app/(marketing)/klussen/[id]/page.tsx",
  "app/(marketing)/personeel-inhuren/page.tsx",
  "app/(marketing)/personeel-inhuren/[stad]/page.tsx",
  "app/(marketing)/rekentools/kosten-uitzendkracht-berekenen/page.tsx",
  "app/(marketing)/rekentools/wet-dba-check/page.tsx",
  "app/(marketing)/intercedenten/page.tsx",
  "app/(marketing)/kennis/page.tsx",
  "app/(marketing)/uitleg/page.tsx",
  "app/api/uitzendbureau/route.ts",
  "app/llms.txt/route.ts",
  "app/vacatures.xml/route.ts",
  "components/marketing/UitzendJobBoard.tsx",
  "components/marketing/UitzendbureauContactForm.tsx",
  "components/marketing/SectorLanding.tsx",
  "components/marketing/BijbaanLanding.tsx",
  "components/marketing/FunctieLanding.tsx",
  "lib/seo-stad.ts",
  "lib/seo-stad-pagina.ts",
  "lib/seo-bijbaan.ts",
  "lib/seo-functies.ts",
  "lib/seo-vragen.ts",
  "components/marketing/VraagLanding.tsx",
  "components/marketing/VisitorNudge.tsx",
  "lib/public-shifts.ts",
  "lib/seo.ts",
  "lib/marketing/aanbod.ts",
  "lib/marketing/werk-home.ts",
  "lib/marketing/yo-home.ts",
  "lib/marketing/site-nav.ts",
  "lib/marketing/paginavideos.ts",
  "lib/agent-content/markdown-pages.ts",
  "lib/social/schrijf.ts",
  "lib/rag/howto.ts",
  "lib/ai/writer.ts",
  "lib/chat/public-intents.ts",
  "lib/chat/publiek-systeem.ts",
  "lib/kennis/content.ts",
  "lib/kennis/tarieven-overzicht.ts",
  "lib/kennis/whitepapers.ts",
  "lib/telephony/scripts.ts",
  "docs/kennisbank/10-flexwerkers/01-aan-de-slag.md",
  "docs/kennisbank/10-flexwerkers/02-veilig-werken.md",
  "docs/kennisbank/10-flexwerkers/03-geld-en-administratie.md",
  "docs/kennisbank/20-opdrachtgevers/01-personeel-inhuren.md",
  "docs/kennisbank/20-opdrachtgevers/04-een-klus-uitzetten.md",
  "docs/kennisbank/20-opdrachtgevers/13-als-er-iets-misgaat.md",
];

const VERBODEN: [RegExp, string][] = [
  [/ZekerFlex[- ]uitzendbureau/i, "een ZekerFlex-uitzendbureau"],
  [/ons uitzendbureau/i, "ons uitzendbureau"],
  [/ZekerFlex (is|wordt) (dan )?(je|de|hun|jouw) (formele )?werkgever/i, "ZekerFlex als werkgever"],
  [/formele werkgever|wij zijn de werkgever/i, "ZekerFlex als formele werkgever"],
  [/in dienst (van|bij) ZekerFlex/i, "in dienst van ZekerFlex"],
  [/wekelijks(e)? (loon|verloning|loonstrook)|elke week (je loon|een echte loonstrook|verloond)|loonstrook elke week|wij verlonen|verloont je elke week/i, "wekelijkse verloning door ZekerFlex"],
  [/ZekerFlex volgt de ABU|ZekerFlex draagt|pensioen \(StiPP\)|StiPP-pensioen en ABU/i, "StiPP of ABU-fasen bij ZekerFlex"],
  [/onder ‘Verloning’|onder Verloning|uitzendovereenkomst met ZekerFlex/i, "verloning of overeenkomst bij ZekerFlex"],
  [/via ZekerFlex verzekerd/i, "een verzekering via ZekerFlex"],
];

describe("de openbare teksten noemen ZekerFlex geen uitzendbureau of werkgever", () => {
  it.each(OPENBAAR)("%s", (p) => {
    const s = lees(p);
    for (const [re, wat] of VERBODEN) expect(s, `${p}: ${wat}`).not.toMatch(re);
  });

  it("de vaste advertenties beloven geen verloning van ZekerFlex; de feiten voor het model zeggen dat ook", () => {
    const bron = lees("lib/ads/generate.ts");
    const sjablonen = bron.slice(bron.indexOf("const TEMPLATES"), bron.indexOf("export function templateAd"));
    expect(sjablonen.length).toBeGreaterThan(100);
    expect(sjablonen).toContain("Werk als uitzendkracht via een aangesloten uitzendbureau.");
    expect(sjablonen).not.toMatch(/StiPP|ABU|wekelijks|ZekerFlex-uitzendbureau/i);
    expect(bron).toContain("ZekerFlex is zelf geen uitzendbureau en verloont niet");
  });

  it("de pagina /uitzendbureau zegt wie de werkgever is en houdt de video en de link voor bureaus", () => {
    const s = lees("app/(marketing)/uitzendbureau/page.tsx");
    expect(s).toContain("Wie is mijn werkgever bij een uitzendklus?");
    expect(s).toContain("ZekerFlex is zelf geen uitzendbureau");
    expect(s).toContain('<PaginaVideoBlok id="uitzendbureau" />');
    expect(s).toContain('href="/uitzendpartner"');
  });
});
