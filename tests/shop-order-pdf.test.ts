import { afterEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { shopOrder: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

import { shopOrderReceiptPdf } from "@/lib/pdf/documents";

afterEach(() => vi.clearAllMocks());

const ORDER = {
  id: "order_1",
  status: "RECEIVED",
  firstName: "Jan",
  lastName: "de Vries",
  address: "Hoofdstraat 1",
  postalCode: "1000AA",
  city: "Amsterdam",
  itemsJson: [{ name: "Werkschoenen S3", priceCents: 1999, qty: 2 }],
  subtotalCents: 3998,
  shippingCents: 495,
  totalCents: 4493,
  createdAt: new Date("2026-10-01T10:00:00Z"),
};

describe("shopOrderReceiptPdf", () => {
  it("returns a valid PDF buffer for an existing order", async () => {
    findUnique.mockResolvedValue(ORDER);
    const doc = await shopOrderReceiptPdf("order_1");
    expect(doc).not.toBeNull();
    expect(doc!.filename).toBe("bestelling-order_1.pdf");
    expect(doc!.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("returns null for a non-existent order", async () => {
    findUnique.mockResolvedValue(null);
    expect(await shopOrderReceiptPdf("nope")).toBeNull();
  });
});
