import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Twilio (sms/voice/menu/gather/vervolg/status), de WhatsApp-brug en Didit lezen hun body begrensd: te groot = 422 (nooit 403), een
// geldige, ondertekende body werkt nog en de handtekening klopt op de ontvangen tekst.

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test", TWILIO_AUTH_TOKEN: "twilio-geheim", WHATSAPP_BRUG_TOKEN: "brug-geheim", DIDIT_WEBHOOK_SECRET: "didit-geheim" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), forRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
const antwoordOpSpoed = vi.fn(async (..._a: unknown[]) => "Top, genoteerd.");
vi.mock("@/lib/spoed/oproep", () => ({ antwoordOpSpoed: (...a: unknown[]) => antwoordOpSpoed(...a) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
const verifyWebhook = vi.fn();
vi.mock("@/lib/integrations/didit", () => ({ verifyWebhook: (...a: unknown[]) => verifyWebhook(...a) }));
const diditCreate = vi.fn().mockResolvedValue({});
vi.mock("@/lib/prisma", () => ({ prisma: { diditWebhookEvent: { create: (...a: unknown[]) => diditCreate(...a) } } }));
vi.mock("@/lib/kyc/verification", () => ({ applyWebhookPayload: vi.fn() }));
vi.mock("@/lib/redis", () => ({ claimIdempotency: vi.fn().mockResolvedValue(true) }));

import { POST as sms } from "@/app/api/telephony/sms/route";
import { POST as voice } from "@/app/api/telephony/voice/route";
import { POST as menu } from "@/app/api/telephony/menu/route";
import { POST as gather } from "@/app/api/telephony/gather/route";
import { POST as vervolg } from "@/app/api/telephony/gather/vervolg/route";
import { POST as status } from "@/app/api/telephony/status/route";
import { POST as whatsapp } from "@/app/api/whatsapp/inkomend/route";
import { POST as didit } from "@/app/api/webhooks/didit/route";
import { webhookTekst, WEBHOOK_MAX } from "@/lib/http/webhook-lezen";

const KB = 1024;
const chunked = (bytes: number) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const stuk = new Uint8Array(32 * KB).fill(97);
      for (let i = 0; i < bytes; i += stuk.length) c.enqueue(stuk);
      c.close();
    },
  });
const post = (url: string, init: RequestInit & { duplex?: "half" } = {}) => new Request(url, { method: "POST", ...init } as RequestInit);

