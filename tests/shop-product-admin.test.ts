import { afterEach, describe, expect, it, vi } from "vitest";

const requirePrincipal = vi.fn();
const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requirePrincipal: (...a: unknown[]) => requirePrincipal(...a),
  requireRole: (...a: unknown[]) => requireRole(...a),
  getPrincipal: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

const productCreate = vi.fn();
const productUpdate = vi.fn();
const variantCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shopProduct: { create: (...a: unknown[]) => productCreate(...a), update: (...a: unknown[]) => productUpdate(...a), findMany: vi.fn() },
    shopProductVariant: { create: (...a: unknown[]) => variantCreate(...a) },
  },
}));

import { POST } from "@/app/api/shop/products/route";
import { PATCH } from "@/app/api/shop/products/[id]/route";

const PRINCIPAL = { userId: "admin1", email: "admin@zekerflex.com" };

const BODY = {
  name: "Testproduct",
  slug: "testproduct",
  description: "Een beschrijving van minstens tien tekens.",
  category: "Werk & PBM",
  priceCents: 1999,
  stock: 25,
};

function req(body: unknown) {
  return new Request("http://localhost/api/shop/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

describe("POST /api/shop/products", () => {
  it("creates the product and a default variant that inherits its stock, so checkout always has a real variant to resolve", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    productCreate.mockResolvedValue({ id: "prod_1", name: "Testproduct", slug: "testproduct", stock: 25 });
    variantCreate.mockResolvedValue({ id: "var_1", productId: "prod_1", size: null, color: null, priceCents: null, stock: 25, sku: "testproduct-one" });

    const res = await POST(req(BODY), { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(variantCreate).toHaveBeenCalledWith({
      data: { productId: "prod_1", size: null, color: null, priceCents: null, stock: 25, sku: "testproduct-one" },
    });
    expect(json.product.variants).toEqual([{ id: "var_1", productId: "prod_1", size: null, color: null, priceCents: null, stock: 25, sku: "testproduct-one" }]);
  });

  it("accepts Werk & PBM as a category (previously missing from the enum)", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    productCreate.mockResolvedValue({ id: "prod_2", name: "Testproduct", slug: "testproduct", stock: 25 });
    variantCreate.mockResolvedValue({ id: "var_2" });

    const res = await POST(req({ ...BODY, category: "Werk & PBM" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    expect(productCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ category: "Werk & PBM" }) }));
  });

  it("normalizes gender/collection to null when not provided", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    productCreate.mockResolvedValue({ id: "prod_3", name: "Testproduct", slug: "testproduct", stock: 25 });
    variantCreate.mockResolvedValue({ id: "var_3" });

    await POST(req(BODY), { params: Promise.resolve({}) });
    expect(productCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gender: null, collection: null, isBundle: false }) }),
    );
  });

  it("accepts a site-relative image path (not just an absolute URL) — every shipped product photo is one of these", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    productCreate.mockResolvedValue({ id: "prod_4", name: "Testproduct", slug: "testproduct", stock: 25 });
    variantCreate.mockResolvedValue({ id: "var_4" });

    const res = await POST(req({ ...BODY, imageUrl: "/shop/ringer-tee-1.jpg" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    expect(productCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ imageUrl: "/shop/ringer-tee-1.jpg" }) }));
  });
});

describe("PATCH /api/shop/products/:id", () => {
  function patchReq(body: unknown) {
    return new Request("http://localhost/api/shop/products/prod_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // Regression: editing any existing product and saving without touching the
  // photo used to 422 with "Invalid url", because imageUrl required an
  // absolute URL while every shipped product photo is a site-relative path
  // like /shop/ringer-tee-1.jpg or /shifts/logistiek.jpg — this is exactly
  // what the admin edit form resends unchanged on every save.
  it("saves an edit that resends the existing relative imageUrl unchanged", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    productUpdate.mockResolvedValue({ id: "prod_1", name: "Veiligheidsschoenen S3" });

    const res = await PATCH(
      patchReq({
        name: "Veiligheidsschoenen S3",
        slug: "veiligheidsschoenen-s3",
        description: "Stalen neus, doortreedbescherming en antislipzool.",
        category: "Werk & PBM",
        priceCents: 4995,
        stock: 40,
        imageUrl: "/shifts/logistiek.jpg",
        modelPhotoUrl: null,
        active: true,
        sortOrder: 10,
        gender: null,
        collection: null,
        isBundle: false,
      }),
      { params: Promise.resolve({ id: "prod_1" }) },
    );
    expect(res.status).toBe(200);
    expect(productUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ imageUrl: "/shifts/logistiek.jpg" }) }));
  });

  it("still accepts an absolute upload URL", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    productUpdate.mockResolvedValue({ id: "prod_1", name: "Veiligheidsschoenen S3" });

    const res = await PATCH(patchReq({ imageUrl: "https://cdn.zekerflex.com/foo.jpg" }), { params: Promise.resolve({ id: "prod_1" }) });
    expect(res.status).toBe(200);
  });

  it("still rejects a nonsense value that is neither a path nor a URL", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);

    const res = await PATCH(patchReq({ imageUrl: "not a path or url" }), { params: Promise.resolve({ id: "prod_1" }) });
    expect(res.status).toBe(422);
    expect(productUpdate).not.toHaveBeenCalled();
  });
});
