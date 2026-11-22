import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// "Laat me weten als hij er weer is" (stap 5, 15 nov 2026, lib/shop/voorraadmelding.ts): pas na bevestiging telt een
// aanvraag (met afmeldlink), één mail zodra hij weer op voorraad is, en het adres komt mee bij inzage en wissen.

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zekerflex.test/", MAIL_FROM: "shop@zekerflex.test", AUTH_SECRET: "test-geheim-test-geheim-test-geheim" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
const variantZoek = vi.fn();
const variantenZoek = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { shopProductVariant: { findUnique: (...a: unknown[]) => variantZoek(...a), findMany: (...a: unknown[]) => variantenZoek(...a) } },
}));
const kv = new Map<string, unknown>();
const volgorde: string[] = [];
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => {
    volgorde.push(`set ${k}`);
    kv.set(k, structuredClone(v));
  },
  kvDelete: async (k: string) => {
    volgorde.push(`del ${k}`);
    kv.delete(k);
  },
  kvListEntries: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value })),
}));
type Mail = { to: string; subject: string; text: string; html: string; kind: string };
const sendMail = vi.fn(async (input: Mail) => {
  volgorde.push(`mail ${input.to}`);
  return { delivered: true };
});
vi.mock("@/lib/mail", () => ({ sendMail: (i: Mail) => sendMail(i), mailShell: (t: string, b: string) => `${t}${b}`, mailButton: (h: string, l: string) => `<a href="${h}">${l}</a>` }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "203.0.113.9" }));

import { BEVESTIG_DAGEN, BEWAAR_DAGEN, MAX_PER_VARIANT, nogGeldig, normaliseerEmail, variantNaam, voegAanvraagToe, voorraadPad, type VoorraadAanvraag, type VoorraadLijst } from "@/lib/shop/voorraadmelding";
import { meldAanVoorVoorraad, stuurVoorraadMeldingen, verwerkVoorraadLink, voorraadHandtekening, voorraadmeldingenVan, wisVoorraadmeldingenVan } from "@/lib/shop/voorraadmelding-server";
import { POST } from "@/app/api/shop/voorraadmelding/route";
import { POST as AFMELDEN } from "@/app/api/shop/voorraadmelding/afmelden/route";

