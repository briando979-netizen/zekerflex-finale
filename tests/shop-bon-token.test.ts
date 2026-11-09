import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-geheim-test-geheim-test-geheim" } }));

const getPrincipal = vi.fn();
vi.mock("@/lib/auth", () => ({ getPrincipal: (...a: unknown[]) => getPrincipal(...a) }));
const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { shopOrder: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "203.0.113.9" }));
vi.mock("@/lib/http/errors", () => ({ jsonError: () => new Response("limiet", { status: 429 }) }));
const pdf = vi.fn();
vi.mock("@/lib/pdf/documents", () => ({ shopOrderReceiptPdf: (...a: unknown[]) => pdf(...a) }));

import { bonToken, controleerBonToken } from "@/lib/shop/bon-token";
import { GET } from "@/app/api/shop/orders/[id]/pdf/route";

const NU = Date.parse("2026-11-09T10:00:00+01:00");
const DAG = 24 * 3600 * 1000;

afterEach(() => vi.clearAllMocks());

describe("bonToken", () => {
  it("is geldig voor het juiste bestelnummer", () => {
    expect(controleerBonToken("order_1", bonToken("order_1", NU), NU + DAG)).toBe("geldig");
  });

  it("is ongeldig voor een ander bestelnummer, een geknoeid of leeg token", () => {
    const t = bonToken("order_1", NU);
    expect(controleerBonToken("order_2", t, NU)).toBe("ongeldig");
    expect(controleerBonToken("order_1", t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"), NU)).toBe("ongeldig");
    // verloop opschuiven met behoud van de handtekening mag niet
    const [, sig] = t.split(".");
    expect(controleerBonToken("order_1", `9999999999.${sig}`, NU)).toBe("ongeldig");
    expect(controleerBonToken("order_1", "", NU)).toBe("ongeldig");
    expect(controleerBonToken("order_1", null, NU)).toBe("ongeldig");
    expect(controleerBonToken("order_1", "rommel", NU)).toBe("ongeldig");
  });

  it("verloopt na de geldigheidsduur", () => {
    const t = bonToken("order_1", NU, 3600);
    expect(controleerBonToken("order_1", t, NU + 1800_000)).toBe("geldig");
    expect(controleerBonToken("order_1", t, NU + 2 * 3600_000)).toBe("verlopen");
  });
});

function verzoek(id: string, t?: string) {
  const url = `http://localhost/api/shop/orders/${id}/pdf${t === undefined ? "" : `?t=${encodeURIComponent(t)}`}`;
  return GET(new Request(url), { params: Promise.resolve({ id }) });
}

describe("GET /api/shop/orders/:id/pdf", () => {
  it("geeft de bon met een geldig token", async () => {
    pdf.mockResolvedValue({ bytes: Buffer.from("%PDF-1.4"), filename: "bestelling-order_1.pdf" });
    const res = await verzoek("order_1", bonToken("order_1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("geeft 404 (nooit 403) zonder token of met een ongeldig token, en maakt de pdf niet", async () => {
    getPrincipal.mockResolvedValue(null);
    expect((await verzoek("order_1")).status).toBe(404);
    expect((await verzoek("order_1", bonToken("order_2"))).status).toBe(404);
    expect(pdf).not.toHaveBeenCalled();
  });

  it("geeft 410 met een verlopen token", async () => {
    const oud = bonToken("order_1", Date.now() - 500 * DAG);
    const res = await verzoek("order_1", oud);
    expect(res.status).toBe(410);
    expect((await res.json()).error.code).toBe("BON_VERLOPEN");
  });

  it("laat de ingelogde klant met hetzelfde e-mailadres zonder token toe, anderen niet", async () => {
    pdf.mockResolvedValue({ bytes: Buffer.from("%PDF-1.4"), filename: "b.pdf" });
    findUnique.mockResolvedValue({ email: "Klant@example.test" });
    getPrincipal.mockResolvedValue({ email: "klant@example.test" });
    expect((await verzoek("order_1")).status).toBe(200);
    getPrincipal.mockResolvedValue({ email: "ander@example.test" });
    expect((await verzoek("order_1")).status).toBe(404);
  });
});
