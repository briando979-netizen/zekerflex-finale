import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Beheer → Webshop: één productscherm met meerdere foto's en maten/kleuren in één keer (15 nov 2026, eigenaar: "het is
// moeilijk een product te plaatsen; ik moet ook meerdere foto's kunnen uploaden").

const tx = vi.hoisted(() => ({
  bestaand: [] as { id: string; size: string | null; color: string | null; stock: number }[],
  updates: [] as unknown[],
  creates: [] as unknown[],
  deletes: [] as string[],
  productStock: -1,
}));
vi.mock("@/lib/prisma", () => {
  const client = {
    shopProduct: { findUnique: async () => ({ id: "p1", name: "Werkbroek", slug: "werkbroek" }) },
    $transaction: async (fn: (t: unknown) => Promise<unknown>) =>
      fn({
        shopProductVariant: {
          findMany: async () => tx.bestaand,
          update: async (a: unknown) => void tx.updates.push(a),
          create: async (a: unknown) => void tx.creates.push(a),
          deleteMany: async (a: { where: { id: { in: string[] } } }) => void tx.deletes.push(...a.where.id.in),
        },
        shopProduct: { update: async (a: { data: { stock: number } }) => void (tx.productStock = a.data.stock) },
      }),
  };
  return { prisma: client };
});
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth/handlers", () => ({
  withAdminAccess: (_rollen: string[], fn: (req: Request, ctx: unknown) => Promise<Response>) => (req: Request, ctx: { params: Promise<Record<string, string>> }) =>
    ctx.params.then((params) => fn(req, { params, principal: { userId: "beheer" } })),
}));

import {
  MAX_EXTRA_FOTOS,
  MAX_FOTOS,
  fotosNaarProduct,
  fotosVanProduct,
  matenEnKleuren,
  schermFouten,
  uniekeLijst,
  uploadIdUit,
  variantRijen,
  variantSleutel,
  verplaats,
  voorraadUit,
} from "@/lib/shop/product-scherm";
import { PUT } from "@/app/api/shop/products/[id]/variants/route";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("maten en kleuren", () => {
  it("alle combinaties van maat en kleur; zonder iets één rij", () => {
    expect(variantRijen([], [], [], 5)).toEqual([{ size: null, color: null, stock: 5 }]);
    expect(variantRijen(["S", "M"], [], [], 0).map((r) => r.size)).toEqual(["S", "M"]);
    expect(variantRijen([], ["Zwart"], [], 0)).toEqual([{ size: null, color: "Zwart", stock: 0 }]);
    const r = variantRijen(["S", "M"], ["Zwart", "Wit"], [{ size: "M", color: "zwart", stock: 7 }], 2);
    expect(r).toHaveLength(4);
    expect(r.find((x) => x.size === "M" && x.color === "Zwart")?.stock).toBe(7);
    expect(r.find((x) => x.size === "S" && x.color === "Wit")?.stock).toBe(2);
  });

  it("geen dubbele of lege maten; hoofdletters tellen niet", () => {
    expect(uniekeLijst([" m ", "M", "", "l", "  "], 20)).toEqual(["m", "l"]);
    expect(variantSleutel(" M ", "Zwart")).toBe(variantSleutel("m", "zwart"));
  });

  it("een bestaand product vult het scherm met zijn maten en kleuren", () => {
    expect(matenEnKleuren([{ size: "S", color: "Zwart" }, { size: "M", color: "Zwart" }, { size: "S", color: "Wit" }])).toEqual({ maten: ["S", "M"], kleuren: ["Zwart", "Wit"] });
    expect(matenEnKleuren([{ size: null, color: null }])).toEqual({ maten: [], kleuren: [] });
  });

  it("voorraad uit een veld: een heel getal, anders 0", () => {
    expect(voorraadUit("12")).toBe(12);
    expect(voorraadUit("")).toBe(0);
    expect(voorraadUit("1,5")).toBe(0);
  });
});

