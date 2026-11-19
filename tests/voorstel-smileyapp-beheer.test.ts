import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Het beheer van het SmileyApp-voorstel (19 nov 2026): Martijn en de medewerkers
// die hij uitnodigt met naam en e-mailadres, plus de demo-aanvraag op de site.
// Deze test bewaakt de regels (wie mag wat), de uitnodiging (alleen de hash
// bewaard, 14 dagen, een nieuwe maakt de oude ongeldig), de eigen sessie (los
// van Schwarzwald), de controle van een aanvraag met het voorkeursmoment, en in
// de broncode: elke route begint met de poort, en het token komt in geen log.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  jar: new Map<string, string>(),
  mails: [] as { to: string; subject: string; text: string; html?: string; kind?: string }[],
  principal: null as { userId: string; fullName: string; rollen: string[] } | null,
  afgeleverd: true,
}));

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "geheim-voor-de-test-van-minstens-32-tekens", APP_BASE_URL: "https://zekerflex.test" } }));
vi.mock("@/lib/storage/kv", () => {
  const kopie = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const rijen = (prefix: string) => [...h.kv.entries()].filter(([k]) => k.startsWith(prefix));
  return {
    kvGet: async (k: string) => (h.kv.has(k) ? kopie(h.kv.get(k)) : null),
    kvSet: async (k: string, v: unknown) => void h.kv.set(k, kopie(v)),
    kvDelete: async (k: string) => void h.kv.delete(k),
    kvListValues: async (prefix: string) => rijen(prefix).map(([, v]) => kopie(v)),
    kvListEntries: async (prefix: string) => rijen(prefix).map(([key, value]) => ({ key, value: kopie(value) })),
  };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (naam: string) => (h.jar.has(naam) ? { name: naam, value: h.jar.get(naam) } : undefined),
    set: (naam: string, waarde: string) => void h.jar.set(naam, waarde),
    delete: (naam: string) => void h.jar.delete(naam),
  }),
}));
vi.mock("@/lib/auth", () => ({
  getPrincipal: async () => h.principal,
  hasRole: (p: { rollen: string[] }, ...rollen: string[]) => rollen.some((r) => p.rollen.includes(r)),
}));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: { to: string; subject: string; text: string; html?: string; kind?: string }) => {
    h.mails.push(m);
    return { id: "t", delivered: h.afgeleverd, transport: "mailbox" };
  },
}));
// 19 nov 2026 (deel 2): de aanvraagroute telt een demo-aanvraag voor "Cijfers" (Redis). Hier niet: geen verbinding in een test.
vi.mock("@/lib/voorstel/smileyapp-cijfers", () => ({ telDemoAanvraag: async () => undefined, telWeergave: async () => undefined }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => ({ ok: true }), fixedWindow: async () => ({ ok: true }) }));

import { AppError } from "@/lib/errors";
import { BASE, INTERESSES, PAKKETTEN } from "@/lib/voorstel/smileyapp";
import {
  UITNODIGING_DAGEN,
  WACHTWOORD_MIN,
  accountStatus,
  beheerAdres,
  geldigEmail,
  geldigeNaam,
  isUitnodigingToken,
  magTeamBeheren,
  teamActieFout,
  uitnodigingVerlopen,
  type TeamLid,
} from "@/lib/voorstel/smileyapp-account-regels";
import {
  SESSIE_COOKIE,
  alleAccounts,
  beheerderAdressen,
  bekijkUitnodiging,
  blokkeer,
  eisBeheerder,
  eisToegang,
  heeftTeam,
  huidigAccount,
  inloggen,
  leesSessie,
  neemUitnodigingAan,
  nodigUit,
  tekenSessie,
  toegang,
  uitloggen,
  verwijderAccount,
  wijzigRol,
  type Account,
  type Toegang,
} from "@/lib/voorstel/smileyapp-accounts";
import { TIJDEN, aanvraagVerlopen, dagTekst, isVoorkeurDag, telLink, valideerAanvraag, voorkeurDagen, type AanvraagInvoer } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { alleAanvragen, maakAanvraag, verwijderAanvraag, wijzigAanvraag } from "@/lib/voorstel/smileyapp-aanvragen";
import { meldingMail, uitnodigingMail } from "@/lib/voorstel/smileyapp-mail";
import * as schwarzwald from "@/lib/voorstel/schwarzwald-accounts";

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const NU = new Date("2026-11-19T10:00:00+01:00"); // donderdag
const BEHEER = "https://smileyapp.zekerflex.com/beheer";
const KEY = (email: string) => `voorstel-smileyapp:account:${email}`;
const opslag = (email: string) => h.kv.get(KEY(email)) as Account | undefined;
/** Het token uit de laatste uitnodigingsmail. */
const tokenUitMail = () => /[?&]uitnodiging=([A-Za-z0-9_-]+)/.exec(h.mails.filter((m) => m.kind === "smileyapp-uitnodiging").at(-1)?.text ?? "")?.[1] ?? "";
const MARTIJN: Toegang = { naam: "Martijn", email: "martijn@smileyapp.test", rol: "beheerder", via: "smileyapp", id: "martijn@smileyapp.test" };
const PLATFORM: Toegang = { naam: "ZekerFlex-beheer", email: "", rol: "beheerder", via: "zekerflex", id: "zekerflex-u1" };

async function fout(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("er kwam geen fout");
}