const lees = (f: string) => readFileSync(join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const NU = new Date("2026-11-15T19:00:00+01:00");
const DAG = 86_400_000;
const aanvraag = (email: string, extra: Partial<VoorraadAanvraag> = {}): VoorraadAanvraag => ({ id: `id-${email}`, email, at: NU.toISOString(), taal: "nl", bevestigd: true, ...extra });

afterEach(() => {
  kv.clear();
  volgorde.length = 0;
  vi.clearAllMocks();
});

describe("de regels", () => {
  it("neemt alleen bruikbare e-mailadressen, in kleine letters", () => {
    expect(normaliseerEmail("  Sanne@Voorbeeld.TEST ")).toBe("sanne@voorbeeld.test");
    for (const fout of ["", "geen-at", "a@b", "a b@c.nl", 42, null]) expect(normaliseerEmail(fout)).toBeNull();
  });

  it("telt een adres niet dubbel en houdt op bij het maximum", () => {
    const een = voegAanvraagToe(null, aanvraag("a@x.test"));
    expect(een).toMatchObject({ nieuw: true, vol: false, bestaand: null });
    expect(voegAanvraagToe(een.lijst, aanvraag("a@x.test", { id: "ander" }))).toMatchObject({ nieuw: false, bestaand: { id: "id-a@x.test" } });
    const vol = { aanvragen: Array.from({ length: MAX_PER_VARIANT }, (_, i) => aanvraag(`p${i}@x.test`)) };
    expect(voegAanvraagToe(vol, aanvraag("nieuw@x.test"))).toMatchObject({ nieuw: false, vol: true });
  });

  it("bevestigd 90 dagen bewaard, onbevestigd 3", () => {
    expect([BEWAAR_DAGEN, BEVESTIG_DAGEN]).toEqual([90, 3]);
    const lijst = {
      aanvragen: [
        aanvraag("oud@x.test", { at: new Date(NU.getTime() - 91 * DAG).toISOString() }),
        aanvraag("nieuw@x.test", { at: new Date(NU.getTime() - 89 * DAG).toISOString() }),
        aanvraag("onbevestigd-oud@x.test", { bevestigd: false, at: new Date(NU.getTime() - 4 * DAG).toISOString() }),
        aanvraag("onbevestigd@x.test", { bevestigd: false, at: new Date(NU.getTime() - 2 * DAG).toISOString() }),
      ],
    };
    expect(nogGeldig(lijst, NU).map((a) => a.email)).toEqual(["nieuw@x.test", "onbevestigd@x.test"]);
  });

  it("noemt maat en kleur, en een link draagt nooit het adres", () => {
    expect(variantNaam("Hoodie", "M", "Grijs")).toBe("Hoodie (M, Grijs)");
    expect(voorraadPad("ja", "var_1", "abc", "sig")).toBe("/shop/voorraadmelding?actie=ja&v=var_1&a=abc&s=sig");
  });
});

describe("aanmelden, bevestigen en afmelden", () => {
  it("nieuw: onbevestigd bewaard en een bevestigingsmail met een ja- en een afmeldlink, zonder het adres erin", async () => {
    variantZoek.mockResolvedValue({ size: "M", color: null, stock: 0, product: { name: "Hoodie", slug: "hoodie", active: true } });
    expect(await meldAanVoorVoorraad("var_1", "a@x.test", "nl", NU)).toBe("bevestig");
    const lijst = kv.get("shop-voorraad:var_1") as VoorraadLijst;
    expect(lijst.aanvragen).toEqual([expect.objectContaining({ email: "a@x.test", bevestigd: false })]);
    const mail = sendMail.mock.calls[0]?.[0] as Mail;
    expect(mail.subject).toBe("Bevestig: seintje als Hoodie (M) er weer is");
    const id = lijst.aanvragen[0]!.id;
    expect(mail.text).toContain(`https://zekerflex.test/shop/voorraadmelding?actie=ja&v=var_1&a=${encodeURIComponent(id)}&s=`);
    expect(mail.text).toContain("actie=af");
    expect(mail.html).toContain("Afmelden");
    expect(mail.text.match(/https:\/\/\S+/g)?.some((u) => u.includes("a%40x.test") || u.includes("a@x.test"))).toBe(false);
    // nog eens: geen tweede mail
    expect(await meldAanVoorVoorraad("var_1", "a@x.test", "nl", NU)).toBe("wacht-op-bevestiging");
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("bevestigen met de juiste handtekening; een andere handtekening of actie telt niet", async () => {
    kv.set("shop-voorraad:var_1", { aanvragen: [aanvraag("a@x.test", { bevestigd: false })] });
    variantZoek.mockResolvedValue({ size: null, color: null, stock: 0, product: { name: "Hoodie", slug: "hoodie", active: true } });
    expect(await verwerkVoorraadLink("ja", "var_1", "id-a@x.test", voorraadHandtekening("af", "var_1", "id-a@x.test"))).toEqual({ ok: false });
    expect(await verwerkVoorraadLink("ja", "var_1", "id-a@x.test", "nep")).toEqual({ ok: false });
    expect(await verwerkVoorraadLink("ja", "var_1", "id-a@x.test", voorraadHandtekening("ja", "var_1", "id-a@x.test"))).toEqual({ ok: true, product: { name: "Hoodie", slug: "hoodie" } });
    expect((kv.get("shop-voorraad:var_1") as VoorraadLijst).aanvragen[0]?.bevestigd).toBe(true);
  });

  it("afmelden wist de aanvraag; de route wil een POST met een geldige handtekening (anders 404)", async () => {
    kv.set("shop-voorraad:var_1", { aanvragen: [aanvraag("a@x.test")] });
    variantZoek.mockResolvedValue(null);
    const stuur = (body: unknown) => AFMELDEN(new Request("https://zekerflex.test/api/shop/voorraadmelding/afmelden", { method: "POST", body: JSON.stringify(body) }));
    expect((await stuur({ v: "var_1", a: "id-a@x.test", s: "nep" })).status).toBe(404);
    expect(kv.has("shop-voorraad:var_1")).toBe(true);
    expect((await stuur({ v: "var_1", a: "id-a@x.test", s: voorraadHandtekening("af", "var_1", "id-a@x.test") })).status).toBe(200);
    expect(kv.has("shop-voorraad:var_1")).toBe(false);
  });

  it("de aanmeldroute: fout adres 422, onbekende maat 404 (geen 403), en een limiet per adres", async () => {
    const stuur = (body: unknown) => POST(new Request("https://zekerflex.test/api/shop/voorraadmelding", { method: "POST", body: JSON.stringify(body) }));
    expect((await stuur({ variantId: "var_1", email: "geen-adres" })).status).toBe(422);
    variantZoek.mockResolvedValue(null);
    expect((await stuur({ variantId: "var_x", email: "a@x.test" })).status).toBe(404);
    variantZoek.mockResolvedValue({ size: null, color: null, stock: 0, product: { name: "Mok", slug: "mok", active: true } });
    const goed = await stuur({ variantId: "var_1", email: "A@X.test", taal: "en" });
    expect(await goed.json()).toEqual({ uitslag: "bevestig" });
    expect((sendMail.mock.calls[0]?.[0] as Mail).subject).toBe("Confirm: let me know when Mok is back");
    const route = lees("app/api/shop/voorraadmelding/route.ts");
    expect(route).toContain("identifier: emailHash(email)");
    expect(route).toContain("limit: 5,");
  });
});

describe("de ronde", () => {
  const product = { name: "Hoodie", slug: "hoodie", active: true };

  it("weer op voorraad: alleen bevestigde aanvragen krijgen een mail; eerst weg, dan mailen; onbevestigde blijven", async () => {
    kv.set("shop-voorraad:var_1", { aanvragen: [aanvraag("a@x.test"), aanvraag("b@x.test", { taal: "en" }), aanvraag("c@x.test", { bevestigd: false })] });
    variantenZoek.mockResolvedValue([{ id: "var_1", size: "M", color: "Grijs", stock: 2, product }]);
    const uit = await stuurVoorraadMeldingen(NU);
    expect(uit).toEqual({ gemaild: 2, verlopen: 0, wachtend: 1 });
    expect(volgorde).toEqual(["set shop-voorraad:var_1", "mail a@x.test", "mail b@x.test"]);
    expect((kv.get("shop-voorraad:var_1") as VoorraadLijst).aanvragen.map((a) => a.email)).toEqual(["c@x.test"]);
    const [nl, en] = sendMail.mock.calls.map((c) => c[0] as Mail);
    expect(nl?.subject).toBe("Weer op voorraad: Hoodie (M, Grijs)");
    expect(nl?.text).toContain("Dit was de enige mail hierover");
    expect(en?.subject).toBe("Back in stock: Hoodie (M, Grijs)");
  });

  it("nog op: wachten en verlopen eruit; product weg of alles verlopen: opruimen", async () => {
    kv.set("shop-voorraad:var_1", { aanvragen: [aanvraag("oud@x.test", { at: new Date(NU.getTime() - 100 * DAG).toISOString() }), aanvraag("nieuw@x.test")] });
    kv.set("shop-voorraad:var_weg", { aanvragen: [aanvraag("c@x.test")] });
    kv.set("shop-voorraad:var_2", { aanvragen: [aanvraag("d@x.test", { bevestigd: false, at: new Date(NU.getTime() - 5 * DAG).toISOString() })] });
    variantenZoek.mockResolvedValue([
      { id: "var_1", size: null, color: null, stock: 0, product },
      { id: "var_2", size: null, color: null, stock: 3, product },
    ]);
    const uit = await stuurVoorraadMeldingen(NU);
    expect(uit).toEqual({ gemaild: 0, verlopen: 2, wachtend: 1 });
    expect(sendMail).not.toHaveBeenCalled();
    expect((kv.get("shop-voorraad:var_1") as VoorraadLijst).aanvragen.map((a) => a.email)).toEqual(["nieuw@x.test"]);
    expect(kv.has("shop-voorraad:var_weg")).toBe(false);
    expect(kv.has("shop-voorraad:var_2")).toBe(false);
  });
});

describe("inzage en wissen (AVG)", () => {
  it("vindt en wist de aanvragen van één adres in elke lijst", async () => {
    kv.set("shop-voorraad:var_1", { aanvragen: [aanvraag("a@x.test"), aanvraag("b@x.test")] });
    kv.set("shop-voorraad:var_2", { aanvragen: [aanvraag("a@x.test", { bevestigd: false })] });
    variantenZoek.mockResolvedValue([
      { id: "var_1", size: "M", color: null, product: { name: "Hoodie" } },
      { id: "var_2", size: null, color: null, product: { name: "Mok" } },
    ]);
    expect(await voorraadmeldingenVan("A@x.test")).toEqual([
      { product: "Hoodie (M)", sinds: NU.toISOString(), bevestigd: true },
      { product: "Mok", sinds: NU.toISOString(), bevestigd: false },
    ]);
    expect(await wisVoorraadmeldingenVan("a@x.test")).toBe(2);
    expect((kv.get("shop-voorraad:var_1") as VoorraadLijst).aanvragen.map((a) => a.email)).toEqual(["b@x.test"]);
    expect(kv.has("shop-voorraad:var_2")).toBe(false);
  });

  it("export en wissen van een account nemen het mee", () => {
    expect(lees("lib/privacy/export.ts")).toContain('sections.voorraadmeldingen = await safe("voorraadmeldingen", () => voorraadmeldingenVan(user.email));');
    expect(lees("lib/privacy/anonymize.ts")).toContain("cleared.voorraadmeldingen = await wisVoorraadmeldingenVan(oldEmail).catch(() => 0);");
  });
});

describe("ingeplugd", () => {
  it("de cron draait hem elk kwartier en de hartslag kent hem", () => {
    expect(lees("deploy/cron/entrypoint.sh")).toContain('7,22,37,52 * * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/shop/voorraadmelding"');
    expect(lees("lib/ops/heartbeat.ts")).toContain('{ job: "voorraadmelding", label: "Webshop: mail als iets weer op voorraad is", maxAgeHours: 2 }');
    expect(lees("app/api/internal/shop/voorraadmelding/route.ts")).toContain("checkInternalToken(request)");
  });

  // de productpagina en de afmeldpagina van de webshop zijn op 22 nov 2026 weggehaald; de aanvragen, het wissen en de mail blijven
  it("een adres komt in geen log", () => {
    const server = lees("lib/shop/voorraadmelding-server.ts");
    expect(server).not.toMatch(/logger\.\w+\([^)]*email/);
  });

  it("alle nieuwe teksten staan in het Nederlands én het Engels", () => {
    const nl = lees("lib/i18n/dictionaries.ts");
    const en = lees("lib/i18n/dictionary-en.ts");
    for (const k of ["voorraadVraag", "voorraadUitleg", "voorraadKlaar", "voorraadWacht", "voorraadBevestigd", "voorraadAfgemeld", "voorraadAfmeldKnop", "voorraadLinkFout", "voorraadNaarProduct"]) {
      expect(nl, k).toMatch(new RegExp(`\\n\\s+${k}: "`));
      expect(en, k).toMatch(new RegExp(`\\n\\s+${k}: "`));
    }
  });
});
