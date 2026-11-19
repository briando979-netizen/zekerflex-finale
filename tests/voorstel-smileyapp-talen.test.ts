import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BASE, INTERESSES, PAKKETTEN, PARTNER, QUOTES, STAPPEN, VRAAGSOORTEN, euro, veelgesteld } from "@/lib/voorstel/smileyapp";
import { valideerAanvraag } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { DEMO_PADEN, paginaNaam, somCijfers, telPad } from "@/lib/voorstel/smileyapp-cijfer-regels";
import { kiesPakket, kiezerVragen } from "@/lib/voorstel/smileyapp-kiezer";
import { VERHALEN } from "@/lib/voorstel/smileyapp-klanten";
import { metOverschrijvingen } from "@/lib/voorstel/smileyapp-pakket-regels";
import { BRANCHES } from "@/lib/voorstel/smileyapp-branches";
import { KADER, TAAL_NAAM, TALEN, VERTAALDE_PADEN, VERTALINGEN, euroTaal, isTaal, taalBasis, taalLinks, taalVanPad } from "@/lib/voorstel/smileyapp-taal";
import { TEKSTEN, brancheTaal, dagTaal, looptijdTaal, prijsTaal, veelgesteldTaal, vertaal } from "@/lib/voorstel/smileyapp-talen";
import { FORMULIER_NL, GESLOTEN_NL, KIEZER_NL, PROBEER_NL, REKEN_NL, SAMENSTEL_NL, VERGELIJK_NL, vul } from "@/lib/voorstel/smileyapp-teksten";

// ---------------------------------------------------------------------------
// Het SmileyApp-voorstel in het Engels (/en) en het Duits (/de), 19 nov 2026.
// Bewaakt: beide talen hebben precies dezelfde teksten en geen is leeg; er
// staat nergens een bedrag in een vertaling (de prijs komt uit het pakket, met
// de wijzigingen uit het beheer); elk standaard-onderdeel van een pakket heeft
// een vertaling en een aangepast onderdeel blijft Nederlands; de vertaalde
// pagina's hebben één kop, de taal op de omlijsting en geen canonical of
// hreflang; de aanvraag kent alleen de talen nl, en en de; en de taalkiezer
// linkt naar pagina's die bestaan.
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const NU = new Date("2026-11-19T10:00:00+01:00"); // donderdag
const BEDRAG = /\b(?:49|249|1499)[.,]95\b|1[.,]499[.,]95|€\s?\d|\d\s?€/;
const TAALBESTANDEN = ["lib/voorstel/smileyapp-talen.ts", "lib/voorstel/smileyapp-taal.ts", "lib/voorstel/smileyapp-teksten.ts"];

/** Alle bladeren van een tekstenobject als "pad.naar.sleutel" → waarde. */
function bladeren(waarde: unknown, pad = ""): Map<string, unknown> {
  const uit = new Map<string, unknown>();
  if (waarde !== null && typeof waarde === "object") {
    for (const [k, v] of Object.entries(waarde)) for (const [p, w] of bladeren(v, pad ? `${pad}.${k}` : k)) uit.set(p, w);
  } else uit.set(pad, waarde);
  return uit;
}

function paginas(map: string): string[] {
  const uit: string[] = [];
  const loop = (rel: string) => {
    for (const naam of readdirSync(path.join(ROOT, rel))) {
      const r = `${rel}/${naam}`;
      if (statSync(path.join(ROOT, r)).isDirectory()) loop(r);
      else if (naam === "page.tsx") uit.push(r);
    }
  };
  loop(map);
  return uit.sort();
}

const VERTAALDE_PAGINAS = VERTALINGEN.flatMap((t) => paginas(`app/voorstel/smileyapp/${t}`));

