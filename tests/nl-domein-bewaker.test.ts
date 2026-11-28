import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Bewaker (28 nov 2026): zekerflex.nl mag nergens een wébadres zijn.
//
// Gemeten op die dag: zekerflex.nl en www.zekerflex.nl sturen de bezoeker door naar builder.vimexx.nl en geven
// daar een 401-pagina "Onbevoegd". Het platform staat op zekerflex.com. Toch noemde de verwerkersovereenkomst —
// een stuk dat bedrijven ondertekenen — "zekerflex.nl/verwerkersovereenkomst" als zichtbare tekst. Wie dat adres
// overneemt in zijn eigen administratie, of het intypt, komt op een foutmelding uit.
//
// De bewaker kijkt alleen naar het domein mét een pad erachter (zekerflex.nl/…) of als volledige link
// (https://zekerflex.nl): dat is onmiskenbaar een adres van een pagina. De naam van het domein zelf mag wel
// voorkomen — lib/admin/todo-nl-domein.ts en lib/admin/todo-dmarc.ts gaan er juist over, en admin@zekerflex.nl
// is de demo-inlognaam van de Bouwer-voorbeeldsite.

const WORTELS = ["app", "components", "lib"];
const OVERSLAAN = new Set(["node_modules", ".next", "dist"]);

/** Een adres van een pagina: met een pad erachter, of als volledige http(s)-link. */
const ALS_ADRES = /(?:https?:\/\/(?:www\.)?zekerflex\.nl|(?:^|[^@\w.])(?:www\.)?zekerflex\.nl\/[\w\-/])/i;

function bestanden(map: string): string[] {
  let namen: string[];
  try {
    namen = readdirSync(map);
  } catch {
    return [];
  }
  return namen.flatMap((n) => {
    if (OVERSLAAN.has(n)) return [];
    const p = join(map, n);
    try {
      return statSync(p).isDirectory() ? bestanden(p) : /\.tsx?$/.test(n) ? [p] : [];
    } catch {
      return [];
    }
  });
}

describe("bewaker: zekerflex.nl is geen webadres", () => {
  it("noemt zekerflex.nl nergens als adres van een pagina", () => {
    const fouten = new Set<string>();
    for (const wortel of WORTELS) {
      for (const f of bestanden(join(process.cwd(), wortel))) {
        const src = readFileSync(f, "utf8");
        if (!src.includes("zekerflex.nl")) continue;
        src.split("\n").forEach((regel, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(regel)) return; // een opmerking die het uitlegt mag
          if (ALS_ADRES.test(regel)) {
            fouten.add(`${f.slice(process.cwd().length + 1)}:${i + 1}: ${regel.trim().slice(0, 110)}`);
          }
        });
      }
    }
    expect(
      [...fouten],
      "zekerflex.nl komt op een foutmelding uit (builder.vimexx.nl, 401). Gebruik zekerflex.com, of een relatief pad.",
    ).toEqual([]);
  });

  it("de bewaker vindt het echte probleem van 28 november terug", () => {
    // zoals het in app/werkgever/instellingen/verwerkersovereenkomst/page.tsx stond
    expect(ALS_ADRES.test("            zekerflex.nl/verwerkersovereenkomst")).toBe(true);
    expect(ALS_ADRES.test('<a href="https://zekerflex.nl/klussen">')).toBe(true);
    expect(ALS_ADRES.test("www.zekerflex.nl/aanmelden")).toBe(true);
    // en laat staan wat mag
    expect(ALS_ADRES.test('"admin@zekerflex.nl"')).toBe(false);
    expect(ALS_ADRES.test('await leesDmarc("zekerflex.nl")')).toBe(false);
    expect(ALS_ADRES.test("Domeinnamen → zekerflex.nl → DNS-instellingen")).toBe(false);
  });
});
