import { createECDH, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { volgendeStap } from "@/lib/notifications/push/aanmelding";

// Eigenaar 12 nov: "web push VAPID heeft vaak storing, zoals nu ook". Gemeten: de laptop van de
// eigenaar (Edge, pushdienst van Windows) raakte zijn aanmelding drie keer binnen een dag kwijt; de
// server zette hem dan uit en het apparaat meldde zich nooit vanzelf opnieuw aan, dus Admin → Systeem
// bleef op "Storing" staan. Nu: stil opnieuw aanmelden bij elk bezoek, de reden in het foutenlogboek,
// en een knop op het systeemscherm.

const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", () => ({ requirePrincipal: () => requirePrincipal() }));
const db = {
  fp: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: (...a: unknown[]) => db.fp(...a) },
    webPushSubscription: {
      findUnique: (...a: unknown[]) => db.findUnique(...a),
      upsert: (...a: unknown[]) => db.upsert(...a),
      deleteMany: (...a: unknown[]) => db.deleteMany(...a),
      count: vi.fn(async () => 0),
    },
  },
}));

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const SUB = { endpoint: "https://wns2-am3p.notify.windows.com/w/?token=nieuw", keys: { p256dh: "BPk-sleutel", auth: "c2VjcmV0" } };
const post = (body: unknown) =>
  new Request("http://localhost/api/me/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  requirePrincipal.mockResolvedValue({ userId: "usr_1" });
  db.fp.mockResolvedValue(null);
  db.findUnique.mockResolvedValue(null);
  db.upsert.mockResolvedValue({});
  db.deleteMany.mockResolvedValue({ count: 1 });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("wat een apparaat bij een bezoek met zijn aanmelding doet", () => {
  const basis = { toestemming: "granted" as NotificationPermission, heeftAanmelding: true, zelfdeSleutel: true, zelfUitgezet: false };

  it("zonder toestemming niets (nooit zelf om toestemming vragen)", () => {
    expect(volgendeStap({ ...basis, toestemming: "default" })).toBe("niets");
    expect(volgendeStap({ ...basis, toestemming: "denied", heeftAanmelding: false })).toBe("niets");
  });

  it("aanmelding kwijt maar toestemming er nog: stil opnieuw aanmelden, behalve als je het zelf uitzette", () => {
    expect(volgendeStap({ ...basis, heeftAanmelding: false, zelfdeSleutel: false })).toBe("aanmelden");
    expect(volgendeStap({ ...basis, heeftAanmelding: false, zelfdeSleutel: false, zelfUitgezet: true })).toBe("niets");
  });

  it("een aanmelding met een andere sleutel wordt geruild, een goede opnieuw doorgegeven", () => {
    expect(volgendeStap({ ...basis, zelfdeSleutel: false })).toBe("vervangen");
    expect(volgendeStap(basis)).toBe("doorgeven");
  });
});

describe("POST /api/me/push", () => {
  it("zegt of de pushdienst deze aanmelding eerder al had weggegooid (dan vraagt het apparaat een nieuwe)", async () => {
    const { POST } = await import("@/app/api/me/push/route");
    db.findUnique.mockResolvedValue({ disabledAt: new Date("2026-11-10T23:36:00Z") });
    expect(await (await POST(post(SUB))).json()).toEqual({ ok: true, uitgezet: true });
    expect(db.findUnique).toHaveBeenCalledWith({ where: { endpoint: SUB.endpoint }, select: { disabledAt: true } });
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ disabledAt: null }) }));

    db.findUnique.mockResolvedValue({ disabledAt: null });
    expect(await (await POST(post(SUB))).json()).toEqual({ ok: true, uitgezet: false });
    db.findUnique.mockResolvedValue(null);
    expect(await (await POST(post(SUB))).json()).toEqual({ ok: true, uitgezet: false });
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("ruimt de vorige aanmelding van het apparaat op (service worker), alleen die van dit account", async () => {
    const { POST } = await import("@/app/api/me/push/route");
    const vorig = "https://wns2-am3p.notify.windows.com/w/?token=oud";
    expect((await POST(post({ ...SUB, vorig }))).status).toBe(200);
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { endpoint: vorig, userId: "usr_1" } });
    db.deleteMany.mockClear();
    await POST(post({ ...SUB, vorig: SUB.endpoint }));
    expect(db.deleteMany).not.toHaveBeenCalled();
  });
});

describe("een uitgezet apparaat staat met de reden in het foutenlogboek", () => {
  it("404/410: waarschuwing met alleen de host van de pushdienst, nooit het adres van het apparaat", async () => {
    const { logger } = await import("@/lib/logger");
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const { sendWebPush } = await import("@/lib/notifications/push/web-push");
    const client = createECDH("prime256v1");
    client.generateKeys();
    const doel = { endpoint: "https://wns2-am3p.notify.windows.com/w/?token=BQYAAAB%2fGeheim", p256dh: client.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") };

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 410 })) as never);
    expect(await sendWebPush(doel, "{}", { ttlSeconds: 60 })).toEqual({ ok: false, statusCode: 410, gone: true });
    expect(warn).toHaveBeenLastCalledWith("web push apparaat uitgezet", { pushService: "wns2-am3p.notify.windows.com", status: 410, reden: "pushdienst kent de aanmelding niet meer" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("Channel expired", { status: 404 })) as never);
    await sendWebPush(doel, "{}", { ttlSeconds: 60 });
    expect(warn).toHaveBeenLastCalledWith("web push apparaat uitgezet", { pushService: "wns2-am3p.notify.windows.com", status: 404, reden: "Channel expired" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Geheim");
    warn.mockRestore();
  });
});

describe("het apparaat herstelt zich zelf", () => {
  it("de service worker meldt zich bij pushsubscriptionchange zelf opnieuw aan en geeft het door", () => {
    const sw = lees("public/sw.js");
    const blok = sw.slice(sw.indexOf('addEventListener("pushsubscriptionchange"'));
    expect(blok).toMatch(/pushManager\.subscribe\(/);
    expect(blok).toMatch(/fetch\("\/api\/me\/push", \{\s*method: "POST"/);
    expect(blok).toMatch(/vorig/);
    expect(blok).not.toMatch(/postMessage\(\{ type: "pushsubscriptionchange" \}\)/);
  });

  it("stil herstel draait in de werker-, werkgevers- en beheerapp", () => {
    for (const f of ["components/app/FreelancerShell.tsx", "components/app/EmployerShell.tsx", "components/admin/AdminShell.tsx"]) {
      expect(lees(f), f).toMatch(/<PushSelfHeal \/>/);
    }
  });

  it("zelf uitgezet blijft uit: Uitzetten onthoudt dat, Aanzetten wist het", () => {
    const toggle = lees("components/app/PushToggle.tsx");
    expect(toggle).toMatch(/onthoudZelfUit\(true\);\s*\n?\s*setState\("off"\)/);
    expect(toggle).toMatch(/onthoudZelfUit\(false\);\s*\n?\s*return "aan"/);
    expect(toggle).toMatch(/zelfUitgezet: zelfUitgezet\(\)/);
  });

  it("Admin → Systeem toont een knop zodra geen beheerder meer een werkend apparaat heeft", () => {
    const pagina = lees("app/admin/systeem/page.tsx");
    expect(pagina).toMatch(/const pushZonderApparaat = channels\.webPush && adminPush === 0;/);
    expect(pagina).toMatch(/\{pushZonderApparaat && \([\s\S]{0,200}<MeldingenHier \/>/);
    expect(lees("components/admin/MeldingenHier.tsx")).toMatch(/role=\{melding\.fout \? "alert" : "status"\}/);
  });
});
