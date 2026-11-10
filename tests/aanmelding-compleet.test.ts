import { beforeEach, describe, expect, it, vi } from "vitest";

// De mail "aanmelding compleet": eenmalig, alleen na een open start (wie al klaar was krijgt niets),
// met de juiste stand (reageren / nog één ding / ID in controle), geen dubbele mail na de ID-mail,
// en geen echte mail naar een testadres.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  user: null as unknown,
  reageren: { ok: false, reden: null as string | null },
  mails: [] as { to: string; subject: string; text: string }[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => h.user },
    keyValueStore: {
      findMany: async (a: { where: { key: { in: string[] } } }) => a.where.key.in.filter((k) => h.kv.has(k)).map((k) => ({ key: k, value: h.kv.get(k) })),
      findUnique: async (a: { where: { key: string } }) => (h.kv.has(a.where.key) ? { key: a.where.key, value: h.kv.get(a.where.key) } : null),
      upsert: async (a: { where: { key: string }; create: { value: unknown } }) => void h.kv.set(a.where.key, a.create.value),
    },
  },
}));
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: async (ids: string[]) => ids.length }));
vi.mock("@/lib/onboarding/kan-reageren", () => ({ kanReagerenOpKlussen: async () => h.reageren }));
vi.mock("@/lib/mail", async () => {
  const echt = await vi.importActual<typeof import("@/lib/mail")>("@/lib/mail");
  return {
    ...echt,
    sendMail: async (m: { to: string; subject: string; text: string }) => (h.mails.push({ to: m.to, subject: m.subject, text: m.text }), { id: "m", delivered: true, transport: "mailbox" }),
  };
});

import { meldAanmeldingCompleet, noteerAanmeldingOpen, vergeetAanmeldingGeheugen } from "@/lib/onboarding/aanmelding-compleet";
import { aanmeldingCompleetEmail, idGeverifieerdEmail } from "@/lib/mail";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";

const werker = (email: string, kyc = "VERIFIED") => ({ email, fullName: "Jan de Vries", kycStatus: kyc, disabledAt: null, memberships: [{ role: "FREELANCER" }] });
const nu = new Date("2026-11-10T09:00:00+01:00");

beforeEach(() => {
  h.kv.clear();
  h.mails.length = 0;
  h.reageren = { ok: false, reden: null };
  vergeetAanmeldingGeheugen();
});

describe("meldAanmeldingCompleet", () => {
  it("stuurt niets aan wie we nooit met een open start zagen (al klaar vóór dit live ging)", async () => {
    h.user = werker("jan@voorbeeld.nl");
    expect(await meldAanmeldingCompleet("u1", nu)).toEqual({ verstuurd: false, reden: "nooit-open" });
    expect(h.mails).toHaveLength(0);
  });

  it("ID nog in controle: 'we hebben je gegevens ontvangen', één keer", async () => {
    h.user = werker("jan@voorbeeld.nl", "PENDING");
    await noteerAanmeldingOpen("u2", nu);
    expect(h.kv.get("werker-aanmelding:u2")).toEqual({ open: nu.toISOString() });
    vergeetAanmeldingGeheugen();
    expect(await meldAanmeldingCompleet("u2", nu)).toEqual({ verstuurd: true, soort: "id-in-controle", mail: true });
    expect(h.mails[0]?.subject).toBe("We hebben je gegevens ontvangen");
    expect(h.mails[0]?.text).toMatch(/We controleren nu je ID/);
    vergeetAanmeldingGeheugen();
    expect(await meldAanmeldingCompleet("u2", nu)).toEqual({ verstuurd: false, reden: "al-gemeld" });
    expect(h.mails).toHaveLength(1);
  });

  it("ID geverifieerd en alles in orde: 'je kunt vanaf nu reageren op klussen'", async () => {
    h.user = werker("jan@voorbeeld.nl");
    h.reageren = { ok: true, reden: null };
    await noteerAanmeldingOpen("u3", nu);
    expect(await meldAanmeldingCompleet("u3", nu)).toMatchObject({ verstuurd: true, soort: "kan-reageren" });
    expect(h.mails[0]?.text).toMatch(/Je kunt vanaf nu reageren op klussen\./);
  });

  it("ID geverifieerd maar nog iets nodig: de reden staat in de mail", async () => {
    h.user = werker("jan@voorbeeld.nl");
    h.reageren = { ok: false, reden: "Vul je rekeningnummer (IBAN) in bij Verificatie → Bankrekening bevestigen om op klussen te reageren." };
    await noteerAanmeldingOpen("u4", nu);
    expect(await meldAanmeldingCompleet("u4", nu)).toMatchObject({ verstuurd: true, soort: "nog-iets" });
    expect(h.mails[0]?.subject).toBe("Je aanmelding is compleet: nog één ding");
    expect(h.mails[0]?.text).toMatch(/IBAN/);
  });

  it("zei de ID-mail al 'je kunt vanaf nu reageren', dan niet nog eens", async () => {
    h.user = werker("jan@voorbeeld.nl");
    h.reageren = { ok: true, reden: null };
    h.kv.set("werker-id-melding:u5", { at: nu.toISOString(), kanReageren: true });
    await noteerAanmeldingOpen("u5", nu);
    expect(await meldAanmeldingCompleet("u5", nu)).toEqual({ verstuurd: false, reden: "zelfde-als-id-mail" });
    expect(h.mails).toHaveLength(0);
  });

  it("geen echte mail naar een testadres, en niets voor wie geen werker is", async () => {
    h.user = werker("werker@x.test", "PENDING");
    await noteerAanmeldingOpen("u6", nu);
    expect(await meldAanmeldingCompleet("u6", nu)).toEqual({ verstuurd: true, soort: "id-in-controle", mail: false });
    h.user = { ...werker("baas@voorbeeld.nl"), memberships: [{ role: "HQ_ADMIN" }] };
    await noteerAanmeldingOpen("u7", nu);
    expect(await meldAanmeldingCompleet("u7", nu)).toEqual({ verstuurd: false, reden: "geen-werker" });
    expect(h.mails).toHaveLength(0);
  });

  it("de sleutel valt onder wissen en exporteren (AVG)", () => {
    expect(ERASABLE_KV_PREFIXES).toContain("werker-aanmelding:");
  });
});

describe("teksten van de mails", () => {
  it("de ID-mail zegt 'vanaf nu reageren' alleen als dat zo is", () => {
    expect(idGeverifieerdEmail("Jan de Vries", "https://zekerflex.com", true).text).toMatch(/Je kunt vanaf nu reageren op klussen\./);
    expect(idGeverifieerdEmail("Jan de Vries", "https://zekerflex.com").text).toMatch(/zodra de rest van je aanmelding klopt/);
  });

  it("de mail 'aanmelding compleet' schermt de naam af en linkt naar de klussen", () => {
    const m = aanmeldingCompleetEmail({ fullName: "<b>Jan</b> de Vries", appUrl: "https://zekerflex.com/", soort: "kan-reageren" });
    expect(m.html).not.toMatch(/<b>Jan<\/b>/);
    expect(m.html).toMatch(/https:\/\/zekerflex\.com\/dashboard\/klussen/);
    expect(m.kind).toBe("aanmelding-compleet");
  });
});
