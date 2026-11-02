import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Een website maken, bewerken en publiceren: het adres wordt in één keer
// geclaimd, de live site verandert pas bij publiceren, en terugzetten of
// offline halen is één stap.

// foto's van deze test in een eigen tijdelijke map, vóór de store laadt
await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  process.env.SITE_BUILDER_DIR = mkdtempSync(join(tmpdir(), "zf-sites-"));
});

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
  kvListValues: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    keyValueStore: {
      create: async ({ data }: { data: { key: string; value: unknown } }) => {
        if (store.has(data.key)) throw new Prisma.PrismaClientKnownRequestError("dubbel", { code: "P2002", clientVersion: "5" });
        store.set(data.key, data.value);
        return data;
      },
    },
  },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { addMedia, createSite, liveSiteBySlug, publishSite, readMedia, saveSite, setLiveBuild, siteOfTenant } from "@/lib/sites/store";
import type { SiteDoc } from "@/lib/sites/types";

const by = { userId: "u1", name: "Jan" };
const bedrijf = { naam: "Bakkerij De Vries", kvk: "12345678", straat: "", postcode: "", plaats: "Rijssen", telefoon: "", email: "info@devries.nl" };
const save = (s: SiteDoc, patch: Partial<Pick<SiteDoc, "pages" | "theme" | "bedrijf">> = {}) =>
  saveSite(s.id, { theme: patch.theme ?? s.theme, bedrijf: patch.bedrijf ?? s.bedrijf, pages: (patch.pages ?? s.pages) as never });

beforeEach(() => store.clear());

describe("website maken", () => {
  it("claimt een vrij adres uit de bedrijfsnaam; een tweede met dezelfde naam krijgt -2", async () => {
    const a = await createSite("t1", by, { templateId: "horeca", bedrijf });
    const b = await createSite("t2", by, { templateId: "bouw", bedrijf });
    expect(a.slug).toBe("bakkerij-de-vries");
    expect(b.slug).toBe("bakkerij-de-vries-2");
    expect((await siteOfTenant("t1"))?.id).toBe(a.id);
    await expect(createSite("t1", by, { templateId: "horeca", bedrijf })).rejects.toMatchObject({ status: 409 });
  });

  it("accepteert alleen foto's die bij deze website horen", async () => {
    const s = await createSite("t1", by, { templateId: "algemeen", bedrijf });
    const pages = structuredClone(s.pages);
    const hero = pages[0]!.blocks[0]!;
    if (hero.type === "hero") hero.props.foto = "mvanander1";
    await expect(save(s, { pages })).rejects.toThrow(/hoort niet bij deze website/);
  });

  it("bewaart een foto op schijf en geeft hem terug", async () => {
    const s = await createSite("t1", by, { templateId: "algemeen", bedrijf });
    const m = await addMedia(s.id, { bytes: Buffer.from("webp-bytes"), width: 10, height: 10, mime: "image/webp" }, { alt: "Winkel", bron: "upload" });
    expect(m.file).toMatch(/^m[0-9a-f]{12}\.webp$/);
    expect((await readMedia(s.id, m.file)).toString()).toBe("webp-bytes");
    await expect(readMedia(s.id, "../../etc/passwd")).rejects.toMatchObject({ status: 404 });
  });
});

describe("publiceren", () => {
  it("laat bezoekers pas wijzigingen zien na publiceren, en zet terug of offline in één stap", async () => {
    let s = await createSite("t1", by, { templateId: "horeca", bedrijf });
    expect(await liveSiteBySlug(s.slug)).toBeNull();

    s = await publishSite(s.id, by);
    const v1 = s.liveBuild!;
    expect((await liveSiteBySlug(s.slug))?.snapshot.bedrijf.naam).toBe("Bakkerij De Vries");

    await save(s, { bedrijf: { ...bedrijf, naam: "Bakkerij De Vries & Zn" } });
    expect((await liveSiteBySlug(s.slug))?.snapshot.bedrijf.naam).toBe("Bakkerij De Vries"); // nog niet gepubliceerd

    s = await publishSite(s.id, by);
    expect((await liveSiteBySlug(s.slug))?.snapshot.bedrijf.naam).toBe("Bakkerij De Vries & Zn");

    s = await setLiveBuild(s.id, v1, by);
    expect((await liveSiteBySlug(s.slug))?.snapshot.bedrijf.naam).toBe("Bakkerij De Vries");

    s = await setLiveBuild(s.id, null, by);
    expect(await liveSiteBySlug(s.slug)).toBeNull();
    await expect(setLiveBuild(s.id, "bestaatniet", by)).rejects.toMatchObject({ status: 404 });
  });

  it("bewaart de laatste tien versies", async () => {
    let s = await createSite("t1", by, { templateId: "horeca", bedrijf });
    for (let i = 0; i < 12; i++) s = await publishSite(s.id, by);
    expect(s.builds).toHaveLength(10);
    expect([...store.keys()].filter((k) => k.startsWith(`site-build:${s.id}:`))).toHaveLength(10);
  });
});