describe("de teksten: Engels en Duits zijn compleet en gelijk van vorm", () => {
  it("dezelfde sleutels in beide talen, en geen lege waarde", () => {
    const en = bladeren(TEKSTEN.en);
    const de = bladeren(TEKSTEN.de);
    expect(en.size).toBeGreaterThan(250);
    expect([...de.keys()].sort()).toEqual([...en.keys()].sort());
    for (const [taal, alles] of [["en", en], ["de", de]] as const) {
      for (const [sleutel, waarde] of alles) {
        expect(typeof waarde, `${taal}: ${sleutel}`).toBe("string");
        expect(String(waarde).trim(), `${taal}: ${sleutel}`).not.toBe("");
      }
    }
    // de omlijsting hoort erbij, en is dezelfde als die de layout gebruikt
    for (const t of VERTALINGEN) expect(TEKSTEN[t].kader).toBe(KADER[t]);
  });

  it("de Nederlandse standaard van formulier, probeer het zelf en kiezer heeft dezelfde sleutels als de vertalingen", () => {
    // deel 6b: ook de samensteller, de rekenhulp, de vergelijking en het dichte contactformulier hebben een Nederlandse
    // standaard met dezelfde sleutels; "rijen." en "interesses." zijn (zoals "onderdelen.") tabellen die in het Nederlands leeg zijn
    const sleutels = (o: object) => [...bladeren(o).keys()].filter((k) => !k.startsWith("fouten.") && !k.startsWith("onderdelen.") && !k.startsWith("rijen.") && !k.startsWith("interesses.")).sort();
    for (const t of VERTALINGEN) {
      expect(sleutels(TEKSTEN[t].samenstel), t).toEqual(sleutels(SAMENSTEL_NL));
      expect(sleutels(TEKSTEN[t].reken), t).toEqual(sleutels(REKEN_NL));
      expect(sleutels(TEKSTEN[t].vergelijk), t).toEqual(sleutels(VERGELIJK_NL));
      expect(sleutels(TEKSTEN[t].gesloten), t).toEqual(sleutels(GESLOTEN_NL));
      expect(sleutels(TEKSTEN[t].formulier), t).toEqual(sleutels(FORMULIER_NL));
      expect(sleutels(TEKSTEN[t].probeer), t).toEqual(sleutels(PROBEER_NL));
      expect(sleutels(TEKSTEN[t].kiezer), t).toEqual(sleutels(KIEZER_NL));
      expect(TEKSTEN[t].formulier.taal).toBe(t);
      expect(TEKSTEN[t].kiezer.taal).toBe(t);
    }
  });

  it("elke plek {naam} uit het Engels staat ook in het Duits (anders blijft een waarde oningevuld)", () => {
    const plekken = (s: unknown) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();
    const de = bladeren(TEKSTEN.de);
    for (const [sleutel, waarde] of bladeren(TEKSTEN.en)) expect(plekken(de.get(sleutel)), sleutel).toEqual(plekken(waarde));
    expect(vul("{a} en {b}", { a: 1 })).toBe("1 en {b}");
  });

  it("geen bedrag in een talenbestand: de prijs komt uit het pakket, alleen de schrijfwijze volgt de taal", () => {
    for (const f of TAALBESTANDEN) expect(lees(f), f).not.toMatch(BEDRAG);
    for (const t of VERTALINGEN) for (const [sleutel, waarde] of bladeren(TEKSTEN[t])) expect(String(waarde), `${t}: ${sleutel}`).not.toMatch(BEDRAG);
    expect(euroTaal(1499.95, "nl")).toBe(euro(1499.95));
    expect(euroTaal(1499.95, "en")).toBe("€1,499.95");
    expect(euroTaal(1499.95, "de")).toBe("1.499,95 €");
    expect(euroTaal(49.5, "en")).toBe("€49.50");
    for (const t of VERTALINGEN) {
      expect(prijsTaal({ prijs: null }, t)).toBe(TEKSTEN[t].pakketten.opAanvraag);
      expect(prijsTaal({ prijs: 12.5 }, t)).toBe(euroTaal(12.5, t));
      expect(looptijdTaal({ minimaalMaanden: null }, t)).toBe("");
      expect(looptijdTaal({ minimaalMaanden: 12 }, t)).toContain("12");
    }
  });

  it("het is een vertaling van wat er staat: evenveel stappen, quotes en vraagsoorten, en dezelfde namen", () => {
    for (const t of VERTALINGEN) {
      const x = TEKSTEN[t];
      expect(x.hoe.stappen).toHaveLength(STAPPEN.length);
      expect(x.hoe.vraagsoorten).toHaveLength(VRAAGSOORTEN.length);
      expect(x.klanten.quotes).toHaveLength(QUOTES.length);
      x.klanten.quotes.forEach((q, i) => expect(q, `${t} quote ${i}`).toHaveLength(QUOTES[i]?.tekst.length ?? -1));
      expect(x.hero.uitgelicht).toHaveLength(3);
      for (const woord of x.hero.uitgelicht) expect(x.hero.kop, woord).toContain(woord);
      expect(x.hero.kernwoorden).toHaveLength(3);
      // de productnaam blijft Smileyapp, en de quotes noemen hem
      expect(x.klanten.quotes.flat().join(" ")).toContain("Smileyapp");
      expect(x.datum.weekdagen).toHaveLength(7);
      expect(x.datum.maanden).toHaveLength(12);
    }
    expect(TEKSTEN.en.klanten.vertaald).toBe("Translated from Dutch");
    expect(TEKSTEN.de.klanten.vertaald).toBe("Aus dem Niederländischen übersetzt");
    // namen en organisaties van de quotes komen uit de Nederlandse gegevens, niet uit de vertaling
    const landing = lees("components/voorstel/smileyapp/taal/Landing.tsx");
    expect(landing).toContain("{q.naam}");
    expect(landing).toContain("{q.organisatie}");
    expect(landing).toContain("{t.klanten.vertaald}");
    expect(dagTaal("2026-11-23", "en")).toBe("Monday 23 November");
    expect(dagTaal("2026-11-23", "de")).toBe("Montag, 23. November");
    expect(dagTaal("geen-datum", "en")).toBe("geen-datum");
  });
});

