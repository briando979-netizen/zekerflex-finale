import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>(), kapot: false }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (m.kapot) throw new Error("opslag niet bereikbaar");
    return m.kv.has(k) ? structuredClone(m.kv.get(k)) : null;
  },
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListValues: async () => [],
  kvListEntries: async () => [],
}));

import { heeftAfspraken, sleutelAfsprakenInstellingen } from "@/lib/afspraken/in-menu";
import { beginInstellingen } from "@/lib/afspraken/model";
import { bewaarInstellingen, nieuwId } from "@/lib/afspraken/store";

// Het menu-item Afspraken staat er alleen als het bedrijf afspraken heeft ingericht. De layout laadt dit bij elk
// bezoek: een storing mag de pagina nooit laten vallen, dan staat het item er gewoon niet.

beforeEach(() => {
  m.kv.clear();
  m.kapot = false;
});

describe("heeftAfspraken", () => {
  it("is false zonder instellingen en true zodra het bedrijf ze bewaarde, per organisatie", async () => {
    expect(await heeftAfspraken("t1")).toBe(false);
    await bewaarInstellingen("t1", beginInstellingen("Kapper Jan", nieuwId));
    expect(await heeftAfspraken("t1")).toBe(true);
    expect(await heeftAfspraken("t2")).toBe(false);
  });

  it("gebruikt precies de sleutel waarin lib/afspraken/store.ts de instellingen bewaart", async () => {
    await bewaarInstellingen("t1", beginInstellingen("Kapper Jan", nieuwId));
    expect(m.kv.has(sleutelAfsprakenInstellingen("t1"))).toBe(true);
    expect(sleutelAfsprakenInstellingen("t1")).toBe("afspraken:inst:t1");
  });

  it("zonder organisatie, of bij een storing in de opslag, is het false (fail-safe) en gooit nooit", async () => {
    expect(await heeftAfspraken(undefined)).toBe(false);
    expect(await heeftAfspraken("")).toBe(false);
    await bewaarInstellingen("t1", beginInstellingen("Kapper Jan", nieuwId));
    m.kapot = true;
    await expect(heeftAfspraken("t1")).resolves.toBe(false);
  });
});