describe("meerdere foto's", () => {
  it("de eerste is de hoofdfoto, de rest extra; dubbel telt één keer; hooguit tien", () => {
    const fotos = ["/api/shop/media/up1", "/api/shop/media/up2", "/api/shop/media/up1", "/shop/vast.jpg"];
    expect(fotosNaarProduct(fotos)).toEqual({ imageUrl: "/api/shop/media/up1", imageUploadId: "up1", fotos: ["/api/shop/media/up2", "/shop/vast.jpg"] });
    expect(fotosNaarProduct([])).toEqual({ imageUrl: null, imageUploadId: null, fotos: [] });
    const veel = Array.from({ length: 14 }, (_, i) => `/api/shop/media/u${i}`);
    expect(fotosNaarProduct(veel).fotos).toHaveLength(MAX_EXTRA_FOTOS);
    expect(MAX_FOTOS).toBe(10);
  });

  it("een vaste foto of een link is geen upload", () => {
    expect(uploadIdUit("/api/shop/media/abc_123")).toBe("abc_123");
    expect(uploadIdUit("/shop/werkbroek.jpg")).toBeNull();
    expect(uploadIdUit("https://voorbeeld.nl/x.jpg")).toBeNull();
    expect(uploadIdUit(null)).toBeNull();
  });

  it("een bestaand product: hoofdfoto eerst, dan de extra foto's; volgorde wisselen", () => {
    expect(fotosVanProduct({ imageUrl: "/a.jpg", fotos: ["/b.jpg", "/a.jpg"] })).toEqual(["/a.jpg", "/b.jpg"]);
    expect(fotosVanProduct({ imageUrl: null })).toEqual([]);
    expect(verplaats(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(verplaats(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(verplaats(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("wat er nog ontbreekt", () => {
  const goed = { naam: "Werkbroek", omschrijving: "Stevige werkbroek met kniezakken.", prijsTekst: "39,95", categorie: "Kleding" as const, fotos: ["/a.jpg"], varianten: [{ size: "M", color: null, stock: 3 }], zichtbaar: true };
  it("compleet: niets", () => {
    expect(schermFouten(goed)).toEqual([]);
  });
  it("in de shop zonder foto of voorraad: zeg het; als concept mag het wel", () => {
    expect(schermFouten({ ...goed, fotos: [] }).join(" ")).toMatch(/minstens één foto/);
    expect(schermFouten({ ...goed, varianten: [{ size: "M", color: null, stock: 0 }] }).join(" ")).toMatch(/voorraad nodig/);
    expect(schermFouten({ ...goed, fotos: [], varianten: [{ size: null, color: null, stock: 0 }], zichtbaar: false })).toEqual([]);
  });
  it("naam, omschrijving en prijs in gewone taal", () => {
    const f = schermFouten({ ...goed, naam: "x", omschrijving: "kort", prijsTekst: "gratis" });
    expect(f).toHaveLength(3);
    expect(f.join(" ")).toMatch(/naam/);
    expect(f.join(" ")).toMatch(/omschrijving/);
    expect(f.join(" ")).toMatch(/verkoopprijs/);
  });
});

describe("PUT /api/shop/products/:id/variants (alles in één keer)", () => {
  it("bestaande houden hun id (bestellingen verwijzen ernaar), nieuwe komen erbij, oude gaan weg; voorraad = som", async () => {
    tx.bestaand = [
      { id: "v-default", size: null, color: null, stock: 4 },
      { id: "v-m-zwart", size: "M", color: "Zwart", stock: 1 },
    ];
    tx.updates = [];
    tx.creates = [];
    tx.deletes = [];
    const res = await PUT(
      new Request("http://localhost/api/shop/products/p1/variants", {
        method: "PUT",
        body: JSON.stringify({ varianten: [{ size: "M", color: "zwart", stock: 5 }, { size: "L", color: "Zwart", stock: 2 }] }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(200);
    // M/zwart bestond al (hoofdletters tellen niet): bijgewerkt, niet opnieuw aangemaakt
    expect(tx.updates).toEqual([{ where: { id: "v-m-zwart" }, data: { stock: 5, size: "M", color: "zwart" } }]);
    expect(tx.creates).toHaveLength(1);
    expect(JSON.stringify(tx.creates[0])).toContain('"size":"L"');
    expect(tx.deletes).toEqual(["v-default"]);
    expect(tx.productStock).toBe(7);
  });

  it("een lege lijst mag niet: een product houdt minstens één variant", async () => {
    await expect(
      PUT(new Request("http://localhost/api/shop/products/p1/variants", { method: "PUT", body: JSON.stringify({ varianten: [] }) }), { params: Promise.resolve({ id: "p1" }) }),
    ).rejects.toThrow();
  });
});

describe("waar het staat", () => {
  it("de kolom fotos, met een migratie die alleen een kolom toevoegt", () => {
    expect(lees("prisma/schema.prisma")).toContain("  fotos         String[] @default([])");
    const sql = lees("prisma/migrations/20261115160000_shop_product_fotos/migration.sql");
    expect(sql).toContain('ALTER TABLE "ShopProduct" ADD COLUMN "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[];');
    expect(sql).not.toMatch(/DROP|UPDATE|DELETE/i);
  });

  it("een extra foto is via de shop te zien, verder blijft elke upload dicht", () => {
    expect(lees("app/api/shop/media/[id]/route.ts")).toContain("{ fotos: { has: `/api/shop/media/${params.id}` } }");
  });

  // de productpagina van de webshop is op 22 nov 2026 weggehaald
  it("het beheer opent het nieuwe scherm", () => {
    const admin = lees("components/admin/ShopAdmin.tsx");
    expect(admin).toContain("<ShopProductScherm");
    expect(admin).toContain("setScherm({ product: null })");
    const scherm = lees("components/admin/ShopProductScherm.tsx");
    expect(scherm).toContain("multiple");
    expect(scherm).toContain('method: "PUT"');
    expect(scherm).toContain("onDrop={opDrop}");
  });
});