/** Een echte Twilio-handtekening: HMAC-SHA1 over de publieke URL + de gesorteerde parameters. */
function ondertekend(pad: string, params: Record<string, string>): Request {
  const url = `https://zf.test${pad}`;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const handtekening = createHmac("sha1", "twilio-geheim").update(Buffer.from(data, "utf-8")).digest("base64");
  return post(`http://app:3000${pad}`, { headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": handtekening }, body: new URLSearchParams(params).toString() });
}

beforeEach(() => {
  antwoordOpSpoed.mockClear();
  verifyWebhook.mockReset();
  diditCreate.mockClear();
});

describe("webhookTekst", () => {
  it("leest een gewone body als tekst en weigert een te grote, op Content-Length én chunked", async () => {
    expect(await webhookTekst(post("http://x/", { body: "héllo" }), 1024)).toEqual({ ok: true, tekst: "héllo" });
    const a = await webhookTekst(post("http://x/", { headers: { "content-length": "5000" }, body: "x" }), 1024);
    expect(a.ok).toBe(false);
    const b = await webhookTekst(post("http://x/", { body: chunked(200 * KB), duplex: "half" }), 64 * KB);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.response.status).toBe(422);
  });

  it("de grenzen zijn royaal en nooit 403", () => {
    expect(WEBHOOK_MAX.stripe).toBeGreaterThanOrEqual(1024 * KB);
    expect(WEBHOOK_MAX.didit).toBeGreaterThanOrEqual(1024 * KB);
    expect(WEBHOOK_MAX.twilio).toBeGreaterThanOrEqual(64 * KB);
  });
});

describe("Twilio: te groot is 422, een ondertekende body werkt nog", () => {
  it("een te grote body geeft 422 op elke telefonieroute, ook zonder Content-Length", async () => {
    for (const [naam, route] of Object.entries({ sms, voice, menu, gather, "gather/vervolg": vervolg, status })) {
      const res = await route(post(`http://app:3000/api/telephony/${naam}`, { body: chunked(WEBHOOK_MAX.twilio + 64 * KB), duplex: "half" }));
      expect(res.status, naam).toBe(422);
      const res2 = await route(post(`http://app:3000/api/telephony/${naam}`, { headers: { "content-length": String(WEBHOOK_MAX.twilio + 1) }, body: "x=1" }));
      expect(res2.status, `${naam} content-length`).toBe(422);
    }
  });

  it("een ondertekende sms komt aan: de handtekening klopt op de ontvangen tekst en het antwoord gaat terug", async () => {
    const res = await sms(ondertekend("/api/telephony/sms", { From: "+31612345678", Body: "1", MessageSid: "SM1" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Top, genoteerd.");
    expect(antwoordOpSpoed).toHaveBeenCalledWith("+31612345678", "1", "sms");
  });

  it("een onjuiste handtekening blijft geweigerd (zoals eerder), zonder dat er iets wordt uitgevoerd", async () => {
    const req = post("http://app:3000/api/telephony/sms", { headers: { "x-twilio-signature": "fout" }, body: "From=%2B31612345678&Body=1" });
    const res = await sms(req);
    expect(res.status).toBe(403);
    expect(antwoordOpSpoed).not.toHaveBeenCalled();
  });

  it("de vervolgaanvraag na 'een ogenblik' controleert de handtekening net als gather", async () => {
    const res = await vervolg(post("http://app:3000/api/telephony/gather/vervolg?callId=c1", { headers: { "x-twilio-signature": "fout" }, body: "CallSid=CA1" }));
    expect(res.status).toBe(403);
    const zonder = await vervolg(post("http://app:3000/api/telephony/gather/vervolg?callId=c1", { body: "CallSid=CA1" }));
    expect(zonder.status).toBe(403);
  });
});

describe("WhatsApp-brug", () => {
  const bearer = { authorization: "Bearer brug-geheim", "content-type": "application/json" };

  it("een te grote body geeft 422 (met de juiste sleutel); een verkeerde sleutel blijft zoals eerder", async () => {
    const groot = await whatsapp(post("http://app:3000/api/whatsapp/inkomend", { headers: bearer, body: chunked(WEBHOOK_MAX.whatsapp + 32 * KB), duplex: "half" }));
    expect(groot.status).toBe(422);
    const zonder = await whatsapp(post("http://app:3000/api/whatsapp/inkomend", { headers: { "content-type": "application/json" }, body: "{}" }));
    expect(zonder.status).toBe(403);
  });

  it("een geldig bericht werkt nog, en ongeldige JSON blijft 'Controleer de gegevens'", async () => {
    const goed = await whatsapp(post("http://app:3000/api/whatsapp/inkomend", { headers: bearer, body: JSON.stringify({ van: "+31612345678", tekst: "2" }) }));
    expect(goed.status).toBe(200);
    expect((await goed.json()).antwoord).toBe("Top, genoteerd.");
    const stuk = await whatsapp(post("http://app:3000/api/whatsapp/inkomend", { headers: bearer, body: "{niet-json" }));
    expect(stuk.status).toBe(422);
    expect((await stuk.json()).error.message).toBe("Controleer de gegevens");
  });
});

describe("Didit", () => {
  it("een te grote body geeft 422 zonder dat de handtekening wordt gecontroleerd; een gewone body gaat onveranderd door", async () => {
    const groot = await didit(post("http://app:3000/api/webhooks/didit", { body: chunked(WEBHOOK_MAX.didit + 64 * KB), duplex: "half" }) as never);
    expect(groot.status).toBe(422);
    expect(verifyWebhook).not.toHaveBeenCalled();

    const body = JSON.stringify({ session_id: "s1", status: "Approved", naam: "Zoë" });
    verifyWebhook.mockReturnValue({ valid: false, method: null, body: { session_id: "s1" } });
    await didit(post("http://app:3000/api/webhooks/didit", { headers: { "x-signature": "abc" }, body }) as never);
    expect(verifyWebhook.mock.calls[0]![0]).toBe(body);
  });

  it("een foute handtekening geeft 401 en schrijft NIETS in de database; een geldige wordt wel bewaard", async () => {
    const body = JSON.stringify({ session_id: "s1", status: "Approved", created_at: 1 });
    verifyWebhook.mockReturnValue({ valid: false, method: null, body: JSON.parse(body) });
    const fout = await didit(post("http://app:3000/api/webhooks/didit", { headers: { "x-signature": "nep" }, body }) as never);
    expect(fout.status).toBe(401);
    expect(diditCreate).not.toHaveBeenCalled();

    verifyWebhook.mockReturnValue({ valid: true, method: "v2", body: JSON.parse(body) });
    const goed = await didit(post("http://app:3000/api/webhooks/didit", { headers: { "x-signature-v2": "ok" }, body }) as never);
    expect(goed.status).toBe(200);
    expect(diditCreate).toHaveBeenCalledTimes(1);
    expect(diditCreate.mock.calls[0]![0]).toMatchObject({ data: { sessionId: "s1", signatureValid: true, signatureMethod: "v2" } });
  });
});

describe("de routes", () => {
  const ROOT = process.cwd();
  const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
  it("geen webhook- of kanaalroute leest nog onbegrensd uit de request", () => {
    for (const f of ["webhooks/stripe", "webhooks/didit", "telephony/sms", "telephony/voice", "telephony/menu", "telephony/gather", "telephony/gather/vervolg", "telephony/status", "whatsapp/inkomend"]) {
      const s = bron(`app/api/${f}/route.ts`);
      expect(s, f).toContain("webhookTekst(request, WEBHOOK_MAX.");
      expect(s, f).not.toMatch(/request\.(text|json|formData|arrayBuffer)\(/);
      // nooit 403 voor een te grote body
      expect(s, f).not.toMatch(/te groot[^\n]*403|403[^\n]*te groot/i);
    }
  });
});
