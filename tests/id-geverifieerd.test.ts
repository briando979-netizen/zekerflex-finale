import { beforeEach, describe, expect, it, vi } from "vitest";

// De melding "ID geverifieerd": eenmalig per werker, in de app-taal, en geen echte mail naar een testadres.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  user: null as unknown,
  pushes: [] as { ids: string[]; push: { title: string; body: string; data: Record<string, string> } }[],
  mails: [] as { to: string; subject: string }[],
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
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (ids: string[], push: { title: string; body: string; data: Record<string, string> }) => (h.pushes.push({ ids, push }), ids.length),
}));
vi.mock("@/lib/mail", async () => {
  const echt = await vi.importActual<typeof import("@/lib/mail")>("@/lib/mail");
  return { ...echt, sendMail: async (m: { to: string; subject: string }) => (h.mails.push({ to: m.to, subject: m.subject }), { id: "m", delivered: true, transport: "mailbox" }) };
});

import { meldIdGeverifieerd } from "@/lib/onboarding/id-geverifieerd";
import { idGeverifieerdEmail } from "@/lib/mail";
import { WORKER_PUSH } from "@/lib/i18n/worker-push";
import { LOCALES } from "@/lib/i18n/config";

const werker = (email: string, kyc = "VERIFIED") => ({ email, fullName: "Jan de Vries", kycStatus: kyc, disabledAt: null, memberships: [{ role: "FREELANCER" }] });

beforeEach(() => {
  h.kv.clear();
  h.pushes.length = 0;
  h.mails.length = 0;
});

describe("meldIdGeverifieerd", () => {
  it("stuurt één push en één mail, en bij een tweede keer niets", async () => {
    h.user = werker("jan@voorbeeld.nl");
    expect(await meldIdGeverifieerd("u1")).toMatchObject({ verstuurd: true, push: 1, mail: true });
    expect(h.pushes[0]?.push.data["url"]).toBe("/dashboard/eerste-indruk");
    expect(await meldIdGeverifieerd("u1")).toEqual({ verstuurd: false, reden: "al-gemeld" });
    expect(h.pushes).toHaveLength(1);
    expect(h.mails).toHaveLength(1);
  });
  it("gebruikt de app-taal van de werker", async () => {
    h.user = werker("jan@voorbeeld.nl");
    for (const l of LOCALES) {
      h.kv.clear();
      h.pushes.length = 0;
      h.kv.set("werker-taal:u1", { locale: l });
      await meldIdGeverifieerd("u1");
      expect(h.pushes[0]?.push.title, l).toBe(WORKER_PUSH[l].idOkTitle);
    }
  });
  it("stuurt geen echte mail naar een testadres, wel de push", async () => {
    h.user = werker("werker@x.test");
    expect(await meldIdGeverifieerd("u2")).toMatchObject({ verstuurd: true, mail: false });
    expect(h.mails).toHaveLength(0);
    expect(h.pushes).toHaveLength(1);
  });
  it("meldt niets als het ID niet geverifieerd is of het geen werker is", async () => {
    h.user = werker("a@voorbeeld.nl", "PENDING");
    expect(await meldIdGeverifieerd("u3")).toEqual({ verstuurd: false, reden: "niet-geverifieerd" });
    h.user = { ...werker("a@voorbeeld.nl"), memberships: [{ role: "HQ_ADMIN" }] };
    expect(await meldIdGeverifieerd("u4")).toEqual({ verstuurd: false, reden: "geen-werker" });
    expect(h.pushes).toHaveLength(0);
  });
});

describe("teksten", () => {
  it("push in alle vijf talen, en de mail schermt de naam af", () => {
    for (const l of LOCALES) {
      expect(WORKER_PUSH[l].idOkTitle.length, l).toBeGreaterThan(5);
      expect(WORKER_PUSH[l].idOkBody.length, l).toBeGreaterThan(20);
    }
    const m = idGeverifieerdEmail("<script>x</script> Piet", "https://app.example");
    expect(m.html).not.toContain("<script>x");
    expect(m.text).toContain("/dashboard/eerste-indruk");
    expect(m.kind).toBe("onboarding");
  });
});