describe("pakketten: de gegevens blijven Nederlands, de standaard heeft een vertaling", () => {
  it("elk standaard-onderdeel, lint en elke uitleg-alinea heeft een vertaling in beide talen", () => {
    for (const t of VERTALINGEN) {
      const p = TEKSTEN[t].pakketten;
      for (const pakket of PAKKETTEN) {
        for (const o of pakket.onderdelen) expect(vertaal(p.onderdelen, o).vertaald, `${t}: ${o}`).toBe(true);
        for (const u of pakket.uitleg ?? []) expect(vertaal(p.uitleg, u).vertaald, `${t}: ${u.slice(0, 30)}`).toBe(true);
        expect(vertaal(p.labels, pakket.label).vertaald, `${t}: ${pakket.label}`).toBe(true);
      }
      // en niets verzonnen: elke vertaling hoort bij een onderdeel dat echt in de standaard staat
      const standaard = new Set(PAKKETTEN.flatMap((x) => x.onderdelen));
      for (const nl of Object.keys(p.onderdelen)) expect(standaard.has(nl), `${t}: ${nl}`).toBe(true);
      // de kiezer gebruikt dezelfde tabel
      expect(TEKSTEN[t].kiezer.onderdelen).toBe(p.onderdelen);
    }
  });

  it("een onderdeel dat het team zelf schreef blijft Nederlands; een vaste sleutel als 'constructor' is geen vertaling", () => {
    const p = TEKSTEN.en.pakketten;
    expect(vertaal(p.onderdelen, "Gratis koffie bij de demo")).toEqual({ tekst: "Gratis koffie bij de demo", vertaald: false });
    expect(vertaal(p.onderdelen, "constructor")).toEqual({ tekst: "constructor", vertaald: false });
    expect(vertaal(p.onderdelen, " 1 vragenlijst ")).toEqual({ tekst: "1 questionnaire", vertaald: true });
    expect(lees("components/voorstel/smileyapp/taal/Landing.tsx")).toContain('<span {...(v.vertaald ? {} : { lang: "nl" })}>{v.tekst}</span>');
  });

  it("de veelgestelde vragen volgen de pakketten uit het beheer, met het bedrag in de schrijfwijze van de taal", () => {
    const aangepast = metOverschrijvingen({ basis: { prijs: 59.5, minimaalMaanden: 3 } });
    for (const t of VERTALINGEN) {
      const standaard = veelgesteldTaal(PAKKETTEN, t);
      // dezelfde vragen als de Nederlandse lijst, in dezelfde volgorde
      expect(standaard).toHaveLength(veelgesteld().length);
      const kost = (lijst: typeof standaard) => lijst.find((v) => v.vraag === TEKSTEN[t].faq.kost)?.antwoord ?? "";
      for (const p of PAKKETTEN) expect(kost(standaard), p.naam).toContain(p.prijs === null ? p.naam : euroTaal(p.prijs, t));
      // het aangepaste pakket noemt de nieuwe prijs en looptijd, niet meer de standaard
      const basisNaam = PAKKETTEN[0]?.naam ?? "";
      expect(kost(veelgesteldTaal(aangepast, t))).toContain(`${basisNaam}: ${euroTaal(59.5, t)}`);
      expect(kost(standaard)).toContain(`${basisNaam}: ${euroTaal(PAKKETTEN[0]?.prijs ?? 0, t)}`);
      expect(kost(veelgesteldTaal(aangepast, t))).not.toContain(`${basisNaam}: ${euroTaal(PAKKETTEN[0]?.prijs ?? 0, t)}`);
      for (const v of standaard) {
        expect(v.vraag.trim(), t).not.toBe("");
        expect(v.antwoord.trim(), v.vraag).not.toBe("");
        expect(v.antwoord, v.vraag).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it("de pakketkiezer: dezelfde uitkomst in elke taal, met vertaalde vragen en uitleg zonder oningevulde plek", () => {
    for (const t of VERTALINGEN) {
      const teksten = TEKSTEN[t].kiezer;
      const vragen = kiezerVragen(PAKKETTEN, teksten);
      const nl = kiezerVragen();
      expect(vragen.map((v) => v.keuzes.map((k) => k.nodig))).toEqual(nl.map((v) => v.keuzes.map((k) => k.nodig)));
      for (const a of vragen[0]?.keuzes ?? []) {
        for (const b of vragen[1]?.keuzes ?? []) {
          for (const c of vragen[2]?.keuzes ?? []) {
            const antwoorden = { vragenlijsten: a.nodig, beoordelingen: b.nodig, gebruikers: c.nodig };
            const advies = kiesPakket(antwoorden, PAKKETTEN, teksten);
            expect(advies.pakket.id).toBe(kiesPakket(antwoorden).pakket.id);
            expect(advies.reden).not.toMatch(/\{\w+\}/);
            expect(advies.reden).not.toMatch(BEDRAG);
            // geen Nederlands in de uitleg zolang de onderdelen de standaard zijn
            expect(advies.reden).not.toMatch(/vragenlijst|beoordeling|gebruiker|zitten|nodig/);
          }
        }
      }
    }
    expect(kiezerVragen(PAKKETTEN, TEKSTEN.en.kiezer).map((v) => v.keuzes.map((k) => k.label))).toEqual([
      ["1 questionnaire", "2 to 10", "More than 10"],
      ["1 to 100", "101 to 1,000", "More than 1,000"],
      ["1 user", "Multiple users"],
    ]);
    expect(kiesPakket({ vragenlijsten: 1, beoordelingen: 100, gebruikers: 1 }, PAKKETTEN, TEKSTEN.en.kiezer).reden).toBe("The Basis Pakket includes 1 questionnaire, 100 ratings and 1 user. That is enough for what you entered.");
    // Duits: zelfstandige naamwoorden houden hun hoofdletter, alleen de eerste letter van een onderdeel wordt klein
    expect(kiesPakket({ vragenlijsten: 10, beoordelingen: 1000, gebruikers: "meerdere" }, PAKKETTEN, TEKSTEN.de.kiezer).reden).toBe(
      "Das ISO Pakket enthält 10 Fragebögen, 1.000 Bewertungen und mehrere Benutzer. Das reicht für Ihre Angaben.",
    );
    // een aangepast onderdeel blijft Nederlands in de uitleg
    const aangepast = metOverschrijvingen({ basis: { onderdelen: ["3 vragenlijsten", "250 beoordelingen", "2 gebruikers"] } });
    expect(kiesPakket({ vragenlijsten: 3, beoordelingen: 250, gebruikers: 2 }, aangepast, TEKSTEN.en.kiezer).reden).toContain("3 vragenlijsten, 250 beoordelingen and 2 gebruikers");
  });
});

describe("de vertaalde pagina's", () => {
  // Deel 6b (19 nov 2026): de rest van de site kwam erbij in het Engels en het Duits: branches (overzicht en één branche),
  // klantverhalen, contact, partner worden, samenstellen en vergelijken. Was: vier pagina's (de voorpagina en de
  // demo-aanvraag per taal). De blog blijft Nederlands.
  it("er zijn er negen per taal: de voorpagina, de demo-aanvraag en de zeven pagina's van deel 6b", () => {
    const perTaal = ["branches/[slug]/page.tsx", "branches/page.tsx", "contact/page.tsx", "demo/page.tsx", "klanten/page.tsx", "page.tsx", "partner-worden/page.tsx", "samenstellen/page.tsx", "vergelijken/page.tsx"];
    expect(VERTAALDE_PAGINAS).toEqual(VERTALINGEN.flatMap((t) => perTaal.map((p) => `app/voorstel/smileyapp/${t}/${p}`)));
    // en geen vertaalde blog: die pagina's zouden Nederlandse tekst onder een andere taal tonen
    expect(VERTAALDE_PAGINAS.filter((p) => p.includes("/blog/"))).toEqual([]);
    const generated = lees("lib/dev/app-pages.generated.ts");
    for (const p of VERTAALDE_PAGINAS) expect(generated, p).toContain(`"file":"${p}"`);
  });

  it("elke pagina: precies één h1, de taal op de omlijsting, de pakketten uit het beheer, een eigen titel en noindex", () => {
    for (const p of VERTAALDE_PAGINAS) {
      const s = lees(p);
      const taal = p.split("/")[3] ?? "";
      expect(s.match(/<h1[\s>]/g) ?? [], p).toHaveLength(1);
      expect(s, p).toContain(`<div lang="${taal}">`);
      expect(s, p).toContain(`const TAAL = "${taal}";`);
      // deel 6b: alleen de pagina's die een pakket of een prijs tonen (voorpagina, demo-aanvraag en contact) halen de
      // pakketten op; was: elke vertaalde pagina, toen dat alleen de voorpagina en de demo-aanvraag waren
      if (/\/(?:en|de)\/(?:page|demo\/page|contact\/page)\.tsx$/.test(p)) expect(s, p).toMatch(/await (?:Promise\.all\(\[[^\]]*)?smileyappPakketten\(\)/);
      else expect(s, p).not.toContain("smileyappPakketten");
      expect(s, p).toContain('export const dynamic = "force-dynamic";');
      expect(s, p).toContain("title: { absolute: t.meta.");
      expect(s, p).toContain("description: t.meta.");
      expect(s, p).toContain("robots: { index: false, follow: false, googleBot: { index: false, follow: false } }");
      // de pagina's zijn noindex en hebben geen canonical: dus ook geen hreflang
      expect(s, p).not.toMatch(/alternates|canonical|hreflang|languages:/i);
      expect(s, p).not.toMatch(BEDRAG);
    }
    // de gedeelde opbouw heeft zelf geen h1 en geen formulier: die staan in de pagina en in AanvraagFormulier
    for (const n of readdirSync(path.join(ROOT, "components/voorstel/smileyapp/taal"))) {
      const s = lees(`components/voorstel/smileyapp/taal/${n}`);
      expect(s, n).not.toMatch(/<h1[\s>]|<form[\s>]/);
      expect(s, n).not.toMatch(BEDRAG);
      expect(s, n).not.toMatch(/alternates|canonical\(/);
    }
  });

  it("prijzen op de vertaalde voorpagina komen via prijsTaal uit het pakket; de kiezer en probeer het zelf krijgen hun teksten als gewone gegevens", () => {
    const landing = lees("components/voorstel/smileyapp/taal/Landing.tsx");
    expect(landing).toContain("{prijsTaal(p, taal)}");
    expect(landing).toContain("<PakketKiezer pakketten={pakketten} teksten={t.kiezer} basis={b} />");
    expect(landing).toContain("<ProbeerZelf vraag={t.probeerBlok.vraag} teksten={t.probeer} />");
    expect(landing).toContain("const vragen = veelgesteldTaal(pakketten, taal);");
    const demo = lees("components/voorstel/smileyapp/taal/Demo.tsx");
    expect(demo).toContain("teksten={t.formulier}");
    expect(demo).toContain("<PakketKiezer pakketten={pakketten} compact teksten={t.kiezer} basis={b} />");
    // een servercomponent geeft nooit een functie door aan een clientcomponent: de teksten zijn platte gegevens
    for (const t of VERTALINGEN) for (const [sleutel, waarde] of bladeren(TEKSTEN[t])) expect(typeof waarde, `${t}: ${sleutel}`).not.toBe("function");
    // client-onderdelen laden het grote talenbestand niet (alleen het kleine met de omlijsting)
    for (const f of ["OpTaal.tsx", "TaalKiezer.tsx", "SmileyMenuTaal.tsx", "SmileyMenu.tsx", "SmileyChat.tsx", "AanvraagFormulier.tsx", "PakketKiezer.tsx", "ProbeerZelf.tsx"]) {
      const s = lees(`components/voorstel/smileyapp/${f}`);
      expect(s, f).toContain('"use client"');
      expect(s, f).not.toContain("smileyapp-talen");
    }
  });

  it("de omlijsting: de Nederlandse band blijft staan, de vertaling komt eronder, en kop en footer dragen lang", () => {
    const layout = lees("app/voorstel/smileyapp/layout.tsx");
    expect(layout).toContain('VOORSTEL_BAND.split("smileyapp.nl")');
    expect(layout).toContain("<BandTaal taal={taal} />");
    expect(layout.indexOf("{naBand}")).toBeLessThan(layout.indexOf("<BandTaal taal={taal} />"));
    expect(layout).toContain("<KopTaal taal={taal} />");
    expect(layout).toContain("<VoetTaal taal={taal} />");
    expect(layout.match(/<OpTaal taal="nl">/g)).toHaveLength(2);
    expect(layout.match(/<TaalKiezer variant="(band|footer)" \/>/g)).toHaveLength(2);
    const kader = lees("components/voorstel/smileyapp/taal/Kader.tsx");
    expect(kader.match(/lang=\{taal\}/g)?.length).toBeGreaterThanOrEqual(3);
    expect(kader).toContain('<TaalKiezer variant="footer" />');
    expect(lees("components/voorstel/smileyapp/SmileyMenu.tsx")).toContain('<TaalKiezer variant="menu" />');
    expect(lees("components/voorstel/smileyapp/SmileyMenuTaal.tsx")).toContain('<TaalKiezer variant="menu" />');
    for (const t of VERTALINGEN) {
      expect(KADER[t].band, t).toContain("smileyapp.nl");
      expect(KADER[t].band, t).toContain("ZekerFlex");
    }
    // de chat antwoordt Nederlands, en zegt dat eerlijk
    expect(KADER.en.chat.begroeting).toContain("The assistant answers in Dutch for now.");
    expect(KADER.de.chat.begroeting).toContain("Der Assistent antwortet vorerst auf Niederländisch.");
    expect(lees("components/voorstel/smileyapp/SmileyChat.tsx")).toContain("const taal = taalVanPad(usePathname());");
  });
});

// Deel 6b (19 nov 2026): de branches, de klantverhalen, contact, partner worden, samenstellen en vergelijken in het
// Engels en het Duits. Een vertaling zegt niets wat de Nederlandse tekst niet zegt: evenveel alinea's, momenten en
// vragen, dezelfde namen, en geen cijfer of bedrag erbij.
describe("deel 6b: de rest van de site in het Engels en het Duits", () => {
  it("elke branche heeft een vertaling met evenveel alinea's, momenten en voorbeeldvragen, zonder cijfers in de inleiding", () => {
    for (const t of VERTALINGEN) {
      expect(Object.keys(TEKSTEN[t].branches), t).toEqual(Object.keys(BRANCHES));
      for (const [slug, nl] of Object.entries(BRANCHES)) {
        const v = brancheTaal(slug, t);
        expect(v, `${t}: ${slug}`).toBeDefined();
        expect(v?.intro, slug).toHaveLength(nl.intro.length);
        expect(v?.momenten, slug).toHaveLength(nl.momenten.length);
        expect(v?.vragen, slug).toHaveLength(nl.vragen.length);
        expect(new Set(v?.vragen).size, slug).toBe(nl.vragen.length);
        // dezelfde regel als de Nederlandse inleiding: geen cijfers, percentages of bedragen
        expect(`${v?.kop ?? ""} ${v?.intro.join(" ") ?? ""} ${v?.momenten.join(" ") ?? ""}`, `${t}: ${slug}`).not.toMatch(/\d|%|€/);
        // een vraag eindigt als vraag of als uitnodiging, net als het origineel
        nl.vragen.forEach((vraag, i) => expect((v?.vragen[i] ?? "").endsWith("?"), `${t}: ${slug} ${i}`).toBe(vraag.tekst.endsWith("?")));
      }
      for (const x of ["constructor", "toString", "Horeca", ""]) expect(brancheTaal(x, t), x).toBeUndefined();
      // het Maatwerk Pakket houdt zijn naam
      expect(TEKSTEN[t].branches.evenementen?.intro.join(" ")).toContain("Maatwerk Pakket");
    }
    // wat een voorbeeld is, heet ook in de vertaling een voorbeeld, van ZekerFlex
    expect(TEKSTEN.en.branchePagina.voorbeeldUitleg).toContain("an example by ZekerFlex, not a questionnaire from a Smileyapp customer");
    expect(TEKSTEN.de.branchePagina.voorbeeldUitleg).toContain("ein Beispiel von ZekerFlex, kein Fragebogen eines Kunden von Smileyapp");
    const paginas = lees("components/voorstel/smileyapp/taal/Paginas.tsx");
    expect(paginas).toContain("{t.voorbeeldLabel}");
    expect(paginas).toContain("{t.voorbeeldUitleg}");
  });

  it("de klantverhalen: de twee echte quotes blijven Nederlands, met lang en de regel dat het het origineel is", () => {
    for (const t of VERTALINGEN) {
      expect(Object.keys(TEKSTEN[t].klantenPagina.verhalen), t).toEqual(VERHALEN.map((v) => v.id));
      for (const v of VERHALEN) {
        const x = TEKSTEN[t].klantenPagina.verhalen[v.id];
        expect(x?.meten, v.id).toHaveLength(v.meten.length);
        expect(typeof x?.eerst, v.id).toBe(typeof v.eerst);
        // net als het Nederlands: geen resultaten of cijfers
        expect(`${x?.gebruik ?? ""} ${x?.eerst ?? ""} ${x?.meten.join(" ") ?? ""}`, v.id).not.toMatch(/\d|%|€/);
      }
    }
    expect(TEKSTEN.en.klantenPagina.origineel).toBe("Original in Dutch");
    expect(TEKSTEN.de.klantenPagina.origineel).toBe("Original auf Niederländisch");
    const paginas = lees("components/voorstel/smileyapp/taal/Paginas.tsx");
    // de quote zelf komt uit de Nederlandse gegevens (v.quote), niet uit een vertaling
    expect(paginas).toMatch(/<blockquote lang="nl"[^>]*>\s*\{v\.quote\.map\(/);
    expect(paginas).toContain("{t.origineel}");
    expect(paginas).not.toContain("klanten.quotes");
  });

  it("partner worden en contact: dezelfde opbouw, het contactformulier blijft dicht en de interesses gaan in het Nederlands mee", () => {
    for (const t of VERTALINGEN) {
      const p = TEKSTEN[t].partner;
      expect(p.kort, t).toHaveLength(PARTNER.kort.length);
      expect(p.uitleg, t).toHaveLength(PARTNER.uitleg.length);
      expect(p.voordelen, t).toHaveLength(PARTNER.voordelen.length);
      // geen percentage of bedrag bij de commissie: dat staat ook niet op hun site
      expect(`${p.kort.join(" ")} ${p.uitleg.join(" ")} ${p.voordelen.join(" ")}`, t).not.toMatch(/\d|%|€/);
      // alleen de twee keuzes die geen pakketnaam zijn, hebben een vertaling
      expect(Object.keys(TEKSTEN[t].gesloten.interesses).sort()).toEqual(INTERESSES.filter((i) => !PAKKETTEN.some((x) => x.naam === i)).sort());
    }
    const contact = lees("components/voorstel/smileyapp/taal/Contact.tsx");
    expect(contact).toContain("<GeslotenFormulier ");
    expect(contact).toContain("teksten={alles.gesloten}");
    expect(contact).toContain("{prijsTaal(gekozen, taal)}");
    expect(contact).toContain("interesses={INTERESSES} interesseLabels={alles.gesloten.interesses} teksten={alles.formulier}");
    const gesloten = lees("components/voorstel/smileyapp/GeslotenFormulier.tsx");
    expect(gesloten).toContain("teksten: t = GESLOTEN_NL");
    expect(gesloten).toContain("<fieldset disabled");
    // het formulier toont het etiket van de taal, maar stuurt de Nederlandse waarde die de server kent
    const formulier = lees("components/voorstel/smileyapp/AanvraagFormulier.tsx");
    expect(formulier).toContain("{Object.hasOwn(interesseLabels, i) ? interesseLabels[i] : i}");
    expect(formulier).toContain("onChange={() => wissel(i)}");
  });

  it("het menu en de footer op /en en /de linken naar de vertaalde pagina's; alleen de blog blijft Nederlands", () => {
    for (const t of VERTALINGEN) {
      const m = KADER[t].menu;
      for (const sleutel of ["branches", "verhalen", "samenstellen", "vergelijken", "partner", "contact"] as const) expect(m[sleutel].trim(), `${t}: ${sleutel}`).not.toBe("");
      expect(KADER[t].footer.blog, t).toMatch(/Dutch|Niederländisch/);
    }
    const kader = lees("components/voorstel/smileyapp/taal/Kader.tsx");
    expect(kader).toContain("const links = [...secties(taal), ...paginas(taal)];");
    // het uitklapmenu op de telefoon is niet te scrollen: hooguit acht links
    expect((kader.match(/telefoon: true/g) ?? []).length).toBeLessThanOrEqual(8);
    // geen link meer naar een Nederlandse pagina die nu een vertaling heeft
    expect(kader).not.toMatch(/MENU_FOOTER|\bMENU\b/);
    expect(lees("components/voorstel/smileyapp/taal/Landing.tsx")).toContain("<Link href={`${b}/klanten`}");
  });
});

describe("taal van een pad en de taalkiezer", () => {
  it("de taal volgt het pad, lang én kort (subdomein)", () => {
    expect(TALEN).toEqual(["nl", "en", "de"]);
    for (const [pad, taal] of [
      [BASE, "nl"],
      [`${BASE}/demo`, "nl"],
      [`${BASE}/en`, "en"],
      [`${BASE}/en/demo`, "en"],
      [`${BASE}/de`, "de"],
      ["/de/demo", "de"],
      ["/en", "en"],
      ["/", "nl"],
      ["/demo", "nl"],
      [`${BASE}/enquete`, "nl"],
      ["/dekking", "nl"],
      [`${BASE}/blog/en`, "nl"],
      ["", "nl"],
    ] as const) {
      expect(taalVanPad(pad), pad).toBe(taal);
    }
    expect(taalVanPad(null)).toBe("nl");
    expect([taalBasis("nl"), taalBasis("en"), taalBasis("de")]).toEqual([BASE, `${BASE}/en`, `${BASE}/de`]);
    expect(isTaal("de")).toBe(true);
    for (const x of ["fr", "", "NL", "constructor", null, 5]) expect(isTaal(x), String(x)).toBe(false);
    expect(TAAL_NAAM.en).toBe("Engels");
  });

  it("de taalkiezer linkt alleen naar pagina's die bestaan", () => {
    // deel 6b: een branchepagina bestaat in elke taal als [slug]; de slug zelf moet een branche uit de vaste lijst zijn
    const bestaat = (href: string) => {
      const branche = /^(.*\/branches)\/([a-z]+)$/.exec(href);
      if (branche) return Object.hasOwn(BRANCHES, branche[2] ?? "") && existsSync(path.join(ROOT, "app", `${branche[1]}/[slug]/page.tsx`));
      return existsSync(path.join(ROOT, "app", href === BASE ? `${BASE}/page.tsx` : `${href}/page.tsx`));
    };
    const PADEN = [BASE, `${BASE}/demo`, `${BASE}/blog`, `${BASE}/blog/een-bericht`, `${BASE}/branches`, `${BASE}/branches/horeca`, `${BASE}/branches/bestaat-niet`, `${BASE}/klanten`, `${BASE}/partner-worden`, `${BASE}/contact`, `${BASE}/samenstellen`, `${BASE}/vergelijken`, `${BASE}/en`, `${BASE}/en/demo`, `${BASE}/en/branches/zorg`, `${BASE}/de`, `${BASE}/de/demo`, `${BASE}/de/vergelijken`, "/", "/demo", "/en", "/de/demo/", "/de/klanten", "/en/branches/constructor"];
    for (const pad of PADEN) {
      const links = taalLinks(pad);
      expect(links.map((l) => l.taal), pad).toEqual(["nl", "en", "de"]);
      expect(links.filter((l) => l.actief), pad).toHaveLength(1);
      for (const l of links) expect(bestaat(l.href), `${pad} → ${l.href}`).toBe(true);
    }
    const href = (pad: string) => taalLinks(pad).map((l) => l.href);
    // een Nederlandse pagina zonder vertaling (de blog): EN en DE leiden naar de voorpagina in die taal
    expect(href(`${BASE}/blog`)).toEqual([BASE, `${BASE}/en`, `${BASE}/de`]);
    expect(href(`${BASE}/blog/een-bericht`)).toEqual([BASE, `${BASE}/en`, `${BASE}/de`]);
    // deel 6b: contact en de andere vertaalde pagina's houden je op dezelfde pagina. Was: contact → de voorpagina in die taal.
    for (const p of VERTAALDE_PADEN) expect(href(`${BASE}${p}`), p).toEqual([`${BASE}${p}`, `${BASE}/en${p}`, `${BASE}/de${p}`]);
    expect(VERTAALDE_PADEN).toEqual(["/demo", "/branches", "/klanten", "/contact", "/partner-worden", "/samenstellen", "/vergelijken"]);
    expect(href("/de/contact")).toEqual([`${BASE}/contact`, `${BASE}/en/contact`, `${BASE}/de/contact`]);
    expect(href(`${BASE}/en/branches/horeca`)).toEqual([`${BASE}/branches/horeca`, `${BASE}/en/branches/horeca`, `${BASE}/de/branches/horeca`]);
    // een branche die niet bestaat (ook "constructor") heeft nergens een pagina: dan de voorpagina
    expect(href(`${BASE}/branches/constructor`)).toEqual([BASE, `${BASE}/en`, `${BASE}/de`]);
    expect(href("/en/branches/bestaat-niet")).toEqual([BASE, `${BASE}/en`, `${BASE}/de`]);
    // op /en en /de leidt NL naar de Nederlandse voorpagina
    expect(href(`${BASE}/en`)).toEqual([BASE, `${BASE}/en`, `${BASE}/de`]);
    expect(href("/de")).toEqual([BASE, `${BASE}/en`, `${BASE}/de`]);
    // de demo-aanvraag bestaat in alle drie de talen: daar blijf je op de demo-aanvraag
    expect(href(`${BASE}/demo`)).toEqual([`${BASE}/demo`, `${BASE}/en/demo`, `${BASE}/de/demo`]);
    expect(href("/en/demo")).toEqual([`${BASE}/demo`, `${BASE}/en/demo`, `${BASE}/de/demo`]);
    expect(taalLinks(`${BASE}/de/demo`).find((l) => l.actief)?.taal).toBe("de");
  });
});

describe("de aanvraag bewaart de taal van het formulier", () => {
  const basis = { soort: "demo", naam: "Jan Jansen", bedrijf: "Bakkerij Jansen", email: "jan@bakkerij.test", toestemming: true };

  it("alleen nl, en of de; zonder taal blijft een aanvraag geldig", () => {
    for (const taal of TALEN) expect(valideerAanvraag({ ...basis, taal }, NU)).toMatchObject({ ok: true, waarde: { taal } });
    const zonder = valideerAanvraag(basis, NU);
    expect(zonder.ok && "taal" in zonder.waarde).toBe(false);
    for (const taal of ["fr", "EN", "constructor", "nl "]) expect(valideerAanvraag({ ...basis, taal }, NU), taal).toMatchObject({ ok: false, veld: "taal" });
    // een partner-aanmelding bewaart de taal ook
    expect(valideerAanvraag({ ...basis, soort: "partner", taal: "de" }, NU)).toMatchObject({ ok: true, waarde: { taal: "de" } });
  });

  it("de route weigert een andere taal al bij de vorm, het formulier stuurt zijn taal mee en het beheer toont hem", () => {
    const route = lees("app/api/voorstel/smileyapp/aanvraag/route.ts");
    expect(route).toContain('taal: z.enum(["nl", "en", "de"]).optional(),');
    const formulier = lees("components/voorstel/smileyapp/AanvraagFormulier.tsx");
    expect(formulier).toContain("taal: t.taal,");
    expect(formulier).toContain("teksten: t = FORMULIER_NL");
    expect(FORMULIER_NL.taal).toBe("nl");
    // een vertaald formulier heeft een eigen melding voor elk veld dat de server kan afkeuren
    const velden = [...lees("lib/voorstel/smileyapp-aanvraag-regels.ts").matchAll(/return fout\("(\w+)"/g)].map((m) => m[1] ?? "");
    expect(new Set(velden).size).toBeGreaterThan(8);
    for (const t of VERTALINGEN) for (const veld of velden.filter((v) => v !== "soort" && v !== "taal")) expect(Object.hasOwn(TEKSTEN[t].formulier.fouten, veld), `${t}: ${veld}`).toBe(true);
    const beheer = lees("components/voorstel/smileyapp/beheer/Aanvragen.tsx");
    expect(beheer).toContain('{a.taal && a.taal !== "nl" && (');
    expect(beheer).toContain('<dd className="font-semibold">{TAAL_NAAM[a.taal]}</dd>');
  });
});

describe("bezoekcijfers tellen de vertaalde pagina's", () => {
  it("/en, /de en hun demo-aanvraag staan in de vaste lijst, met een naam voor het beheer", () => {
    for (const pad of ["/en", "/de", "/en/demo", "/de/demo"]) {
      expect(telPad(pad), pad).toBe(pad);
      expect(telPad(`${BASE}${pad}`), pad).toBe(pad);
      expect(paginaNaam(pad), pad).not.toBe(pad);
    }
    expect(paginaNaam("/en")).toBe("Voorpagina (Engels)");
    expect(paginaNaam("/de/demo")).toBe("Demo aanvragen (Duits)");
    // deel 6b: /de/contact telt nu mee (de pagina bestaat); was: ook "/de/contact" in deze lijst van paden die niet tellen
    for (const pad of ["/fr", "/en/blog", "/de/blog/een-bericht", "/en/demo/x", "/en?x=1", "/en/branches/constructor", "/fr/contact"]) expect(telPad(pad), pad).toBeNull();
    for (const pad of ["/samenstellen", "/vergelijken", "/de/contact", "/en/klanten", "/en/partner-worden", "/de/branches", "/en/samenstellen", "/de/vergelijken", "/en/branches/horeca"]) expect(telPad(pad), pad).toBe(pad);
    expect(paginaNaam("/de/contact")).toBe("Contact (Duits)");
    expect(paginaNaam("/en/samenstellen")).toBe("Vragenlijst samenstellen (Engels)");
    expect(paginaNaam("/en/branches/horeca")).toBe("Branche: Horeca (Engels)");
    expect(paginaNaam("/branches/horeca")).toBe("Branche: Horeca");
  });

  it("het percentage telt de demo-aanvraag in alle talen als noemer", () => {
    expect(DEMO_PADEN).toEqual(["/demo", "/en/demo", "/de/demo"]);
    const c = somCijfers(["2026-11-19"], [{ v: "40", a: "2", "p:/demo": "10", "p:/en/demo": "6", "p:/de/demo": "4", "p:/en": "20" }]);
    expect(c.demoWeergaven).toBe(20);
    expect(c.percentage).toBe(10);
    expect(c.paginas.map((p) => p.naam)).toContain("Voorpagina (Engels)");
  });
});
