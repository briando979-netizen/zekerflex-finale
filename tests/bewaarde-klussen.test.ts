import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { SAVED_KEY, SAVED_MAX, readSaved, toggleSaved } from "@/lib/shifts/bewaard";

// Het hartje op een klus bewaarde al op het apparaat, maar nergens kon je de
// bewaarde klussen terugzien. Nu staan ze in Klussen onder "Bewaard".

function memoryStore(start?: string) {
  const data = new Map<string, string>();
  if (start !== undefined) data.set(SAVED_KEY, start);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    raw: () => data.get(SAVED_KEY),
  };
}

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("bewaarde klussen op het apparaat", () => {
  it("bewaart en haalt weg met hetzelfde hartje", () => {
    const store = memoryStore();
    expect([...toggleSaved(store, "klus-1")]).toEqual(["klus-1"]);
    expect([...toggleSaved(store, "klus-2")]).toEqual(["klus-1", "klus-2"]);
    expect([...toggleSaved(store, "klus-1")]).toEqual(["klus-2"]);
    expect(readSaved(store).has("klus-2")).toBe(true);
    expect(readSaved(store).has("klus-1")).toBe(false);
  });

  it("leest de lijst die het oude hartje al schreef", () => {
    expect([...readSaved(memoryStore(JSON.stringify(["a", "b"])))]).toEqual(["a", "b"]);
  });

  it("houdt hooguit de nieuwste bewaard", () => {
    const store = memoryStore(JSON.stringify(Array.from({ length: SAVED_MAX }, (_, i) => `oud-${i}`)));
    const set = toggleSaved(store, "nieuw");
    expect(set.size).toBe(SAVED_MAX);
    expect(set.has("nieuw")).toBe(true);
    expect(set.has("oud-0")).toBe(false);
    expect(set.has("oud-1")).toBe(true);
  });

  it("struikelt niet over kapotte of geblokkeerde opslag", () => {
    expect(readSaved(memoryStore("{kapot")).size).toBe(0);
    expect([...readSaved(memoryStore(JSON.stringify(["a", 3, null, { x: 1 }])))]).toEqual(["a"]);
    expect(readSaved(memoryStore(JSON.stringify({ a: 1 }))).size).toBe(0);
    expect(readSaved(null).size).toBe(0);
    const vol = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    expect([...toggleSaved(vol, "klus-1")]).toEqual(["klus-1"]);
    expect([...toggleSaved(null, "klus-1")]).toEqual(["klus-1"]);
  });

  it("heeft de teksten in vijf talen", () => {
    for (const l of ["nl", "en", "pl", "ro", "uk"] as const) {
      const t = FREELANCER_DICTS[l];
      for (const v of [t.market.qSaved, t.market.saved, t.card.save, t.card.unsave]) expect(v.trim(), l).not.toBe("");
      if (l !== "nl") expect(t.card.save).not.toBe(FREELANCER_DICTS.nl.card.save);
    }
  });

  it("hartje en klussenlijst zijn met elkaar verbonden", () => {
    const heart = read("components/app/SaveShiftHeart.tsx");
    expect(heart).toContain("toggleSaved(deviceStore(), shiftId)");
    expect(heart).toContain("new Event(SAVED_EVENT)");
    expect(heart).not.toMatch(/aria-label=\{saved \? "/);

    const feed = read("components/app/MarketplaceView.tsx");
    expect(feed).toContain('{ k: "saved", l: mk.qSaved }');
    expect(feed).toContain('quick.has("saved") && !saved.has(s.id)');
    expect(feed).toContain("window.addEventListener(SAVED_EVENT, load)");

    expect(read("components/app/ShiftCard.tsx")).toContain("labels={{ save: c.save, unsave: c.unsave }}");
    expect(read("app/dashboard/klussen/[shiftId]/page.tsx")).toContain("labels={{ save: ft.card.save, unsave: ft.card.unsave }}");
  });
});
