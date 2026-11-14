import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BERICHT_MAX, INKORT_TOON, inkorten, isTeLang, tekstAlsBestand, tekstBestandNaam, voorproef } from "@/lib/chat/lange-tekst";

// Lange tekst in de chat (14 nov 2026): tot BERICHT_MAX een gewoon bericht, langer als .txt-bijlage; nooit stil afkappen.
const lees = (pad: string) => readFileSync(pad, "utf8");

describe("grens van een bericht", () => {
  it("tot en met BERICHT_MAX tekens is een gewoon bericht, daarboven te lang", () => {
    expect(BERICHT_MAX).toBe(10_000);
    expect(isTeLang("a".repeat(BERICHT_MAX))).toBe(false);
    expect(isTeLang(`  ${"a".repeat(BERICHT_MAX)}  `)).toBe(false);
    expect(isTeLang("a".repeat(BERICHT_MAX + 1))).toBe(true);
  });
});

describe("voorproef (onderschrift bij het tekstbestand)", () => {
  it("een korte tekst blijft gelijk, op één regel", () => {
    expect(voorproef("Hallo\n\nwereld")).toBe("Hallo wereld");
  });

  it("een lange tekst wordt op een spatie afgekapt, met …", () => {
    const v = voorproef("woord ".repeat(100));
    expect(v.endsWith("woord…")).toBe(true);
    expect(v.length).toBeLessThanOrEqual(161);
  });

  it("knipt nooit een emoji doormidden", () => {
    // met één letter ervoor valt de grens midden in een emoji
    const v = voorproef(`a${"😀".repeat(200)}`);
    expect(v.endsWith("…")).toBe(true);
    const c = v.charCodeAt(v.length - 2);
    expect(c >= 0xd800 && c <= 0xdbff).toBe(false);
  });
});

describe("inkorten in de bubbel (Lees meer)", () => {
  it("een gewoon bericht blijft heel", () => {
    expect(inkorten("kort bericht")).toEqual({ kort: "kort bericht", ingekort: false });
  });

  it("een lang bericht toont eerst het begin", () => {
    const lang = "regel met woorden\n".repeat(200);
    const r = inkorten(lang);
    expect(r.ingekort).toBe(true);
    expect(r.kort.length).toBeLessThanOrEqual(INKORT_TOON);
    expect(lang.startsWith(r.kort)).toBe(true);
  });
});

describe("het tekstbestand", () => {
  it("naam in Nederlandse tijd, zonder rare tekens", () => {
    const nu = new Date("2026-11-14T01:57:00+01:00");
    expect(tekstBestandNaam("bericht", nu)).toBe("bericht-2026-11-14-0157.txt");
    expect(tekstBestandNaam("povidomlennia", nu)).toBe("povidomlennia-2026-11-14-0157.txt");
    // alleen tekens buiten a-z: dan gewoon "bericht"
    expect(tekstBestandNaam("повідомлення", nu)).toBe("bericht-2026-11-14-0157.txt");
  });

  it("is text/plain met een BOM vooraan, zodat é en ë goed in de browser staan", async () => {
    const tekst = "Één lange tekst met ë en é\nregel twee";
    const f = tekstAlsBestand(tekst, "bericht.txt");
    expect(f.type).toBe("text/plain");
    expect(f.name).toBe("bericht.txt");
    const bytes = new Uint8Array(await f.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8").decode(bytes)).toBe(tekst);
  });
});

describe("overal dezelfde grens, geen stille afkapping", () => {
  it("het hoofdveld van de chat heeft geen maxLength van 4000 meer en kent de lange-tekstroute", () => {
    const c = lees("components/chat/Composer.tsx");
    expect(c).not.toMatch(/maxLength=\{4000\}/);
    expect(c).toContain("tekstAlsBestand(");
    expect(c).toContain("isTeLang(t)");
  });

  it("de routes en de opslag gebruiken BERICHT_MAX", () => {
    for (const pad of ["app/api/inbox/[threadId]/route.ts", "app/api/inbox/[threadId]/edit/route.ts", "app/api/inbox/route.ts", "lib/messaging/store.ts"]) {
      const s = lees(pad);
      expect(s, pad).toContain("BERICHT_MAX");
      expect(s, pad).not.toMatch(/max\(4000\)|const clean = text\.trim\(\)\.slice\(0, 4000\)/);
    }
  });
});
