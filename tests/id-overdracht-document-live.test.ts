import { afterEach, describe, expect, it, vi } from "vitest";

// POST /api/id-overdracht/document-live (12 nov 2026): de camera op de telefoon (via de QR-code, niet ingelogd) meet het
// kader live, zodat de foto ook daar vanzelf gemaakt wordt. Alleen met een geldige eenmalige code van dit toestel, in
// het formulier; IP-begrensd; terug alleen ja/nee en een getal; het beeld en de code komen in geen log.

const enforceRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimit(...a) }));
const overdrachtGeldig = vi.fn();
vi.mock("@/lib/kyc/overdracht", () => ({ overdrachtGeldig: (...a: unknown[]) => overdrachtGeldig(...a) }));
const meetDocumentLive = vi.fn();
vi.mock("@/lib/kyc/document-live", () => ({ meetDocumentLive: (...a: unknown[]) => meetDocumentLive(...a) }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "203.0.113.7" }));
const logError = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn() } }));

import { POST } from "@/app/api/id-overdracht/document-live/route";

const BEELD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const CODE = "geheime-code-van-de-qr";
const verzoek = (velden: Record<string, string | Blob | null> = {}) => {
  const form = new FormData();
  const alles: Record<string, string | Blob | null> = { code: CODE, toestel: "toestel-1", mrz: "1", beeld: new Blob([BEELD], { type: "image/jpeg" }), ...velden };
  for (const [k, v] of Object.entries(alles)) if (v !== null) form.set(k, v);
  return new Request("http://localhost/api/id-overdracht/document-live", { method: "POST", body: form });
};

afterEach(() => vi.resetAllMocks());

describe("POST /api/id-overdracht/document-live", () => {
  it("zonder geldige code van dit toestel: 404 (geen 403), er wordt niets gemeten", async () => {
    overdrachtGeldig.mockResolvedValue(null);
    const res = await POST(verzoek());
    expect(res.status).toBe(404);
    expect(overdrachtGeldig).toHaveBeenCalledWith(CODE, "toestel-1");
    expect(meetDocumentLive).not.toHaveBeenCalled();
    expect((await POST(verzoek({ code: null }))).status).toBe(404);
  });

  it("met een geldige code: alleen ja/nee en een getal terug, IP-begrensd en zonder cache", async () => {
    overdrachtGeldig.mockResolvedValue({ userId: "u1" });
    meetDocumentLive.mockResolvedValue({ leesbaar: true, portret: 0.14 });
    const res = await POST(verzoek({ portret: "1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ meting: { leesbaar: true, portret: 0.14 } });
    expect(meetDocumentLive.mock.calls[0]![1]).toEqual({ mrz: true, portret: true });
    expect(Array.from(meetDocumentLive.mock.calls[0]![0] as Uint8Array)).toEqual(Array.from(BEELD));
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "id-overdracht-document-live", identifier: "203.0.113.7" }));
  });

  it("niets te meten, geen beeld, een vreemd type of te groot: 422, zonder meten", async () => {
    overdrachtGeldig.mockResolvedValue({ userId: "u1" });
    expect((await POST(verzoek({ mrz: null }))).status).toBe(422);
    expect((await POST(verzoek({ beeld: null }))).status).toBe(422);
    expect((await POST(verzoek({ beeld: new Blob([BEELD], { type: "image/gif" }) }))).status).toBe(422);
    expect((await POST(verzoek({ beeld: new Blob([new Uint8Array(1_600_000)], { type: "image/jpeg" }) }))).status).toBe(422);
    expect(meetDocumentLive).not.toHaveBeenCalled();
  });

  it("een storing logt alleen de soort fout: nooit het beeld of de code", async () => {
    overdrachtGeldig.mockResolvedValue({ userId: "u1" });
    meetDocumentLive.mockRejectedValue(new TypeError("kapot"));
    const res = await POST(verzoek());
    expect(res.status).toBe(500);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logError.mock.calls)).not.toContain(CODE);
    expect(JSON.stringify(logError.mock.calls)).toContain("TypeError");
  });
});
