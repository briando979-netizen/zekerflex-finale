import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

// Het deelbeeld van een rijschoolsite (og:image): 1200×630 JPEG, de foto
// bovenaan de site als die er is, anders de weg met het stuur in haar kleuren.

let foto: Buffer | null = null;
let fotoTijd: string | null = null;
vi.mock("@/lib/rijschool/heldfoto", () => ({
  leesHeldfoto: async () => foto,
  heldfoto: async () => (fotoTijd ? { uploadId: "u1", at: fotoTijd } : null),
}));

import { deelbeeldJpg, deelbeeldPad, deelbeeldUrl } from "@/lib/rijschool/deelbeeld";

const r = { id: "r1", slug: "jansen", kleur: "#1D4E89", accent: "#F2B544", updatedAt: new Date("2026-11-04T10:00:00Z") };

beforeEach(() => {
  foto = null;
  fotoTijd = null;
});

describe("deelbeeld van een rijschoolsite", () => {
  it("zonder foto: de weg met het stuur in de kleur van de rijschool, 1200×630 JPEG", async () => {
    const jpg = await deelbeeldJpg(r);
    const m = await sharp(jpg).metadata();
    expect([m.format, m.width, m.height]).toEqual(["jpeg", 1200, 630]);
    // de bovenhoek is de kleur van de rijschool (#1D4E89), niet wit of zwart
    const { data } = await sharp(jpg).extract({ left: 600, top: 10, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(Math.abs((data[0] ?? 0) - 0x1d)).toBeLessThan(40);
    expect(Math.abs((data[2] ?? 0) - 0x89)).toBeLessThan(40);
  });

  it("met foto: de foto, bijgesneden op 1200×630 (ook een staande foto)", async () => {
    foto = await sharp({ create: { width: 800, height: 1200, channels: 3, background: "#C03020" } }).webp().toBuffer();
    const jpg = await deelbeeldJpg(r);
    const m = await sharp(jpg).metadata();
    expect([m.format, m.width, m.height]).toEqual(["jpeg", 1200, 630]);
    const { data } = await sharp(jpg).extract({ left: 600, top: 300, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(Math.abs((data[0] ?? 0) - 0xc0)).toBeLessThan(30);
  });

  it("het adres verandert met de kleuren (updatedAt) en met een nieuwe foto", async () => {
    expect(deelbeeldPad(r, null)).toBe(`/rijschool/jansen/deelbeeld.jpg?v=${r.updatedAt.getTime()}`);
    expect(deelbeeldPad(r, "2026-11-04T12:00:00.000Z")).toBe(`/rijschool/jansen/deelbeeld.jpg?v=${r.updatedAt.getTime()}-${Date.parse("2026-11-04T12:00:00.000Z")}`);
    expect(deelbeeldPad(r, "geen datum")).toBe(`/rijschool/jansen/deelbeeld.jpg?v=${r.updatedAt.getTime()}`);
    fotoTijd = "2026-11-04T12:00:00.000Z";
    expect(await deelbeeldUrl(r)).toBe(deelbeeldPad(r, fotoTijd));
  });
});
