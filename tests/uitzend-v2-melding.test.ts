import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// De melding "je uitzendovereenkomst is bijgewerkt" aan werkers met alleen een v1: eerst een push; bereikt die geen apparaat, dan een mail in de
// mailtaal van de werker met een link naar Verificatie. Pas gemarkeerd als het echt aankwam (push > 0 of mail bezorgd), met kanaal en tijd.
// Mislukt alles, dan niet gemarkeerd en nooit een tweede poging binnen dezelfde run. Hooguit 50 per run. Testadressen en geblokkeerde accounts
// blijven overgeslagen. Droog: alleen aantallen per kanaal.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  gebruikers: [] as { id: string; email: string; fullName: string; emailVerifiedAt: Date | null; disabledAt: Date | null }[],
  subs: new Set<string>(),
  pushBereikt: new Map<string, number>(),
  pushes: [] as { id: string; titel: string }[],
  mails: [] as { to: string; subject: string; kind: string; text: string; html: string }[],
  mailOk: true,
  mailGooit: false,
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? structuredClone(h.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, structuredClone(v)),
  kvListEntries: async (prefix: string) => [...h.kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value: structuredClone(value) })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => h.gebruikers.filter((u) => where.id.in.includes(u.id)) },
    webPushSubscription: { findMany: async ({ where }: { where: { userId: { in: string[] } } }) => [...h.subs].filter((id) => where.userId.in.includes(id)).map((userId) => ({ userId })) },
  },
}));
vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: { to: string; subject: string; kind: string; text: string; html: string }) => {
    h.mails.push(m);
    if (h.mailGooit) throw new Error("smtp weg");
    return { id: "m", delivered: h.mailOk, transport: "smtp" };
  },
}));
vi.mock("@/lib/mail/taal", () => ({ mailTaalVoorWerker: async (id: string) => (id.startsWith("pl") ? "pl" : "nl") }));
vi.mock("@/lib/notifications/localized-push", () => ({
  sendLocalizedPush: async (ids: string[], build: (t: unknown, l: "nl" | "pl") => { title: string }) => {
    const id = ids[0]!;
    h.pushes.push({ id, titel: build({}, id.startsWith("pl") ? "pl" : "nl").title });
    return h.pushBereikt.get(id) ?? 0;
  },
}));
vi.mock("@/lib/internal-auth", () => ({ checkInternalToken: (r: Request) => (r.headers.get("x-internal-token") === "geheim" ? { ok: true } : { ok: false, status: 401, message: "Niet toegestaan" }) }));

import { meldUitzendBijgewerkt, MAX_PER_RUN, MELDING_PREFIX } from "@/lib/agreements/uitzend-melding";
import { uitzendBijgewerktEmailT } from "@/lib/mail/werker/uitzend-bijgewerkt";
import { POST as meldRoute } from "@/app/api/internal/agreements/uitzend-v2-melding/route";

const NU = new Date("2026-11-12T12:00:00+01:00").getTime();
const DAG = 86_400_000;
// Tijdbom (14 nov): de contracten in de fixtures lopen tot NU + 30 dagen, en de route neemt de echte klok (geen `nu`).
// Vanaf 12 december 2026 zou de route-test dus 0 te melden zien en elke uitrol tegenhouden (gevonden met de klok
// +35 dagen). Daarom staat de klok hier vast op NU; de losse aanroepen geven `nu: NU` al mee.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NU));
});
afterAll(() => vi.useRealTimers());
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

/** Een werker met alleen een geldige v1 (geen sjabloon-veld). */
function zet(id: string, over: { email?: string; bevestigd?: boolean; geblokkeerd?: boolean } = {}) {
  h.kv.set(`uitzend-contracts:${id}`, [{ id: `c-${id}`, reference: "ZF-UZO-2026-001-x", userId: id, workerName: "N", workerBsnLast4: null, employerName: "Zekerflex, Inc.", employerKvk: "00000000", signedAt: "2026-11-05T09:30:00.000Z", validFrom: "2026-11-05T09:30:00.000Z", validUntil: new Date(NU + 30 * DAG).toISOString(), phase: "A", weeksWorked: 1 }]);
  h.gebruikers.push({ id, email: over.email ?? `${id}@voorbeeld.nl`, fullName: "Anna Kowalska", emailVerifiedAt: over.bevestigd === false ? null : new Date(NU - DAG), disabledAt: over.geblokkeerd ? new Date(NU) : null });
}

beforeEach(() => {
  h.kv.clear();
  h.gebruikers = [];
  h.subs = new Set();
  h.pushBereikt = new Map();
  h.pushes = [];
  h.mails = [];
  h.mailOk = true;
  h.mailGooit = false;
});