/** Een account met wachtwoord: uitnodigen en aannemen. Logt daarna uit. */
async function actief(naam: string, email: string, rol: "beheerder" | "medewerker", wachtwoord = "een-lang-wachtwoord"): Promise<void> {
  await nodigUit({ naam, email, rol, door: "ZekerFlex-beheer", beheer: BEHEER }, NU);
  await neemUitnodigingAan({ token: tokenUitMail(), wachtwoord }, NU);
  await uitloggen();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  h.kv.clear();
  h.jar.clear();
  h.mails.length = 0;
  h.principal = null;
  h.afgeleverd = true;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("team: wie mag wat", () => {
  const lid = (email: string, rol: TeamLid["rol"], o: Partial<TeamLid> = {}): TeamLid => ({ email, rol, heeftWachtwoord: true, geblokkeerd: false, ...o });
  const team = [lid("martijn@x.test", "beheerder"), lid("sanne@x.test", "beheerder"), lid("tom@x.test", "medewerker"), lid("nieuw@x.test", "beheerder", { heeftWachtwoord: false })];
  const ik = { email: "martijn@x.test", rol: "beheerder" as const };

  it("een medewerker ziet het beheer maar mag het team niet beheren", () => {
    expect(magTeamBeheren("beheerder")).toBe(true);
    expect(magTeamBeheren("medewerker")).toBe(false);
    for (const actie of [{ soort: "rol", rol: "beheerder" }, { soort: "blokkeren", geblokkeerd: true }, { soort: "verwijderen" }] as const) {
      expect(teamActieFout({ email: "tom@x.test", rol: "medewerker" }, "sanne@x.test", actie, team)).toBe("Alleen een beheerder kan het team beheren.");
    }
  });

  it("je kunt jezelf niet blokkeren, verwijderen of een andere rol geven", () => {
    for (const actie of [{ soort: "rol", rol: "medewerker" }, { soort: "blokkeren", geblokkeerd: true }, { soort: "verwijderen" }] as const) {
      expect(teamActieFout(ik, "Martijn@X.test ", actie, team)).toContain("eigen account");
    }
    // een ander wel
    expect(teamActieFout(ik, "tom@x.test", { soort: "verwijderen" }, team)).toBeNull();
    expect(teamActieFout(ik, "sanne@x.test", { soort: "rol", rol: "medewerker" }, team)).toBeNull();
    expect(teamActieFout(ik, "weg@x.test", { soort: "verwijderen" }, team)).toContain("bestaat niet");
  });

  it("de laatste beheerder die kan inloggen kan niet weg, geblokkeerd of medewerker worden", () => {
    // de platformbeheerder (zonder eigen account) is het enige geval waarin dit kan spelen
    const platform = { email: "", rol: "beheerder" as const };
    const klein = [lid("martijn@x.test", "beheerder"), lid("tom@x.test", "medewerker"), lid("nieuw@x.test", "beheerder", { heeftWachtwoord: false }), lid("dicht@x.test", "beheerder", { geblokkeerd: true })];
    for (const actie of [{ soort: "rol", rol: "medewerker" }, { soort: "blokkeren", geblokkeerd: true }, { soort: "verwijderen" }] as const) {
      expect(teamActieFout(platform, "martijn@x.test", actie, klein)).toContain("laatste beheerder");
    }
    // deblokkeren of beheerder blijven neemt niemand weg
    expect(teamActieFout(platform, "martijn@x.test", { soort: "rol", rol: "beheerder" }, klein)).toBeNull();
    // een uitnodiging zonder wachtwoord en een geblokkeerde beheerder tellen niet als beheerder: die mogen weg
    expect(teamActieFout(platform, "nieuw@x.test", { soort: "verwijderen" }, klein)).toBeNull();
    expect(teamActieFout(platform, "dicht@x.test", { soort: "verwijderen" }, klein)).toBeNull();
    // met twee beheerders mag er één weg
    expect(teamActieFout(platform, "martijn@x.test", { soort: "verwijderen" }, team)).toBeNull();
  });

  it("status, naam, e-mailadres en token", () => {
    expect(accountStatus({ heeftWachtwoord: false, geblokkeerd: false })).toBe("uitgenodigd");
    expect(accountStatus({ heeftWachtwoord: true, geblokkeerd: false })).toBe("actief");
    expect(accountStatus({ heeftWachtwoord: true, geblokkeerd: true })).toBe("geblokkeerd");
    expect(geldigeNaam("M")).toBe(false);
    expect(geldigeNaam("Jo")).toBe(true);
    expect(geldigeNaam("x".repeat(81))).toBe(false);
    for (const e of ["martijn@smileyapp.nl", " a.b+c@x-y.example "]) expect(geldigEmail(e), e).toBe(true);
    for (const e of ["", "martijn", "a@b", "a b@c.nl", "a@@b.nl"]) expect(geldigEmail(e), e).toBe(false);
    expect(isUitnodigingToken("a".repeat(43))).toBe(true);
    expect(isUitnodigingToken("a".repeat(42))).toBe(false);
    expect(isUitnodigingToken(undefined)).toBe(false);
  });

  it("de link in de mail: het subdomein als het verzoek daar binnenkwam, anders de hoofdsite; nooit de host uit het verzoek zelf", () => {
    const appBasis = "https://zekerflex.com/";
    expect(beheerAdres({ host: "smileyapp.zekerflex.com", voorstelKop: null, appBasis })).toBe("https://smileyapp.zekerflex.com/beheer");
    expect(beheerAdres({ host: "app:3000", voorstelKop: "smileyapp", appBasis })).toBe("https://smileyapp.zekerflex.com/beheer");
    expect(beheerAdres({ host: "zekerflex.com", voorstelKop: null, appBasis })).toBe(`https://zekerflex.com${BASE}/beheer`);
    // een vervalste Host-kop komt niet in de link
    expect(beheerAdres({ host: "evil.example", voorstelKop: null, appBasis })).toBe(`https://zekerflex.com${BASE}/beheer`);
    expect(beheerAdres({ host: "smileyapp.zekerflex.com.evil.example", voorstelKop: "schwarzwald", appBasis })).toBe(`https://zekerflex.com${BASE}/beheer`);
  });
});

describe("uitnodiging", () => {
  it("alleen de hash wordt bewaard; het token staat alleen in de mail", async () => {
    const { account, verstuurd } = await nodigUit({ naam: " Sanne de Vries ", email: " Sanne@SmileyApp.test ", rol: "medewerker", door: "Martijn", beheer: BEHEER }, NU);
    expect(verstuurd).toBe(true);
    expect(account).toMatchObject({ email: "sanne@smileyapp.test", naam: "Sanne de Vries", rol: "medewerker", status: "uitgenodigd", uitgenodigdDoor: "Martijn" });
    // het scherm krijgt nooit een hash
    expect(JSON.stringify(account)).not.toMatch(/hash|scrypt/);
    const token = tokenUitMail();
    expect(isUitnodigingToken(token)).toBe(true);
    const bewaard = opslag("sanne@smileyapp.test");
    expect(bewaard?.uitnodiging?.hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(bewaard?.wachtwoord).toBeUndefined();
    expect(JSON.stringify([...h.kv.values()])).not.toContain(token);
    // de mail: aan het juiste adres, met de naam van wie uitnodigt, en de link naar het beheer
    const mail = h.mails[0];
    expect(mail?.to).toBe("sanne@smileyapp.test");
    expect(mail?.subject).toBe("Martijn nodigt je uit voor het beheer van SmileyApp");
    expect(mail?.kind).toBe("smileyapp-uitnodiging");
    expect(mail?.text).toContain(`${BEHEER}?uitnodiging=${token}`);
    expect(mail?.html).toContain(`${BEHEER}?uitnodiging=${token}`);
    expect(await bekijkUitnodiging(token, NU)).toEqual({ naam: "Sanne de Vries", email: "sanne@smileyapp.test" });
  });

  it("verloopt na 14 dagen", async () => {
    await nodigUit({ naam: "Sanne", email: "sanne@smileyapp.test", rol: "medewerker", door: "Martijn", beheer: BEHEER }, NU);
    const token = tokenUitMail();
    expect(UITNODIGING_DAGEN).toBe(14);
    expect(opslag("sanne@smileyapp.test")?.uitnodiging?.tot).toBe("2026-12-03T09:00:00.000Z");
    const net = new Date("2026-12-03T09:59:59+01:00");
    const teLaat = new Date("2026-12-03T10:00:00+01:00");
    expect(uitnodigingVerlopen("2026-12-03T09:00:00.000Z", net)).toBe(false);
    expect(uitnodigingVerlopen("2026-12-03T09:00:00.000Z", teLaat)).toBe(true);
    expect(uitnodigingVerlopen("geen datum", NU)).toBe(true);
    expect(await bekijkUitnodiging(token, net)).not.toBeNull();
    expect(await bekijkUitnodiging(token, teLaat)).toBeNull();
    const e = await fout(neemUitnodigingAan({ token, wachtwoord: "een-lang-wachtwoord" }, teLaat));
    expect(e.status).toBe(422);
    expect(e.message).toContain("werkt niet meer");
    expect(opslag("sanne@smileyapp.test")?.wachtwoord).toBeUndefined();
  });

  it("een tweede uitnodiging maakt de eerste ongeldig", async () => {
    await nodigUit({ naam: "Sanne", email: "sanne@smileyapp.test", rol: "medewerker", door: "Martijn", beheer: BEHEER }, NU);
    const eerste = tokenUitMail();
    await nodigUit({ naam: "Sanne", email: "sanne@smileyapp.test", rol: "beheerder", door: "Martijn", beheer: BEHEER }, NU);
    const tweede = tokenUitMail();
    expect(tweede).not.toBe(eerste);
    expect(await bekijkUitnodiging(eerste, NU)).toBeNull();
    expect((await fout(neemUitnodigingAan({ token: eerste, wachtwoord: "een-lang-wachtwoord" }, NU))).message).toContain("werkt niet meer");
    expect(await bekijkUitnodiging(tweede, NU)).toEqual({ naam: "Sanne", email: "sanne@smileyapp.test" });
    expect((await alleAccounts()).map((a) => [a.email, a.rol])).toEqual([["sanne@smileyapp.test", "beheerder"]]);
  });

  it("aannemen zet het wachtwoord, wist de uitnodiging en logt in; daarna werkt de link niet meer", async () => {
    await nodigUit({ naam: "Sanne", email: "sanne@smileyapp.test", rol: "medewerker", door: "Martijn", beheer: BEHEER }, NU);
    const token = tokenUitMail();
    expect(WACHTWOORD_MIN).toBe(10);
    expect((await fout(neemUitnodigingAan({ token, wachtwoord: "te-kort-9" }, NU))).message).toContain("minimaal 10 tekens");
    expect(await heeftTeam()).toBe(false);
    const account = await neemUitnodigingAan({ token, wachtwoord: "een-lang-wachtwoord" }, NU);
    expect(account.status).toBe("actief");
    const bewaard = opslag("sanne@smileyapp.test");
    expect(bewaard?.wachtwoord).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(bewaard?.uitnodiging).toBeUndefined();
    expect(JSON.stringify(bewaard)).not.toContain("een-lang-wachtwoord");
    expect((await huidigAccount())?.email).toBe("sanne@smileyapp.test");
    expect(await heeftTeam()).toBe(true);
    expect(await bekijkUitnodiging(token, NU)).toBeNull();
    expect((await fout(neemUitnodigingAan({ token, wachtwoord: "een-ander-wachtwoord" }, NU))).message).toContain("werkt niet meer");
    // wie al een wachtwoord heeft, krijgt geen nieuwe uitnodiging (anders neemt een beheerder een account over)
    const al = await fout(nodigUit({ naam: "Sanne", email: "SANNE@smileyapp.test", rol: "beheerder", door: "Martijn", beheer: BEHEER }, NU));
    expect(al.message).toBe("Sanne heeft al een account.");
    expect(opslag("sanne@smileyapp.test")?.wachtwoord).toBe(bewaard?.wachtwoord);
  });

  it("weigert een naam of adres dat niet klopt, en meldt een mail die niet aankwam", async () => {
    expect((await fout(nodigUit({ naam: "S", email: "sanne@smileyapp.test", rol: "medewerker", door: "Martijn", beheer: BEHEER }, NU))).status).toBe(422);
    expect((await fout(nodigUit({ naam: "Sanne", email: "geen-adres", rol: "medewerker", door: "Martijn", beheer: BEHEER }, NU))).status).toBe(422);
    expect(h.kv.size).toBe(0);
    h.afgeleverd = false;
    expect((await nodigUit({ naam: "Sanne", email: "sanne@smileyapp.test", rol: "medewerker", door: "Martijn", beheer: BEHEER }, NU)).verstuurd).toBe(false);
  });

  it("de mail: de afgesproken tekst, in hun kleuren, zonder plaatjes van buiten", () => {
    const m = uitnodigingMail({ naam: "Sanne", email: "sanne@smileyapp.test", door: "Martijn", link: `${BEHEER}?uitnodiging=TOKEN` });
    expect(m.text).toBe(
      `Hallo Sanne,\n\nMartijn heeft je toegevoegd aan het beheer van de SmileyApp-website. Kies een wachtwoord via deze link:\n${BEHEER}?uitnodiging=TOKEN\n\nDe link werkt 14 dagen. Ken je Martijn niet, dan kun je deze mail weggooien.`,
    );
    expect(m.html).toContain("Hallo Sanne, Martijn heeft je toegevoegd aan het beheer van de SmileyApp-website. Klik op de knop om een wachtwoord te kiezen.");
    expect(m.html).toContain("De link werkt 14 dagen. Ken je Martijn niet, dan kun je deze mail weggooien.");
    expect(m.html).toContain("#0E2A20");
    expect(m.html).toContain("#FDD11A");
    expect(m.html).not.toMatch(/<img|src=|url\(|<script|<link/i);
    // een naam met html of een regeleinde breekt de mail of het onderwerp niet
    const gek = uitnodigingMail({ naam: "<b>Sanne</b>", email: "s@x.test", door: "Martijn\r\nBcc: iemand@x.test", link: BEHEER });
    expect(gek.subject).not.toMatch(/[\r\n]/);
    expect(gek.html).toContain("&lt;b&gt;Sanne&lt;/b&gt;");
    expect(gek.html).not.toContain("<b>Sanne</b>");
  });
});

describe("inloggen en de sessie", () => {
  it("een fout wachtwoord en een onbekend adres geven dezelfde melding", async () => {
    await actief("Martijn", "martijn@smileyapp.test", "beheerder");
    const a = await fout(inloggen("martijn@smileyapp.test", "fout-wachtwoord", NU));
    const b = await fout(inloggen("niemand@smileyapp.test", "fout-wachtwoord", NU));
    expect([a.status, a.message]).toEqual([422, "E-mailadres of wachtwoord klopt niet."]);
    expect([b.status, b.message]).toEqual([a.status, a.message]);
    // ook een uitnodiging zonder wachtwoord verraadt niet dat het adres bestaat
    await nodigUit({ naam: "Sanne", email: "sanne@smileyapp.test", rol: "medewerker", door: "Martijn", beheer: BEHEER }, NU);
    expect((await fout(inloggen("sanne@smileyapp.test", "", NU))).message).toBe(a.message);
    expect(await huidigAccount()).toBeNull();
    expect((await inloggen(" Martijn@SmileyApp.test ", "een-lang-wachtwoord", NU)).rol).toBe("beheerder");
    expect((await huidigAccount())?.naam).toBe("Martijn");
    await uitloggen();
    expect(await huidigAccount()).toBeNull();
  });

  it("de sessie is 14 dagen geldig en verloopt daarna", () => {
    const token = tekenSessie({ email: "martijn@smileyapp.test", aangemaakt: "2026-11-19T09:00:00.000Z" }, NU.getTime());
    expect(leesSessie(token, NU.getTime())).toEqual({ email: "martijn@smileyapp.test", aangemaakt: "2026-11-19T09:00:00.000Z" });
    expect(leesSessie(token, new Date("2026-12-03T09:59:00+01:00").getTime())).not.toBeNull();
    expect(leesSessie(token, new Date("2026-12-03T10:00:00+01:00").getTime())).toBeNull();
    // geknoeid met de inhoud: de handtekening klopt niet meer
    const [inhoud = "", handtekening = ""] = token.split(".");
    const vals = Buffer.from(JSON.stringify({ e: "iemand@anders.test", a: "x", x: Date.now() + 1e9 })).toString("base64url");
    expect(leesSessie(`${vals}.${handtekening}`, NU.getTime())).toBeNull();
    expect(leesSessie(`${inhoud}.`, NU.getTime())).toBeNull();
    expect(leesSessie(undefined)).toBeNull();
    expect(lees("lib/voorstel/smileyapp-accounts.ts")).toContain("const SESSIE_DAGEN = 14;");
    expect(lees("lib/voorstel/smileyapp-accounts.ts")).toMatch(/httpOnly: true, sameSite: "lax", secure: process\.env\.NODE_ENV === "production", path: "\/"/);
  });

  it("een Schwarzwald-sessie geldt hier niet, en omgekeerd (eigen cookie en eigen label)", async () => {
    await actief("Martijn", "martijn@smileyapp.test", "beheerder");
    // hetzelfde adres bestaat ook als Schwarzwald-beheerder
    h.kv.set("voorstel-schwarzwald:account:martijn@smileyapp.test", { email: "martijn@smileyapp.test", naam: "Martijn", telefoon: "", rol: "beheerder", geblokkeerd: false, aangemaakt: "2026-11-19T09:00:00.000Z", hash: "" });
    const schw = schwarzwald.sessieCookie("martijn@smileyapp.test");
    expect(schw.name).toBe("schw_sessie");
    expect(SESSIE_COOKIE).toBe("smiley_sessie");
    // hun token in onze cookie: geen sessie
    expect(leesSessie(schw.value)).toBeNull();
    h.jar.set(SESSIE_COOKIE, schw.value);
    expect(await huidigAccount()).toBeNull();
    expect(await toegang()).toBeNull();
    // ons token in hun cookie: ook geen sessie
    h.jar.clear();
    await inloggen("martijn@smileyapp.test", "een-lang-wachtwoord", NU);
    const ons = h.jar.get(SESSIE_COOKIE) ?? "";
    expect(ons).not.toBe("");
    h.jar.clear();
    h.jar.set(schwarzwald.SESSIE_COOKIE, ons);
    expect(await schwarzwald.huidigAccount()).toBeNull();
    // ter controle: met hun eigen token zijn ze wel ingelogd
    h.jar.set(schwarzwald.SESSIE_COOKIE, schw.value);
    expect((await schwarzwald.huidigAccount())?.email).toBe("martijn@smileyapp.test");
    expect(lees("lib/voorstel/smileyapp-accounts.ts")).toContain('.update("voorstel-smileyapp-sessie")');
    expect(lees("lib/voorstel/schwarzwald-accounts.ts")).toContain('.update("voorstel-schwarzwald-sessie")');
  });

  it("geblokkeerd of verwijderd: de sessie is meteen weg, ook als het adres opnieuw wordt uitgenodigd", async () => {
    await actief("Martijn", "martijn@smileyapp.test", "beheerder");
    await actief("Sanne", "sanne@smileyapp.test", "medewerker");
    await inloggen("sanne@smileyapp.test", "een-lang-wachtwoord", NU);
    expect((await toegang())?.rol).toBe("medewerker");
    await blokkeer(MARTIJN, "sanne@smileyapp.test", true);
    expect(await huidigAccount()).toBeNull();
    expect((await fout(inloggen("sanne@smileyapp.test", "een-lang-wachtwoord", NU))).message).toContain("geblokkeerd");
    // een geblokkeerde uitnodiging (nog zonder wachtwoord) krijgt geen nieuwe link: eerst deblokkeren
    await nodigUit({ naam: "Tom", email: "tom@smileyapp.test", rol: "medewerker", door: "Martijn", beheer: BEHEER }, NU);
    const tomToken = tokenUitMail();
    await blokkeer(MARTIJN, "tom@smileyapp.test", true);
    expect(await bekijkUitnodiging(tomToken, NU)).toBeNull();
    expect((await fout(nodigUit({ naam: "Tom", email: "tom@smileyapp.test", rol: "medewerker", door: "Martijn", beheer: BEHEER }, NU))).message).toContain("geblokkeerd");
    await blokkeer(MARTIJN, "sanne@smileyapp.test", false);
    expect((await huidigAccount())?.email).toBe("sanne@smileyapp.test");
    // verwijderen en later opnieuw aanmaken: de oude cookie hoort niet bij het nieuwe account
    await verwijderAccount(MARTIJN, "sanne@smileyapp.test");
    expect(await huidigAccount()).toBeNull();
    const later = new Date("2026-11-20T10:00:00+01:00");
    const oud = h.jar.get(SESSIE_COOKIE) ?? "";
    await nodigUit({ naam: "Sanne", email: "sanne@smileyapp.test", rol: "medewerker", door: "Martijn", beheer: BEHEER }, later);
    await neemUitnodigingAan({ token: tokenUitMail(), wachtwoord: "een-nieuw-wachtwoord" }, later);
    h.jar.set(SESSIE_COOKIE, oud);
    expect(await huidigAccount()).toBeNull();
  });

  it("toegang tot het beheer: een SmileyApp-account, of een platformbeheerder van ZekerFlex als vangnet", async () => {
    expect(await toegang()).toBeNull();
    const e = await fout(eisToegang());
    // niet ingelogd = 401, nooit 403 (CrowdSec)
    expect([e.status, e.code]).toEqual([401, "UNAUTHENTICATED"]);
    h.principal = { userId: "u9", fullName: "Een werker", rollen: ["FREELANCER"] };
    expect(await toegang()).toBeNull();
    h.principal = { userId: "u1", fullName: "Eigenaar ZekerFlex", rollen: ["PLATFORM_ADMIN"] };
    expect(await toegang()).toEqual({ naam: "Eigenaar ZekerFlex", email: "", rol: "beheerder", via: "zekerflex", id: "zekerflex-u1" });
    expect((await eisBeheerder()).via).toBe("zekerflex");
    // een medewerker komt het beheer in, maar krijgt 423 met een eigen code bij het team
    h.principal = null;
    await actief("Sanne", "sanne@smileyapp.test", "medewerker");
    await inloggen("sanne@smileyapp.test", "een-lang-wachtwoord", NU);
    expect((await eisToegang()).rol).toBe("medewerker");
    const m = await fout(eisBeheerder());
    expect([m.status, m.code]).toEqual([423, "ALLEEN_BEHEERDER"]);
  });

  it("team beheren op de server: dezelfde regels, en de melding gaat alleen naar beheerders die kunnen inloggen", async () => {
    await actief("Martijn", "martijn@smileyapp.test", "beheerder");
    await actief("Sanne", "sanne@smileyapp.test", "medewerker");
    await nodigUit({ naam: "Nog Niet", email: "nogniet@smileyapp.test", rol: "beheerder", door: "Martijn", beheer: BEHEER }, NU);
    expect(await beheerderAdressen()).toEqual(["martijn@smileyapp.test"]);
    // jezelf niet
    expect((await fout(wijzigRol(MARTIJN, "martijn@smileyapp.test", "medewerker"))).message).toContain("eigen account");
    expect((await fout(verwijderAccount(MARTIJN, "martijn@smileyapp.test"))).status).toBe(422);
    // de platformbeheerder kan de laatste beheerder niet weghalen
    expect((await fout(verwijderAccount(PLATFORM, "martijn@smileyapp.test"))).message).toContain("laatste beheerder");
    expect((await fout(blokkeer(PLATFORM, "martijn@smileyapp.test", true))).message).toContain("laatste beheerder");
    // een medewerker mag niets: 423
    const sanne: Toegang = { naam: "Sanne", email: "sanne@smileyapp.test", rol: "medewerker", via: "smileyapp", id: "sanne@smileyapp.test" };
    expect((await fout(wijzigRol(sanne, "martijn@smileyapp.test", "medewerker"))).status).toBe(423);
    // een beheerder maakt Sanne beheerder: nu krijgt zij ook de melding, en mag Martijn weg
    expect((await wijzigRol(MARTIJN, "sanne@smileyapp.test", "beheerder")).rol).toBe("beheerder");
    expect((await beheerderAdressen()).sort()).toEqual(["martijn@smileyapp.test", "sanne@smileyapp.test"]);
    await verwijderAccount(PLATFORM, "martijn@smileyapp.test");
    expect(opslag("martijn@smileyapp.test")).toBeUndefined();
  });
});

describe("aanvraag: controle en voorkeursmoment", () => {
  const basis: AanvraagInvoer = { soort: "demo", naam: "Jan Jansen", bedrijf: "Bakkerij Jansen", email: "Jan@Bakkerij.test", toestemming: true };

  it("de dagen: werkdagen vanaf morgen tot en met zes weken vooruit, in Nederlandse tijd", () => {
    const dagen = voorkeurDagen(NU);
    expect(dagen[0]).toBe("2026-11-20"); // morgen, vrijdag
    expect(dagen[1]).toBe("2026-11-23"); // het weekend wordt overgeslagen
    expect(dagen.at(-1)).toBe("2026-12-31"); // dag 42
    expect(dagen).toHaveLength(30);
    expect(isVoorkeurDag("2026-11-19", NU)).toBe(false); // vandaag
    expect(isVoorkeurDag("2026-11-21", NU)).toBe(false); // zaterdag
    expect(isVoorkeurDag("2026-11-22", NU)).toBe(false); // zondag
    expect(isVoorkeurDag("2027-01-01", NU)).toBe(false); // dag 43
    expect(isVoorkeurDag("2026-11-18", NU)).toBe(false);
    expect(isVoorkeurDag("23-11-2026", NU)).toBe(false);
    expect(isVoorkeurDag("2026-13-45", NU)).toBe(false);
    // rond middernacht telt de Nederlandse dag, niet die van de server (UTC)
    const netNa = new Date("2026-11-20T00:30:00+01:00"); // in UTC nog 19 nov
    expect(isVoorkeurDag("2026-11-20", netNa)).toBe(false);
    expect(voorkeurDagen(netNa)[0]).toBe("2026-11-23");
    const netVoor = new Date("2026-11-19T23:30:00+01:00");
    expect(voorkeurDagen(netVoor)[0]).toBe("2026-11-20");
    expect(dagTekst("2026-11-23")).toBe("maandag 23 november");
  });

  it("de tijden: 09:00 tot 17:00 in halve uren", () => {
    expect(TIJDEN[0]).toBe("09:00");
    expect(TIJDEN[1]).toBe("09:30");
    expect(TIJDEN.at(-1)).toBe("16:30");
    expect(TIJDEN).toHaveLength(16);
  });

  it("weekend en buiten kantoortijd worden geweigerd", () => {
    const met = (dag: string, tijd: string) => valideerAanvraag({ ...basis, telefoon: "06 12345678", dag, tijd }, NU);
    expect(met("2026-11-23", "10:30")).toMatchObject({ ok: true, waarde: { voorkeur: { dag: "2026-11-23", tijd: "10:30" } } });
    expect(met("2026-11-21", "10:30")).toMatchObject({ ok: false, veld: "dag" });
    expect(met("2026-11-22", "10:30")).toMatchObject({ ok: false, veld: "dag" });
    expect(met("2026-11-19", "10:30")).toMatchObject({ ok: false, veld: "dag" });
    for (const tijd of ["08:30", "17:00", "18:00", "10:15", "9:00"]) expect(met("2026-11-23", tijd), tijd).toMatchObject({ ok: false, veld: "tijd" });
    // half ingevuld
    expect(met("2026-11-23", "")).toMatchObject({ ok: false, veld: "tijd" });
    expect(met("", "10:30")).toMatchObject({ ok: false, veld: "dag" });
    // wie gebeld wil worden, geeft een nummer
    expect(valideerAanvraag({ ...basis, dag: "2026-11-23", tijd: "10:30" }, NU)).toMatchObject({ ok: false, veld: "telefoon" });
  });

  it("de velden: naam, bedrijf, e-mailadres, telefoon, pakket en toestemming", () => {
    const goed = valideerAanvraag({ ...basis, telefoon: " +31 6 1234 5678 ", pakket: "iso", bericht: "  Graag een demo.  " }, NU);
    expect(goed).toEqual({ ok: true, waarde: { soort: "demo", naam: "Jan Jansen", bedrijf: "Bakkerij Jansen", email: "jan@bakkerij.test", telefoon: "+31 6 1234 5678", bericht: "Graag een demo.", pakket: "iso" } });
    // lege velden komen niet als lege tekst in de opslag
    expect(valideerAanvraag({ ...basis, telefoon: "", pakket: "", bericht: " ", dag: "", tijd: "" }, NU)).toEqual({ ok: true, waarde: { soort: "demo", naam: "Jan Jansen", bedrijf: "Bakkerij Jansen", email: "jan@bakkerij.test" } });
    expect(valideerAanvraag({ ...basis, naam: "J" }, NU)).toMatchObject({ ok: false, veld: "naam" });
    expect(valideerAanvraag({ ...basis, bedrijf: "" }, NU)).toMatchObject({ ok: false, veld: "bedrijf" });
    expect(valideerAanvraag({ ...basis, email: "jan@" }, NU)).toMatchObject({ ok: false, veld: "email" });
    expect(valideerAanvraag({ ...basis, telefoon: "bel mij" }, NU)).toMatchObject({ ok: false, veld: "telefoon" });
    expect(valideerAanvraag({ ...basis, pakket: "constructor" }, NU)).toMatchObject({ ok: false, veld: "pakket" });
    expect(valideerAanvraag({ ...basis, bericht: "x".repeat(2001) }, NU)).toMatchObject({ ok: false, veld: "bericht" });
    expect(valideerAanvraag({ ...basis, toestemming: false }, NU)).toMatchObject({ ok: false, veld: "toestemming" });
    expect(valideerAanvraag({ ...basis, soort: "anders" }, NU)).toMatchObject({ ok: false, veld: "soort" });
    for (const p of PAKKETTEN) expect(valideerAanvraag({ ...basis, pakket: p.id }, NU), p.id).toMatchObject({ ok: true, waarde: { pakket: p.id } });
    expect(telLink("+31 (0)6-1234 5678")).toBe("tel:+310612345678");
  });

  it("partner: interesses uit de lijst, geen pakket of belmoment", () => {
    const p = valideerAanvraag({ ...basis, soort: "partner", interesses: ["Partnerprogramma", "Partnerprogramma", "Anders"], pakket: "iso", dag: "2026-11-21", tijd: "03:00" }, NU);
    expect(p).toEqual({ ok: true, waarde: { soort: "partner", naam: "Jan Jansen", bedrijf: "Bakkerij Jansen", email: "jan@bakkerij.test", interesses: ["Partnerprogramma", "Anders"] } });
    expect(valideerAanvraag({ ...basis, soort: "partner", interesses: ["Iets anders"] }, NU)).toMatchObject({ ok: false, veld: "interesses" });
    expect(INTERESSES).toContain("Partnerprogramma");
  });

  it("bewaren: status en notitie wijzigen, verwijderen, en na 12 maanden vanzelf weg", async () => {
    const controle = valideerAanvraag({ ...basis, telefoon: "0612345678", dag: "2026-11-23", tijd: "10:30" }, NU);
    if (!controle.ok) throw new Error(controle.fout);
    const a = await maakAanvraag(controle.waarde, NU);
    expect(a).toMatchObject({ status: "nieuw", aangemaakt: "2026-11-19T09:00:00.000Z", gewijzigd: "2026-11-19T09:00:00.000Z" });
    expect(a.id).toMatch(/^[a-f0-9]{16}$/);
    expect([...h.kv.keys()]).toEqual([`voorstel-smileyapp:aanvraag:${a.id}`]);

    const later = new Date("2026-12-01T12:00:00+01:00");
    const b = await wijzigAanvraag(a.id, { status: "gebeld", notitie: "  Belt vrijdag terug.  " }, "Sanne", later);
    expect(b).toMatchObject({ status: "gebeld", notitie: "Belt vrijdag terug.", behandeldDoor: "Sanne", gewijzigd: "2026-12-01T11:00:00.000Z", aangemaakt: a.aangemaakt });
    // alleen de status: de notitie blijft; een lege notitie haalt hem weg
    expect((await wijzigAanvraag(a.id, { status: "afspraak" }, "Sanne", later)).notitie).toBe("Belt vrijdag terug.");
    expect((await wijzigAanvraag(a.id, { notitie: " " }, "Sanne", later)).notitie).toBeUndefined();
    expect((await fout(wijzigAanvraag("0000000000000000", { status: "klant" }, "Sanne", later))).status).toBe(404);
    expect((await fout(wijzigAanvraag("../account:x", { status: "klant" }, "Sanne", later))).status).toBe(404);

    // twaalf maanden na de laatste wijziging (1 dec 2026 12:00): net niet, en dan wel
    expect(aanvraagVerlopen("2026-12-01T11:00:00.000Z", new Date("2027-12-01T11:59:59+01:00"))).toBe(false);
    expect(aanvraagVerlopen("2026-12-01T11:00:00.000Z", new Date("2027-12-01T12:00:00+01:00"))).toBe(true);
    expect(aanvraagVerlopen("geen datum", NU)).toBe(true);
    expect(await alleAanvragen(new Date("2027-11-30T12:00:00+01:00"))).toHaveLength(1);
    expect(h.kv.size).toBe(1);
    expect(await alleAanvragen(new Date("2027-12-02T12:00:00+01:00"))).toEqual([]);
    expect(h.kv.size).toBe(0);

    const c = await maakAanvraag(controle.waarde, NU);
    await verwijderAanvraag(c.id);
    expect(h.kv.size).toBe(0);
    expect((await fout(verwijderAanvraag(c.id))).status).toBe(404);
  });

  it("de melding aan een beheerder noemt alleen het bedrijf, niet de gegevens van de aanvrager", () => {
    const m = meldingMail({ to: "martijn@smileyapp.test", soort: "demo", bedrijf: "Bakkerij Jansen", beheer: BEHEER });
    expect(m.subject).toBe("Nieuwe demo-aanvraag van Bakkerij Jansen");
    expect(m.kind).toBe("smileyapp-melding");
    expect(m.text).toContain(`${BEHEER}#demo`);
    expect(meldingMail({ to: "x@x.test", soort: "partner", bedrijf: "Events BV", beheer: BEHEER }).subject).toBe("Nieuwe partner-aanmelding van Events BV");
    expect(meldingMail({ to: "x@x.test", soort: "partner", bedrijf: "Events BV", beheer: BEHEER }).text).toContain(`${BEHEER}#partners`);
    // de functie krijgt de naam, het adres en het nummer van de aanvrager niet eens mee
    expect(lees("lib/voorstel/smileyapp-mail.ts")).toMatch(/export function meldingMail\(o: \{ to: string; soort: "demo" \| "partner"; bedrijf: string; beheer: string \}\)/);
    expect(lees("app/api/voorstel/smileyapp/aanvraag/route.ts")).toContain("stuurMelding({ soort: aanvraag.soort, bedrijf: aanvraag.bedrijf, beheer, ontvangers })");
  });
});

describe("de aanvraagroute", () => {
  const stuur = async (body: unknown, koppen: Record<string, string> = {}) => {
    const { POST } = await import("@/app/api/voorstel/smileyapp/aanvraag/route");
    const res = await POST(
      new Request("http://app:3000/api/voorstel/smileyapp/aanvraag", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-host": "smileyapp.zekerflex.com", origin: "https://smileyapp.zekerflex.com", ...koppen },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
    return { status: res.status, json: (await res.json()) as { ok?: boolean; error?: { message?: string; details?: { veld?: string } } } };
  };
  const goed = { soort: "demo", naam: "Jan Jansen", bedrijf: "Bakkerij Jansen", email: "jan@bakkerij.test", telefoon: "0612345678", pakket: "basis", dag: "2026-11-23", tijd: "10:30", bericht: "", toestemming: true, lokveld: "" };
  const aanvragen = () => [...h.kv.keys()].filter((k) => k.startsWith("voorstel-smileyapp:aanvraag:"));

  it("bewaart een goede aanvraag en meldt hem aan de beheerders, zonder gegevens van de aanvrager", async () => {
    await actief("Martijn", "martijn@smileyapp.test", "beheerder");
    await actief("Sanne", "sanne@smileyapp.test", "medewerker");
    h.mails.length = 0;
    const r = await stuur(goed);
    expect(r).toEqual({ status: 200, json: { ok: true } });
    expect(aanvragen()).toHaveLength(1);
    await vi.waitFor(() => expect(h.mails).toHaveLength(1));
    const mail = h.mails[0];
    expect(mail?.to).toBe("martijn@smileyapp.test");
    expect(mail?.subject).toBe("Nieuwe demo-aanvraag van Bakkerij Jansen");
    // de link wijst naar het subdomein waar het verzoek binnenkwam
    expect(mail?.text).toContain("https://smileyapp.zekerflex.com/beheer#demo");
    for (const geheim of ["Jan Jansen", "jan@bakkerij.test", "0612345678"]) expect(`${mail?.text} ${mail?.html}`).not.toContain(geheim);
  });

  it("het lokveld: een robot krijgt 'gelukt', maar er wordt niets bewaard of gemaild", async () => {
    await actief("Martijn", "martijn@smileyapp.test", "beheerder");
    h.mails.length = 0;
    expect(await stuur({ ...goed, lokveld: "https://spam.example" })).toEqual({ status: 200, json: { ok: true } });
    expect(aanvragen()).toHaveLength(0);
    expect(h.mails).toHaveLength(0);
  });

  it("weigert een andere website, geen JSON, kapotte JSON en foute gegevens; zegt welk veld", async () => {
    expect((await stuur(goed, { origin: "https://evil.example" })).status).toBe(403);
    expect((await stuur(goed, { "content-type": "text/plain" })).status).toBe(422);
    expect((await stuur("{geen json")).status).toBe(422);
    expect((await stuur({ ...goed, toestemming: "ja" })).status).toBe(422);
    const weekend = await stuur({ ...goed, dag: "2026-11-21" });
    expect([weekend.status, weekend.json.error?.details?.veld]).toEqual([422, "dag"]);
    const zonder = await stuur({ ...goed, toestemming: false });
    expect([zonder.status, zonder.json.error?.details?.veld]).toEqual([422, "toestemming"]);
    expect(aanvragen()).toHaveLength(0);
    // ook vanaf zekerflex.com, achter Caddy
    expect((await stuur(goed, { origin: "https://zekerflex.com", "x-forwarded-host": "zekerflex.com" })).status).toBe(200);
    expect(aanvragen()).toHaveLength(1);
  });
});

describe("bronbewakers", () => {
  const routes = (map: string): string[] =>
    readdirSync(path.join(ROOT, map)).flatMap((naam) => {
      const rel = `${map}/${naam}`;
      return statSync(path.join(ROOT, rel)).isDirectory() ? routes(rel) : naam === "route.ts" ? [rel] : [];
    });
  const ROUTES = routes("app/api/voorstel/smileyapp");
  const BEHEER_ROUTES = ROUTES.filter((r) => r.includes("/beheer/"));
  /** De losse handlers van een routebestand: de tekst van elke `export async function …`. */
  const handlers = (s: string) => s.split(/\nexport async function /).slice(1);

  it("de scan vindt de routes", () => {
    expect(ROUTES.sort()).toEqual([
      "app/api/voorstel/smileyapp/aanvraag/route.ts",
      "app/api/voorstel/smileyapp/account/route.ts",
      // deel 6a (19 nov 2026): de agenda voor demo-afspraken
      "app/api/voorstel/smileyapp/beheer/agenda/route.ts",
      "app/api/voorstel/smileyapp/beheer/chat/route.ts",
      // deel 2 (19 nov 2026): blog, pakketten en cijfers (inhoud), de QR-code als bestand (qr) en de paginateller (tel)
      "app/api/voorstel/smileyapp/beheer/inhoud/route.ts",
      "app/api/voorstel/smileyapp/beheer/qr/route.ts",
      "app/api/voorstel/smileyapp/beheer/route.ts",
      "app/api/voorstel/smileyapp/beheer/team/route.ts",
      "app/api/voorstel/smileyapp/chat/[id]/route.ts",
      "app/api/voorstel/smileyapp/chat/route.ts",
      "app/api/voorstel/smileyapp/tel/route.ts",
    ]);
  });

  it("de poort: eerst de herkomst (achter Caddy), dan de limiet per IP, en nooit request.url alleen", () => {
    const p = lees("lib/voorstel/smileyapp-poort.ts");
    expect(p).toContain("zelfdeHerkomst(request.headers, request.url)");
    expect(p).toMatch(/enforceRateLimit\(\{ name: "smileyapp-ip", identifier: ip, limit: 120, windowSeconds: 600 \}\)/);
    expect(p.indexOf("zelfdeHerkomst(")).toBeLessThan(p.indexOf("await enforceRateLimit"));
    expect(p).not.toMatch(/new URL\(request\.url\)/);
  });

  it("elke route heeft een limiet, en leest een body pas na de herkomstcontrole en de limiet, altijd begrensd", () => {
    for (const r of ROUTES) {
      const s = lees(r);
      expect(s, `${r}: geen limiet`).toMatch(/smileyPoort\(request|enforceRateLimit\(|fixedWindow\(/);
      // nooit een onbegrensde body
      expect(s, r).not.toMatch(/request\.(json|text|formData|arrayBuffer|blob)\(/);
      for (const hnd of handlers(s).length ? handlers(s) : [s]) {
        const body = hnd.indexOf("await jsonBegrensd(");
        if (body < 0) continue;
        const poort = hnd.indexOf("await smileyPoort(request, { json: true })");
        const herkomst = poort >= 0 ? poort : hnd.indexOf("zelfdeHerkomst(request.headers, request.url)");
        const limiet = poort >= 0 ? poort : hnd.indexOf("await enforceRateLimit(");
        expect(herkomst, `${r}: herkomst vóór de body`).toBeGreaterThanOrEqual(0);
        expect(herkomst, r).toBeLessThan(body);
        expect(limiet, `${r}: limiet vóór de body`).toBeGreaterThanOrEqual(0);
        expect(limiet, r).toBeLessThan(body);
      }
    }
  });

  it("elke handler van het beheer: poort → sessie of PLATFORM_ADMIN → pas dan de body; wijzigen in het team alleen als beheerder", () => {
    // deel 2: vijf routes (was 3). De QR-route geeft alleen een bestand terug en heeft dus één handler (was: minstens 2).
    // deel 6a: zes routes (was 5): de agenda voor demo-afspraken kwam erbij (tests/voorstel-smileyapp-deel6a.test.ts).
    expect(BEHEER_ROUTES).toHaveLength(6);
    for (const r of BEHEER_ROUTES) {
      const lijst = handlers(lees(r));
      expect(lijst.length, r).toBeGreaterThanOrEqual(r.endsWith("/qr/route.ts") ? 1 : 2);
      for (const hnd of lijst) {
        const naam = hnd.slice(0, hnd.indexOf("("));
        const poort = hnd.indexOf("await smileyPoort(request");
        const sessie = Math.max(hnd.indexOf("await eisToegang()"), hnd.indexOf("await eisBeheerder()"));
        expect(poort, `${r} ${naam}: poort`).toBeGreaterThanOrEqual(0);
        expect(sessie, `${r} ${naam}: sessie`).toBeGreaterThan(poort);
        const body = hnd.indexOf("await jsonBegrensd(");
        if (body >= 0) expect(sessie, `${r} ${naam}: sessie vóór de body`).toBeLessThan(body);
        // geen werk vóór de sessiecontrole
        expect(hnd.slice(0, sessie), `${r} ${naam}`).not.toMatch(/kv|alleAanvragen|alleAccounts|gesprekken\(|haalGesprek/);
      }
    }
    const team = handlers(lees("app/api/voorstel/smileyapp/beheer/team/route.ts"));
    expect(team.find((x) => x.startsWith("POST("))).toContain("const ik = await eisBeheerder();");
    expect(team.find((x) => x.startsWith("GET("))).toContain("await eisToegang()");
    // de sessie komt uit het SmileyApp-account of, als vangnet, uit PLATFORM_ADMIN
    expect(lees("lib/voorstel/smileyapp-accounts.ts")).toContain('hasRole(p, "PLATFORM_ADMIN")');
  });

  it("geen 403 voor iets wat een gewone sessie raakt: niet ingelogd is 401, verkeerde rol is 423", () => {
    const acc = lees("lib/voorstel/smileyapp-accounts.ts");
    expect(acc).not.toContain("AppError.forbidden");
    expect(acc).toContain('AppError.unauthenticated("Log eerst in.")');
    expect(acc).toContain("AppError.alleenBeheerder(");
    for (const r of [...BEHEER_ROUTES, "app/api/voorstel/smileyapp/account/route.ts"]) expect(lees(r), r).not.toContain("AppError.forbidden");
    // de enige 403 is een verzoek van een andere website
    expect(lees("lib/voorstel/smileyapp-poort.ts").match(/AppError\.forbidden/g)).toHaveLength(1);
  });

  it("de limieten per actie", () => {
    const account = lees("app/api/voorstel/smileyapp/account/route.ts");
    expect(account).toMatch(/name: "smileyapp-inloggen", identifier: ip, limit: 10, windowSeconds: 600/);
    expect(account).toMatch(/name: "smileyapp-aannemen", identifier: ip, limit: 10, windowSeconds: 600/);
    expect(lees("app/api/voorstel/smileyapp/beheer/team/route.ts")).toMatch(/name: "smileyapp-uitnodigen", identifier: ik\.id, limit: 20, windowSeconds: 3600/);
    const aanvraag = lees("app/api/voorstel/smileyapp/aanvraag/route.ts");
    expect(aanvraag).toMatch(/name: "smileyapp-aanvraag", identifier: ip, limit: 5, windowSeconds: 600/);
    // volgorde: poort → body → lokveld → regels → limiet per aanvraag → bewaren → melding
    const volgorde = ["await smileyPoort(request, { json: true })", "await jsonBegrensd(request", "schema.safeParse(", "if (lokveld?.trim())", "valideerAanvraag(", 'name: "smileyapp-aanvraag"', "await maakAanvraag(", "stuurMelding("].map((t) => aanvraag.indexOf(t));
    expect(volgorde.every((i) => i >= 0)).toBe(true);
    expect([...volgorde].sort((a, b) => a - b)).toEqual(volgorde);
  });

  it("het token van een uitnodiging komt in geen logregel, en alleen als hash in de opslag", () => {
    const BESTANDEN = [
      "lib/voorstel/smileyapp-accounts.ts",
      "lib/voorstel/smileyapp-mail.ts",
      "lib/voorstel/smileyapp-poort.ts",
      "app/api/voorstel/smileyapp/account/route.ts",
      "app/api/voorstel/smileyapp/beheer/team/route.ts",
      "app/voorstel/smileyapp/beheer/page.tsx",
      "components/voorstel/smileyapp/beheer/Inloggen.tsx",
    ];
    for (const f of BESTANDEN) expect(lees(f), f).not.toMatch(/\blogger\b|console\.(log|info|warn|error|debug)/);
    const acc = lees("lib/voorstel/smileyapp-accounts.ts");
    expect(acc).toContain("uitnodiging: { hash: hashToken(token), tot: uitnodigingTot(nu) }");
    expect(acc).toContain("timingSafeEqual(verwacht, gekregen)");
    // het token gaat alleen de mail in (als link) en in een POST-body, nooit in een GET naar de API
    expect(lees("components/voorstel/smileyapp/beheer/Inloggen.tsx")).toContain('body: { actie: "aannemen", token, wachtwoord }');
    expect(lees("app/voorstel/smileyapp/beheer/page.tsx")).toContain('referrer: "no-referrer"');
  });

  it("alle persoonsgegevens staan onder voorstel-smileyapp:, en de cookie staat in het cookiebeleid", () => {
    expect(lees("lib/voorstel/smileyapp-accounts.ts")).toContain('const PREFIX = "voorstel-smileyapp:account:";');
    expect(lees("lib/voorstel/smileyapp-aanvragen.ts")).toContain('const PREFIX = "voorstel-smileyapp:aanvraag:";');
    expect(lees("lib/privacy/cookies.ts")).toContain('{ namen: ["smiley_sessie"], doel: "alleen op een websitevoorstel: inloggen in het beheer van het SmileyApp-voorstel", looptijd: 14 * DAG }');
  });

  it("geen bedrag buiten lib/voorstel/smileyapp.ts, ook niet in het beheer, de mails of het demoformulier", () => {
    const BEDRAG = /\b(?:49|249|1499)[.,]95\b|1\.499,95|€\s?\d/;
    const nieuw = [
      ...ROUTES,
      ...readdirSync(path.join(ROOT, "components/voorstel/smileyapp/beheer")).map((n) => `components/voorstel/smileyapp/beheer/${n}`),
      ...readdirSync(path.join(ROOT, "lib/voorstel")).filter((n) => n.startsWith("smileyapp-")).map((n) => `lib/voorstel/${n}`),
      "components/voorstel/smileyapp/AanvraagFormulier.tsx",
      "app/voorstel/smileyapp/demo/page.tsx",
      "app/voorstel/smileyapp/beheer/page.tsx",
    ];
    expect(nieuw.length).toBeGreaterThan(20);
    for (const f of nieuw) expect(lees(f), f).not.toMatch(BEDRAG);
    // het demoformulier krijgt van de pagina alleen de namen van de pakketten
    expect(lees("app/voorstel/smileyapp/demo/page.tsx")).toContain("pakketten={PAKKETTEN.map((p) => ({ waarde: p.id, label: p.naam }))}");
  });

  it("het beheer staat los van de site: geen omlijsting, wel in de rondgang overgeslagen en met één kop", () => {
    const layout = lees("app/voorstel/smileyapp/layout.tsx");
    expect(layout.match(/<AlleenOpSite basis=\{BASE\}>/g)).toHaveLength(2);
    // de band staat binnen het eerste blok, de pagina zelf erbuiten
    expect(layout.indexOf("<AlleenOpSite basis={BASE}>")).toBeLessThan(layout.indexOf("{voorBand}"));
    expect(layout.indexOf("{voorBand}")).toBeLessThan(layout.indexOf("</AlleenOpSite>"));
    expect(layout.indexOf("</AlleenOpSite>")).toBeLessThan(layout.indexOf('<main id="inhoud">'));
    expect(lees("lib/ops/rondgang.ts")).toContain('"/voorstel/smileyapp/beheer"');
    expect(lees("app/voorstel/smileyapp/beheer/page.tsx").match(/<h1[\s>]/g)).toHaveLength(1);
    for (const n of readdirSync(path.join(ROOT, "components/voorstel/smileyapp/beheer"))) expect(lees(`components/voorstel/smileyapp/beheer/${n}`), n).not.toMatch(/<h1[\s>]/);
    // Schwarzwald blijft zoals het was: zonder basis is het hun beheer
    expect(lees("components/voorstel/AlleenOpSite.tsx")).toContain("basis ? isBeheerPad(pad, basis) : isBeheerPad(pad)");
  });
});
