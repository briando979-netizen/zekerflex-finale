import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  bewaarConceptVoorGebruiker,
  haalConceptVoorGebruiker,
  KLUS_CONCEPT_PREFIX,
  klusConceptSleutel,
  leesConceptUitFormulier,
  MAX_CONCEPT_TEKENS,
  wisConceptVoorGebruiker,
} from "@/lib/klusconcept/server-opslag";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";

const NU = Date.parse("2026-11-14T05:00:00Z");
const DAG = 86_400_000;
const concept = {
  v: 1,
  title: "Magazijnmedewerker",
  description: "Orderpicken in de ochtend.",
  city: "Veendam",
  date: "2026-11-20",
  start: "08:00",
  end: "16:30",
  breakMinutes: 30,
  positions: 2,
  rateCents: 1700,
  savedAt: NU - 2 * DAG,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NU));
  kv.clear();
});
afterEach(() => vi.useRealTimers());

describe("klusconcept aan de serverkant: het verborgen veld lezen", () => {
  it("neemt een goed concept over en laat alles wat niet klopt vallen zonder fout", () => {
    expect(leesConceptUitFormulier(JSON.stringify(concept))).toEqual(concept);
    expect(leesConceptUitFormulier(null)).toBeNull();
    expect(leesConceptUitFormulier("")).toBeNull();
    expect(leesConceptUitFormulier("{niet json")).toBeNull();
    expect(leesConceptUitFormulier(JSON.stringify({ ...concept, extra: "veld" }))).toBeNull();
    expect(leesConceptUitFormulier(JSON.stringify({ ...concept, rateCents: 999_999 }))).toBeNull();
    expect(leesConceptUitFormulier(JSON.stringify({ ...concept, positions: 0 }))).toBeNull();
    expect(leesConceptUitFormulier(JSON.stringify({ ...concept, title: "x" }))).toBeNull();
    expect(leesConceptUitFormulier(JSON.stringify({ ...concept, start: "25:00" }))).toBeNull();
    expect(leesConceptUitFormulier(JSON.stringify({ ...concept, description: "a".repeat(2001) }))).toBeNull();
  });

  it("weigert een te groot veld en een concept ouder dan 14 dagen", () => {
    expect(leesConceptUitFormulier(JSON.stringify({ ...concept, description: "a".repeat(MAX_CONCEPT_TEKENS) }))).toBeNull();
    expect(leesConceptUitFormulier(JSON.stringify({ ...concept, savedAt: NU - 15 * DAG }))).toBeNull();
    expect(leesConceptUitFormulier(JSON.stringify({ ...concept, savedAt: NU - 13 * DAG }))).not.toBeNull();
  });
});

describe("klusconcept aan de serverkant: bewaren, ophalen, wissen", () => {
  it("bewaart onder klus-concept:<userId>, geeft het terug en wist het op verzoek", async () => {
    await bewaarConceptVoorGebruiker("usr1", concept);
    expect(kv.has(klusConceptSleutel("usr1"))).toBe(true);
    expect(await haalConceptVoorGebruiker("usr1", NU, "2026-11-14")).toEqual(concept);
    expect(await haalConceptVoorGebruiker("usr2", NU, "2026-11-14")).toBeNull();
    await wisConceptVoorGebruiker("usr1");
    expect(await haalConceptVoorGebruiker("usr1", NU, "2026-11-14")).toBeNull();
  });

  it("wist een verlopen concept of een klusdatum in het verleden meteen", async () => {
    await bewaarConceptVoorGebruiker("usr1", concept);
    expect(await haalConceptVoorGebruiker("usr1", NU + 15 * DAG, "2026-11-29")).toBeNull();
    expect(kv.has(klusConceptSleutel("usr1"))).toBe(false);
    await bewaarConceptVoorGebruiker("usr1", concept);
    expect(await haalConceptVoorGebruiker("usr1", NU, "2026-11-21")).toBeNull();
    expect(kv.has(klusConceptSleutel("usr1"))).toBe(false);
  });

  it("valt onder het recht op verwijdering: het voorvoegsel staat in ERASABLE_KV_PREFIXES", () => {
    expect(ERASABLE_KV_PREFIXES).toContain(KLUS_CONCEPT_PREFIX);
    expect(klusConceptSleutel("abc")).toBe("klus-concept:abc");
  });
});
