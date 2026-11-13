import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const live = vi.hoisted(() => ({
  env: { STRIPE_SECRET_KEY: "", SEPA_CREDITOR_IBAN: "NL91ABNA0417164300", SEPA_CREDITOR_NAME: "ZekerFlex B.V.", STRIPE_PUBLISHABLE_KEY: "", IMAGE_ENABLED: false, APP_BASE_URL: "https://www.zekerflex.com" },
  txt: [] as string[][],
  txtHosts: [] as string[],
  backup: null as unknown,
  models: new Map<string, unknown>(),
  testUsers: 0,
  branches: [] as { name: string; tenant: { name: string } }[],
  webhookEvents: [] as string[],
  proposals: [] as { status: string; createdAt: string; expiresAt: string }[],
}));
vi.mock("@/lib/sales/website-proposal", () => ({ listWebsiteProposals: async () => live.proposals }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async (k: string) => kv.get(k) ?? null, kvSet: async (k: string, v: unknown) => void kv.set(k, v) }));
vi.mock("@/lib/env", () => ({ env: live.env }));
vi.mock("@/lib/ai/client", () => ({
  ensureAiNode: async () => undefined, llmHealth: async () => ({ ok: false, baseUrl: "", model: "m", detail: "geen model" }) }));
// de gecachte variant (lib/ai/gezondheid.ts) trekt anders echt Redis mee
vi.mock("@/lib/ai/gezondheid", () => ({
  llmGezondheidGecachet: async () => ({ ok: false, baseUrl: "", model: "m", detail: "geen model" }),
}));
vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => ({
    accounts: { retrieveCurrent: async () => ({ capabilities: {} }) },
    webhookEndpoints: { list: async () => ({ data: [{ status: "enabled", enabled_events: live.webhookEvents }] }) },
  }),
}));
vi.mock("@/lib/bank/insurance", () => ({ getProducts: async () => [] }));
vi.mock("@/lib/messaging/contacts", () => ({ platformAdminIds: async () => [] }));
vi.mock("@/lib/billing/reminders", () => ({ getReminderSettings: async () => ({ enabled: false }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { count: async () => live.testUsers },
    branch: { findMany: async () => live.branches },
    webPushSubscription: { count: async () => 0 },
  },
}));
vi.mock("@/lib/ops/backup", () => ({ readBackupReport: async () => live.backup }));
vi.mock("@/lib/shop/model3d", () => ({ listModels3D: async () => live.models }));
vi.mock("node:dns/promises", () => ({
  Resolver: class {
    async resolveTxt(host: string) {
      live.txtHosts.push(host);
      return live.txt;
    }
  },
}));

import { addCustom, customTodos, ownerTodos, setManualDone, updateCustom } from "@/lib/admin/owner-todos";

const byId = async () => Object.fromEntries((await ownerTodos()).map((x) => [x.id, x]));

beforeEach(() => {
  kv.clear();
  live.env.STRIPE_SECRET_KEY = "";
  live.txt = [];
  live.txtHosts = [];
  live.backup = null;
  live.models = new Map();
  live.testUsers = 0;
  live.branches = [];
  live.webhookEvents = [];
  live.proposals = [];
});

describe("websitevoorstellen versturen", () => {
  it("counts proposals left as concept for 2+ days (not fresh, sent or expired ones) and ticks itself off", async () => {
    const day = 86_400_000;
    const now = Date.now();
    const p = (status: string, ageDays: number, expiresInDays = 20) => ({ status, createdAt: new Date(now - ageDays * day).toISOString(), expiresAt: new Date(now + expiresInDays * day).toISOString() });
    live.proposals = [p("concept", 3), p("concept", 5), p("concept", 1), p("verstuurd", 9), p("concept", 40, -1)];
    expect((await byId())["websitevoorstellen-versturen"]).toMatchObject({ title: "2 websitevoorstellen staan klaar om te versturen", done: false, auto: true });
    live.proposals = [p("concept", 3)];
    expect((await byId())["websitevoorstellen-versturen"]?.title).toBe("1 websitevoorstel staat klaar om te versturen");
    live.proposals = [];
    expect((await byId())["websitevoorstellen-versturen"]).toMatchObject({ title: "Websitevoorstellen versturen", done: true });
  });
});

