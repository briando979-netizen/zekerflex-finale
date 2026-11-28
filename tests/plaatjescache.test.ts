import { describe, expect, it } from "vitest";
import { MAX_BYTES, MAX_DAGEN, kiesOpruiming, uitOmgeving, type CacheBestand } from "@/lib/ops/plaatjescache";

// De plaatjescache van Next ruimt zichzelf nooit op (28 nov 2026: 4,2 GB in 83.213 bestanden). lib/ops/plaatjescache.ts kiest
// wat weg mag: eerst te oud, daarna te groot (oudste eerst). Vaste klok: een test met een echte datum houdt op een dag elke
// uitrol tegen.
const NU = Date.parse("2026-11-28T12:00:00+01:00");
const DAG = 86_400_000;
const MB = 1024 ** 2;

const b = (naam: string, mb: number, dagenOud: number): CacheBestand => ({
  pad: `/app/.next/cache/images/${naam}`,
  bytes: mb * MB,
  gewijzigd: NU - dagenOud * DAG,
});

describe("plaatjescache: wat mag weg", () => {
  it("een lege cache levert niets op", () => {
    const k = kiesOpruiming([], NU);
    expect(k.weg).toEqual([]);
    expect(k.bytesWeg).toBe(0);
    expect(k.bytesOver).toBe(0);
  });

  it("alles binnen de termijn en onder de grens blijft staan", () => {
    const k = kiesOpruiming([b("a", 10, 1), b("c", 10, 29)], NU);
    expect(k.weg).toEqual([]);
    expect(k.bytesOver).toBe(20 * MB);
  });

  it("ouder dan 30 dagen gaat weg", () => {
    const k = kiesOpruiming([b("vers", 10, 2), b("oud", 10, 31), b("ouder", 10, 90)], NU);
    expect(k.teOud).toBe(2);
    expect(k.teGroot).toBe(0);
    // oudste eerst
    expect(k.weg).toEqual(["/app/.next/cache/images/ouder", "/app/.next/cache/images/oud"]);
    expect(k.bytesWeg).toBe(20 * MB);
    expect(k.bytesOver).toBe(10 * MB);
  });

  it("precies 30 dagen oud blijft, een tel ouder gaat weg", () => {
    expect(kiesOpruiming([b("grens", 1, 30)], NU).weg).toEqual([]);
    const net = [{ pad: "/p", bytes: MB, gewijzigd: NU - MAX_DAGEN * DAG - 1 }];
    expect(kiesOpruiming(net, NU).weg).toEqual(["/p"]);
  });

  it("is de cache daarna nog te groot, dan gaat de oudste als eerste", () => {
    // vier verse bestanden van 1 MB, grens op 2,5 MB: de twee oudste moeten weg
    const k = kiesOpruiming([b("d", 1, 1), b("c", 1, 2), b("b", 1, 3), b("a", 1, 4)], NU, 30, 2.5 * MB);
    expect(k.teOud).toBe(0);
    expect(k.teGroot).toBe(2);
    expect(k.weg).toEqual(["/app/.next/cache/images/a", "/app/.next/cache/images/b"]);
    expect(k.bytesOver).toBe(2 * MB);
  });

  it("de twee regels werken na elkaar: eerst oud, dan groot", () => {
    const k = kiesOpruiming([b("oud", 5, 40), b("c", 2, 1), b("b", 2, 2), b("a", 2, 3)], NU, 30, 3 * MB);
    expect(k.teOud).toBe(1);
    expect(k.teGroot).toBe(2);
    expect(k.bytesOver).toBe(2 * MB);
    expect(k.weg[0]).toBe("/app/.next/cache/images/oud");
  });

  it("een regel op 0 staat uit", () => {
    const alleenOud = kiesOpruiming([b("a", 100, 1)], NU, 30, 0);
    expect(alleenOud.weg).toEqual([]);
    const alleenGroot = kiesOpruiming([b("a", 100, 999)], NU, 0, 50 * MB);
    expect(alleenGroot.teOud).toBe(0);
    expect(alleenGroot.teGroot).toBe(1);
  });

  it("het telt nooit meer weg dan er staat", () => {
    const k = kiesOpruiming([b("a", 1, 1)], NU, 30, 1);
    expect(k.weg).toHaveLength(1);
    expect(k.bytesOver).toBe(0);
    expect(k.bytesWeg).toBe(MB);
  });

  it("de standaarden zijn 30 dagen en 2 GB", () => {
    expect(MAX_DAGEN).toBe(30);
    expect(MAX_BYTES).toBe(2 * 1024 ** 3);
  });
});

describe("plaatjescache: instelling uit de omgeving", () => {
  it("leeg of ontbrekend geeft de standaard", () => {
    expect(uitOmgeving(undefined, 30)).toBe(30);
    expect(uitOmgeving("", 30)).toBe(30);
    expect(uitOmgeving("  ", 30)).toBe(30);
  });
  it("onzin geeft de standaard, een getal wint", () => {
    expect(uitOmgeving("veel", 30)).toBe(30);
    expect(uitOmgeving("7", 30)).toBe(7);
    expect(uitOmgeving("0", 30)).toBe(0);
  });
  it("negatief zet de regel uit (0), niet een negatieve grens", () => {
    expect(uitOmgeving("-5", 30)).toBe(0);
  });
});
