import { describe, expect, it } from "vitest";
import { tegoedTekst, lesduur, saldo } from "@/lib/rijschool/tegoed";
import { amsterdamClock } from "@/lib/time/amsterdam";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";

describe("rijschool herkomst achter de proxy", () => {
  const intern = "http://app:3000/api/rijschool/site/x/account";
  const koppen = (h: Record<string, string>) => new Headers(h);

  it("de eigen site achter Caddy: request.url is intern, de Host is zekerflex.com", () => {
    expect(zelfdeHerkomst(koppen({ origin: "https://zekerflex.com", host: "zekerflex.com" }), intern)).toBe(true);
    expect(zelfdeHerkomst(koppen({ origin: "https://zekerflex.com", host: "app:3000", "x-forwarded-host": "zekerflex.com" }), intern)).toBe(true);
  });

  it("een andere website wordt geweigerd", () => {
    expect(zelfdeHerkomst(koppen({ origin: "https://kwaadwillend.example", host: "zekerflex.com" }), intern)).toBe(false);
    expect(zelfdeHerkomst(koppen({ origin: "geen-url", host: "zekerflex.com" }), intern)).toBe(false);
  });

  it("zonder Origin (geen browser-post van een andere site) mag het", () => {
    expect(zelfdeHerkomst(koppen({ host: "zekerflex.com" }), intern)).toBe(true);
  });
});

const klok = (ds: Date[]) => ds.map((d) => amsterdamClock(d));

describe("rijschool tegoed", () => {
  it("saldo en tekst", () => {
    expect(saldo([{ minuten: 600 }, { minuten: -60 }, { minuten: -90 }])).toBe(450);
    expect(tegoedTekst(0, 60)).toBe("Geen tegoed");
    expect(tegoedTekst(60, 60)).toBe("1 les");
    expect(tegoedTekst(270, 60)).toBe("4 lessen en 30 min");
    expect(tegoedTekst(30, 60)).toBe("30 min");
    expect(tegoedTekst(-120, 60)).toBe("2 lessen te weinig");
  });

  it("lesduur in minuten", () => {
    expect(lesduur("2026-11-03T09:00:00Z", "2026-11-03T10:30:00Z")).toBe(90);
    expect(lesduur("2026-11-03T10:00:00Z", "2026-11-03T09:00:00Z")).toBe(0);
  });
});