describe("owner to-do list", () => {
  it("Stripe ontvangt geen betalingen meer: de taak opent zich met de datum, en vinkt zichzelf af als het weer aan staat", async () => {
    expect((await byId())["stripe-betalen-uit"]).toMatchObject({ done: true, auto: true });
    kv.set("stripe:account-stand", { betalen: false, uitbetalen: false, gemeten: "2026-11-12T05:00:00.000Z", uitSinds: "2026-11-11T17:31:05.000Z" });
    const open = (await byId())["stripe-betalen-uit"];
    expect(open).toMatchObject({ done: false, auto: true, group: "Geld & bank" });
    expect(open?.title).toMatch(/^Stripe ontvangt geen betalingen meer sinds 11-11-2026/);
    expect(open?.why).toMatch(/bankafschrift/);
    kv.set("stripe:account-stand", { betalen: true, uitbetalen: true, gemeten: "2026-11-12T09:00:00.000Z", uitSinds: null });
    expect((await byId())["stripe-betalen-uit"]?.done).toBe(true);
    kv.delete("stripe:account-stand");
  });

  it("Stripe Identity geweigerd voor het account: de taak gaat open met de melding van Stripe, en daarna weer dicht", async () => {
    expect((await byId())["stripe-identity-account"]).toMatchObject({ done: true, auto: true });
    kv.set("stripe-identity:account-geweigerd", { tot: new Date(Date.now() + 3_600_000).toISOString(), op: "2026-11-11T19:38:24.000Z", melding: "This account is unable to perform this action." });
    const open = (await byId())["stripe-identity-account"];
    expect(open).toMatchObject({ done: false, auto: true, group: "Geld & bank" });
    expect(open?.why).toContain("This account is unable to perform this action.");
    expect(open?.why).toContain("eigen ID-scan");
    // verlopen (na 24 uur): weer dicht, ZekerFlex probeert het opnieuw
    kv.set("stripe-identity:account-geweigerd", { tot: new Date(Date.now() - 1000).toISOString(), op: "2026-11-11T19:38:24.000Z", melding: "x" });
    expect((await byId())["stripe-identity-account"]?.done).toBe(true);
    kv.delete("stripe-identity:account-geweigerd");
  });

  it("checks configuration automatically", async () => {
    const t = await byId();
    expect(t.sepa!.done).toBe(true);
    expect(t.llm!.done).toBe(false);
    // ZekerFlex Bank staat uit (lib/app-mode.ts): passen en verzekeraar zijn dan niet meer nodig
    expect(t["issuing-active"]!.done).toBe(true);
    expect(t.insurer!.done).toBe(true);
  });

  it("manual items can be ticked off, with who and when", async () => {
    await setManualDone("terms-review", true, "Brian");
    const t = (await ownerTodos()).find((x) => x.id === "terms-review")!;
    expect(t.done).toBe(true);
    expect(t.doneNote).toContain("Brian");
    await setManualDone("terms-review", false, "Brian");
    expect((await ownerTodos()).find((x) => x.id === "terms-review")!.done).toBe(false);
  });

  it("every item that can't check itself can be ticked off (none snaps back)", async () => {
    const manual = (await ownerTodos()).filter((x) => !x.auto);
    for (const x of manual) await setManualDone(x.id, true, "Brian");
    const after = await byId();
    expect(manual.filter((x) => !after[x.id]!.done).map((x) => x.id)).toEqual([]);
    expect(manual.map((x) => x.id)).toEqual(expect.arrayContaining(["stripe-identity", "play-store-app", "vacaturefeed", "google-business"]));
  });

  it("kennisbank: de taak vinkt zichzelf af zodra de API-sleutel erin staat en de kennisbank gevuld is (op prod, 13 nov: nog geen sleutel)", async () => {
    expect((await byId())["kennisbank-api"]).toMatchObject({ done: false, auto: true });
    kv.set("kennisbank:api", "sleutel");
    kv.set("kennisbank:stand", { apiGezet: true, laatstGevuld: null, verzamelingen: [], laatsteFout: null });
    expect((await byId())["kennisbank-api"]).toMatchObject({ done: false, doneNote: "de sleutel staat erin; klik nog op 'Kennisbank vullen'" });
    kv.set("kennisbank:stand", { apiGezet: true, laatstGevuld: "2026-11-13T09:00:00.000Z", verzamelingen: [], laatsteFout: null });
    expect((await byId())["kennisbank-api"]!.done).toBe(true);
  });

  it("eigen namen voor rapportages en kennisbank: klaar zodra beide adressen geen sslip.io-naam meer zijn (op prod, 13 nov: nog technische namen)", async () => {
    const env = live.env as Record<string, unknown>;
    env.METABASE_PUBLIC_URL = "https://bi.37-97-226-24.sslip.io";
    env.OUTLINE_PUBLIC_URL = "https://kennis.37-97-226-24.sslip.io";
    expect((await byId())["diensten-dns"]).toMatchObject({ done: false, auto: true, doneNote: "nog een technische naam (sslip.io)" });
    env.METABASE_PUBLIC_URL = "https://bi.zekerflex.com";
    expect((await byId())["diensten-dns"]!.done).toBe(false);
    env.OUTLINE_PUBLIC_URL = "https://kennis.zekerflex.com";
    expect((await byId())["diensten-dns"]!.done).toBe(true);
    delete env.METABASE_PUBLIC_URL;
    delete env.OUTLINE_PUBLIC_URL;
  });

  it("geen taaktekst noemt nog een server van 8 GB (de VPS heeft 16 GB sinds 7 nov)", async () => {
    const tekst = (await ownerTodos()).map((x) => [x.title, x.why, ...x.how].join(" ")).join("\n");
    expect(tekst).not.toMatch(/\b8 GB\b.*(VPS|server)|(VPS|server).*\b8 GB\b/);
  });

  it("geen taak meer om GitHub te betalen: Actions staan bewust uit (9 nov), de controle draait op de eigen server", async () => {
    const ids = (await ownerTodos()).map((x) => x.id);
    expect(ids).not.toContain("github-billing");
  });

  it("AVG-opschoning: vinkt zichzelf af op de hartslag van de nachtelijke run, niet met de hand", async () => {
    expect((await byId())["avg-bewaartermijn"]).toMatchObject({ auto: true, done: false, doneNote: "nog geen run gezien" });
    kv.set("cron-heartbeat:retention-sweep", { at: new Date(Date.now() - 3 * 3_600_000).toISOString(), ok: true });
    const t = (await byId())["avg-bewaartermijn"]!;
    expect(t.done).toBe(true);
    expect(t.doneNote).toMatch(/^laatst gedraaid op /);
    kv.set("cron-heartbeat:retention-sweep", { at: new Date(Date.now() - 3 * 3_600_000).toISOString(), ok: false });
    expect((await byId())["avg-bewaartermijn"]).toMatchObject({ done: false, doneNote: expect.stringMatching(/^laatste run mislukt op /) });
    kv.set("cron-heartbeat:retention-sweep", { at: new Date(Date.now() - 30 * 3_600_000).toISOString(), ok: true });
    expect((await byId())["avg-bewaartermijn"]!.done).toBe(false); // ouder dan de 26 uur van de bewaking
  });

  it("sends the owner to the own server, not to Vercel, for settings", async () => {
    const stale = (await ownerTodos()).filter((x) => x.id !== "vercel-duplicate" && /vercel/i.test(x.how.join(" ")));
    expect(stale.map((x) => x.id)).toEqual([]);
  });

  it("ticks the backup off only after a good night with a restore drill", async () => {
    expect((await byId()).backups).toMatchObject({ auto: true, done: false, doneNote: "geen back-upmap gevonden op deze server" });
    live.backup = { available: true, state: "ok", reasons: [], status: { at: "2026-11-02T02:31:00Z" }, files: [], disk: null };
    const ok = (await byId()).backups!;
    expect(ok.done).toBe(true);
    expect(ok.doneNote).toContain("proef-terugzetting gelukt");
    live.backup = { available: true, state: "failed", reasons: ["De proef-terugzetting is niet gelukt."], status: null, files: [], disk: null };
    expect((await byId()).backups).toMatchObject({ done: false, doneNote: "De proef-terugzetting is niet gelukt." });
  });

  it("counts Search Console as done when the DNS record of the main domain is there", async () => {
    expect((await byId())["search-console"]!.done).toBe(false);
    live.txt = [["v=spf1 include:_spf.transip.email ~all"], ["google-site-verification=abc", "123"]];
    expect((await byId())["search-console"]!.done).toBe(true);
    expect(live.txtHosts.at(-1)).toBe("zekerflex.com");
  });

  it("reads the Stripe webhook for the expired-checkout event", async () => {
    expect((await byId())["stripe-expired"]!.auto).toBe(false);
    live.env.STRIPE_SECRET_KEY = "sk_test_x";
    live.webhookEvents = ["checkout.session.completed"];
    expect((await byId())["stripe-expired"]).toMatchObject({ auto: true, done: false });
    live.webhookEvents = ["checkout.session.completed", "checkout.session.expired"];
    expect((await byId())["stripe-expired"]!.done).toBe(true);
    live.webhookEvents = ["*"];
    expect((await byId())["stripe-expired"]!.done).toBe(true);
  });

  it("names leftover test accounts, vague branch cities and counts 3D models", async () => {
    live.testUsers = 5;
    live.branches = [{ name: "Hoofdvestiging", tenant: { name: "Café De Hoek" } }];
    let t = await byId();
    expect(t["test-accounts"]).toMatchObject({ done: false, doneNote: "nog 5 over" });
    expect(t["branch-cities"]).toMatchObject({ done: false, doneNote: "Bij: Café De Hoek (Hoofdvestiging)" });
    expect(t["3d-models"]!.done).toBe(false);
    live.testUsers = 0;
    live.branches = [];
    live.models = new Map([["p1", {}]]);
    t = await byId();
    expect(t["test-accounts"]!.done).toBe(true);
    expect(t["branch-cities"]!.done).toBe(true);
    expect(t["3d-models"]).toMatchObject({ done: true, doneNote: "1 product heeft een 3D-model" });
  });

  it("keeps own notes", async () => {
    const [n] = await addCustom("KVK-uittreksel opvragen");
    await updateCustom(n!.id, { done: true });
    expect((await customTodos())[0]).toMatchObject({ text: "KVK-uittreksel opvragen", done: true });
    await updateCustom(n!.id, { remove: true });
    expect(await customTodos()).toEqual([]);
  });
});