describe("droog: het kanaal per werker vooraf, alleen aantallen", () => {
  it("push (abonnement of iPhone-app), mail (bevestigd adres) of niets; testadres en geblokkeerd tellen niet mee; niets verstuurd of bewaard", async () => {
    zet("w-web");
    h.subs.add("w-web");
    zet("w-iphone");
    h.kv.set("apns:w-iphone", { tokens: ["t1"] });
    zet("w-leeg-apns");
    h.kv.set("apns:w-leeg-apns", { tokens: [] });
    zet("w-mail");
    zet("w-geen", { bevestigd: false });
    zet("w-test", { email: "zf-proef@zekerflex.test" });
    zet("w-weg", { geblokkeerd: true });
    const voor = JSON.stringify([...h.kv.entries()]);
    const t = await meldUitzendBijgewerkt({ verstuur: false, nu: NU });
    expect(t).toMatchObject({ oudeVersie: 7, overgeslagen: 2, alGemeld: 0, teMelden: 5, perKanaal: { push: 2, mail: 2, geen: 1 }, verstuurd: 0, bereikt: 0 });
    expect(h.pushes).toHaveLength(0);
    expect(h.mails).toHaveLength(0);
    expect(JSON.stringify([...h.kv.entries()])).toBe(voor);
  });
});

describe("versturen: push eerst, dan een mail, en alleen markeren als het aankwam", () => {
  it("push bereikt een apparaat: geen mail, markering met kanaal push", async () => {
    zet("w-web");
    h.subs.add("w-web");
    h.pushBereikt.set("w-web", 1);
    const t = await meldUitzendBijgewerkt({ verstuur: true, nu: NU });
    expect(t).toMatchObject({ verstuurdPush: 1, verstuurdMail: 0, verstuurd: 1, bereikt: 1, nietBereikt: 0 });
    expect(h.mails).toHaveLength(0);
    expect(h.kv.get(`${MELDING_PREFIX}w-web`)).toMatchObject({ kanaal: "push" });
  });

  it("push bereikt 0 apparaten (abonnement dood): een mail, markering met kanaal mail en de tijd", async () => {
    zet("w-web");
    h.subs.add("w-web");
    h.pushBereikt.set("w-web", 0);
    const t = await meldUitzendBijgewerkt({ verstuur: true, nu: NU });
    expect(t).toMatchObject({ verstuurdPush: 0, verstuurdMail: 1, verstuurd: 1, nietBereikt: 0 });
    expect(h.pushes).toHaveLength(1);
    expect(h.mails).toHaveLength(1);
    expect(h.mails[0]!.kind).toBe("uitzend-bijgewerkt");
    expect(h.kv.get(`${MELDING_PREFIX}w-web`)).toEqual({ at: new Date(NU).toISOString(), kanaal: "mail" });
  });

  it("geen pushkanaal: meteen de mail (geen push geprobeerd), in de mailtaal van de werker, met de link naar Verificatie en zonder bijlage", async () => {
    zet("pl-1");
    zet("w-nl");
    await meldUitzendBijgewerkt({ verstuur: true, nu: NU });
    expect(h.pushes).toHaveLength(0);
    const pl = h.mails.find((m) => m.to.startsWith("pl-1"))!;
    const nl = h.mails.find((m) => m.to.startsWith("w-nl"))!;
    expect(pl.subject).toBe("Twoja umowa o pracę tymczasową została zaktualizowana");
    expect(nl.subject).toBe("Je uitzendovereenkomst is bijgewerkt");
    for (const m of [pl, nl]) {
      expect(m.text).toContain("https://zf.test/dashboard/verificatie#uitzendovereenkomst");
      expect(m).not.toHaveProperty("attachments");
      // geen contracttekst in de mail
      expect(m.text + m.html).not.toMatch(/Artikel 1|kantoorhoudende|KVK/i);
    }
  });

  it("push 0 én mail mislukt: NIET gemarkeerd, zodat de volgende run het opnieuw probeert; geen tweede poging in dezelfde run", async () => {
    zet("w-web");
    h.subs.add("w-web");
    h.mailOk = false;
    const t = await meldUitzendBijgewerkt({ verstuur: true, nu: NU });
    expect(t).toMatchObject({ verstuurd: 0, nietBereikt: 1 });
    expect(h.mails).toHaveLength(1);
    expect(h.kv.has(`${MELDING_PREFIX}w-web`)).toBe(false);
    // de volgende run probeert het opnieuw (en lukt nu)
    h.mailOk = true;
    const tweede = await meldUitzendBijgewerkt({ verstuur: true, nu: NU });
    expect(tweede).toMatchObject({ verstuurdMail: 1, nietBereikt: 0 });
    expect(h.kv.get(`${MELDING_PREFIX}w-web`)).toMatchObject({ kanaal: "mail" });
  });

  it("een mail die een fout gooit telt als niet bereikt (geen markering) en stopt de run niet", async () => {
    zet("w-a");
    zet("w-b");
    h.mailGooit = true;
    const t = await meldUitzendBijgewerkt({ verstuur: true, nu: NU });
    expect(t).toMatchObject({ verstuurd: 0, nietBereikt: 2 });
    expect(h.mails).toHaveLength(2);
    expect(h.kv.has(`${MELDING_PREFIX}w-a`)).toBe(false);
  });

  it("geen pushkanaal en geen bevestigd adres: niets te sturen, niet gemarkeerd", async () => {
    zet("w-geen", { bevestigd: false });
    const t = await meldUitzendBijgewerkt({ verstuur: true, nu: NU });
    expect(t).toMatchObject({ verstuurd: 0, nietBereikt: 1 });
    expect(h.mails).toHaveLength(0);
    expect(h.kv.has(`${MELDING_PREFIX}w-geen`)).toBe(false);
  });

  it("een gemarkeerde werker krijgt niets meer; een testadres of geblokkeerd account nooit", async () => {
    zet("w-eens");
    zet("w-test", { email: "zf-proef@zekerflex.test" });
    zet("w-weg", { geblokkeerd: true });
    await meldUitzendBijgewerkt({ verstuur: true, nu: NU });
    expect(h.mails.map((m) => m.to)).toEqual(["w-eens@voorbeeld.nl"]);
    h.mails = [];
    const tweede = await meldUitzendBijgewerkt({ verstuur: true, nu: NU });
    expect(tweede).toMatchObject({ alGemeld: 1, teMelden: 0, overgeslagen: 2 });
    expect(h.mails).toHaveLength(0);
  });

  it("hooguit 50 per run: de rest blijft over en komt in een volgende run aan de beurt", async () => {
    for (let i = 0; i < 60; i++) zet(`w${String(i).padStart(2, "0")}`);
    const eerste = await meldUitzendBijgewerkt({ verstuur: true, nu: NU });
    expect(MAX_PER_RUN).toBe(50);
    expect(eerste).toMatchObject({ teMelden: 60, verstuurd: 50, overgebleven: 10 });
    expect(h.mails).toHaveLength(50);
    const tweede = await meldUitzendBijgewerkt({ verstuur: true, nu: NU });
    expect(tweede).toMatchObject({ alGemeld: 50, teMelden: 10, verstuurd: 10, overgebleven: 0 });
    expect(h.mails).toHaveLength(60);
  });
});

