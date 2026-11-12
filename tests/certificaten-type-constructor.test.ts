import { describe, expect, it, vi } from "vitest";

// "constructor" (of "toString", "__proto__") is geen certificaattype: het mag niet door de controle komen omdat het op het prototype van het
// opzoekobject staat (`in` telt dat mee, Object.hasOwn niet). Verwacht 422, nooit een 500.

vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => ({ userId: "u1", role: "FREELANCER" }),
  requireRole: () => undefined,
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined }));
vi.mock("@/lib/certificates/store", () => ({
  CERT_TYPES: { vca: { label: "VCA" } },
  addCertificate: vi.fn(async () => ({ id: "c1" })),
  listCertificates: vi.fn(async () => []),
}));

import { POST } from "@/app/api/me/certificates/route";

function verzoek(type: string): Request {
  const form = new FormData();
  form.set("type", type);
  return new Request("http://localhost/api/me/certificates", { method: "POST", body: form });
}

describe("POST /api/me/certificates: type uit de body", () => {
  for (const type of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    it(`"${type}" geeft 422`, async () => {
      const res = await POST(verzoek(type));
      expect(res.status).toBe(422);
    });
  }

  it("een onbekend type geeft 422", async () => {
    expect((await POST(verzoek("bestaat-niet"))).status).toBe(422);
  });

  it("een bestaand type wordt gewoon opgeslagen (201)", async () => {
    expect((await POST(verzoek("vca"))).status).toBe(201);
  });
});