describe("de mail", () => {
  it("in vijf talen: onderwerp, tekst met de link, html met lang-attribuut en knop; geen Nederlandse kernzin buiten nl", () => {
    for (const taal of ["nl", "en", "pl", "ro", "uk"] as const) {
      const m = uitzendBijgewerktEmailT("Anna Kowalska", "https://zf.test/", taal);
      expect(m.subject.length, taal).toBeGreaterThan(10);
      expect(m.text, taal).toContain("https://zf.test/dashboard/verificatie#uitzendovereenkomst");
      expect(m.html, taal).toContain(`<html lang="${taal}">`);
      expect(m.html, taal).toContain("Anna");
      if (taal !== "nl") expect(m.text, taal).not.toContain("uitzendovereenkomst is bijgewerkt");
    }
  });

  it("een naam met html-tekens wordt onschadelijk gemaakt", () => {
    const m = uitzendBijgewerktEmailT("<b>Anna</b>", "https://zf.test", "nl");
    expect(m.html).not.toContain("<b>Anna</b>");
  });
});

describe("de route", () => {
  const post = (url: string, token?: string) => meldRoute(new Request(`http://app:3000${url}`, { method: "POST", ...(token ? { headers: { "x-internal-token": token } } : {}) }));

  it("zonder geheim 401; standaard droog met perKanaal in het antwoord; alleen met ?verstuur=1 gaat er iets uit; alleen aantallen", async () => {
    zet("w-web");
    h.subs.add("w-web");
    zet("w-mail");
    expect((await post("/api/internal/agreements/uitzend-v2-melding")).status).toBe(401);
    const droog = await (await post("/api/internal/agreements/uitzend-v2-melding", "geheim")).json();
    expect(droog).toMatchObject({ modus: "droog", teMelden: 2, perKanaal: { push: 1, mail: 1, geen: 0 }, verstuurd: 0 });
    expect(JSON.stringify(droog)).not.toMatch(/@|w-web|w-mail|Anna/);
    expect(h.mails).toHaveLength(0);
    const echt = await (await post("/api/internal/agreements/uitzend-v2-melding?verstuur=1", "geheim")).json();
    expect(echt).toMatchObject({ modus: "verstuurd", verstuurd: 2 });
  });

  it("de wissing van een account neemt de markering mee (AVG) en er wordt geen persoonsgegeven gelogd", () => {
    expect(bron("lib/privacy/user-kv.ts")).toContain('"uitzend-v2-melding:"');
    const s = bron("lib/agreements/uitzend-melding.ts");
    expect(s).not.toMatch(/logger\.\w+\([^)]*(email|fullName|k\.id)/);
  });
});
