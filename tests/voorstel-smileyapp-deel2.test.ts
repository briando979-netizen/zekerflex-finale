import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Deel 2 van het SmileyApp-voorstel (19 nov 2026): wachtwoord vergeten, de
// pakketkiezer, de branchepagina's, eigen blogberichten, pakketten aanpassen in
// het beheer, de bezoekcijfers en de QR-code naar de demo-aanvraag. Deze test
// bewaakt de regels (puur), de opslag (met een KV in het geheugen) en in de
// broncode: elke nieuwe route controleert de herkomst en heeft een limiet, het
// beheer eist een sessie, en er staat nergens een prijs buiten smileyapp.ts.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  jar: new Map<string, string>(),
  mails: [] as { to: string; subject: string; text: string; html?: string; kind?: string }[],
  geteld: [] as { pad: string; buiten: boolean }[],
  limiet: null as string | null,
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
vi.mock("@/lib/auth", () => ({ getPrincipal: async () => null, hasRole: () => false }));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: { to: string; subject: string; text: string; html?: string; kind?: string }) => {
    h.mails.push(m);
    return { id: "t", delivered: true, transport: "mailbox" };
  },
}));
// een limiet met de naam in h.limiet is "bereikt"; de rest laat alles door
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: async (spec: { name: string }) => {
    if (spec.name === h.limiet) throw new Error("te veel");
    return { ok: true };
  },
  fixedWindow: async () => ({ ok: true }),
}));
vi.mock("@/lib/voorstel/smileyapp-cijfers", () => ({
  telWeergave: async (pad: string, buiten: boolean) => void h.geteld.push({ pad, buiten }),
  telDemoAanvraag: async () => undefined,
  smileyappCijfers: async () => ({}),
}));

import { BASE, BLOG, MENU, MENU_FOOTER, PAKKETTEN, QUOTES, VRAAGSOORTEN, euro, pakket, prijsTekst, veelgesteld, type Pakket } from "@/lib/voorstel/smileyapp";
import { leesBron, valideerAanvraag } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { HERSTEL_ANTWOORD, HERSTEL_MINUTEN, herstelTot } from "@/lib/voorstel/smileyapp-account-regels";
import {
  SESSIE_COOKIE,
  bekijkHerstel,
  blokkeer,
  huidigAccount,
  inloggen,
  kiesNieuwWachtwoord,
  leesSessie,
  neemUitnodigingAan,
  nodigUit,
  tekenSessie,
  uitloggen,
  vraagHerstel,
  type Account,
  type Toegang,
} from "@/lib/voorstel/smileyapp-accounts";
import { bewaarBericht, eigenBerichten, verwijderBericht, zichtbareBerichten } from "@/lib/voorstel/smileyapp-blog";
import { alineas, blogLijst, isDatum, maakSlug, uniekeSlug, valideerBericht, zichtbaar, type BerichtInvoer, type EigenBericht } from "@/lib/voorstel/smileyapp-blog-regels";
import { BRANCHES, BRANCHE_LIJST, SOORT_LABEL, VOORBEELD_LABEL, branche, quotesVoor } from "@/lib/voorstel/smileyapp-branches";
import { smileyappKennis } from "@/lib/voorstel/smileyapp-chat";
import { EIGEN_BLOG, isMens, paginaNaam, somCijfers, telPad } from "@/lib/voorstel/smileyapp-cijfer-regels";
import { buitenDeKiezer, grenzenVan, kiesPakket, kiezerVragen, type Antwoorden } from "@/lib/voorstel/smileyapp-kiezer";
import { VERHALEN } from "@/lib/voorstel/smileyapp-klanten";
import { herstelMail } from "@/lib/voorstel/smileyapp-mail";
import { alsInvoer, leesBedrag, leesOverschrijvingen, metOverschrijvingen, valideerPakket, type PakketInvoer } from "@/lib/voorstel/smileyapp-pakket-regels";
import { bewaarPakket, herstelPakketten, pakkettenVoorBeheer, smileyappPakketten } from "@/lib/voorstel/smileyapp-pakketten";
import { DEMO_ADRES, demoQr, demoQrAdres, demoQrSvg, qrBestandsnaam } from "@/lib/voorstel/smileyapp-qr";
import { euroTaal } from "@/lib/voorstel/smileyapp-taal";
import { KIEZER_NL, PROBEER_NL } from "@/lib/voorstel/smileyapp-teksten";
import { AppError } from "@/lib/errors";

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const NU = new Date("2026-11-19T10:00:00+01:00"); // donderdag
const BEHEER = "https://smileyapp.zekerflex.com/beheer";
const opslag = (email: string) => h.kv.get(`voorstel-smileyapp:account:${email}`) as Account | undefined;
const tokenUit = (soort: "uitnodiging" | "herstel") => new RegExp(`[?&]${soort}=([A-Za-z0-9_-]+)`).exec(h.mails.filter((m) => m.kind === (soort === "herstel" ? "smileyapp-wachtwoord" : "smileyapp-uitnodiging")).at(-1)?.text ?? "")?.[1] ?? "";
const BEDRAG = /\b(?:49|249|1499)[.,]95\b|1\.499,95|€\s?\d/;

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
async function actief(naam: string, email: string, wachtwoord = "een-lang-wachtwoord"): Promise<void> {
  await nodigUit({ naam, email, rol: "beheerder", door: "ZekerFlex-beheer", beheer: BEHEER }, NU);
  await neemUitnodigingAan({ token: tokenUit("uitnodiging"), wachtwoord }, NU);
  await uitloggen();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  h.kv.clear();
  h.jar.clear();
  h.mails.length = 0;
  h.geteld.length = 0;
  h.limiet = null;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("wachtwoord vergeten", () => {
  it("alleen de hash wordt bewaard, de link werkt een uur, en een onbekend of geblokkeerd adres krijgt niets", async () => {
    await actief("Martijn", "martijn@smileyapp.test");
    h.mails.length = 0;
    expect(await vraagHerstel("niemand@smileyapp.test", BEHEER, NU)).toBe("geen");
    expect(await vraagHerstel("geen adres", BEHEER, NU)).toBe("geen");
    // een uitnodiging zonder wachtwoord is geen account dat kan inloggen
    await nodigUit({ naam: "Sanne", email: "sanne@smileyapp.test", rol: "medewerker", door: "Martijn", beheer: BEHEER }, NU);
    h.mails.length = 0;
    expect(await vraagHerstel("sanne@smileyapp.test", BEHEER, NU)).toBe("geen");
    expect(h.mails).toHaveLength(0);

    expect(await vraagHerstel(" Martijn@SmileyApp.test ", BEHEER, NU)).toBe("verstuurd");
    const token = tokenUit("herstel");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const bewaard = opslag("martijn@smileyapp.test");
    expect(bewaard?.herstel?.hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify([...h.kv.values()])).not.toContain(token);
    expect(HERSTEL_MINUTEN).toBe(60);
    expect(bewaard?.herstel?.tot).toBe("2026-11-19T10:00:00.000Z");
    expect(herstelTot(NU)).toBe("2026-11-19T10:00:00.000Z");
    const mail = h.mails[0];
    expect([mail?.to, mail?.kind, mail?.subject]).toEqual(["martijn@smileyapp.test", "smileyapp-wachtwoord", "Kies een nieuw wachtwoord voor het beheer van SmileyApp"]);
    expect(mail?.text).toContain(`${BEHEER}?herstel=${token}`);
    expect(await bekijkHerstel(token, NU)).toEqual({ naam: "Martijn", email: "martijn@smileyapp.test" });
    // net binnen het uur, en precies een uur later niet meer
    expect(await bekijkHerstel(token, new Date("2026-11-19T10:59:59+01:00"))).not.toBeNull();
    expect(await bekijkHerstel(token, new Date("2026-11-19T11:00:00+01:00"))).toBeNull();
    expect((await fout(kiesNieuwWachtwoord({ token, wachtwoord: "een-nieuw-wachtwoord" }, new Date("2026-11-19T11:00:00+01:00")))).message).toContain("werkt niet meer");
    // een herstellink is geen uitnodiging (en andersom)
    expect((await fout(neemUitnodigingAan({ token, wachtwoord: "een-nieuw-wachtwoord" }, NU))).message).toContain("werkt niet meer");
    // geblokkeerd: de link werkt niet en er komt geen nieuwe
    const ik: Toegang = { naam: "ZekerFlex", email: "", rol: "beheerder", via: "zekerflex", id: "zekerflex-u1" };
    await actief("Tom", "tom@smileyapp.test");
    await vraagHerstel("tom@smileyapp.test", BEHEER, NU);
    const tom = tokenUit("herstel");
    await blokkeer(ik, "tom@smileyapp.test", true);
    expect(await bekijkHerstel(tom, NU)).toBeNull();
    expect(await vraagHerstel("tom@smileyapp.test", BEHEER, NU)).toBe("geen");
  });

  it("een nieuwe aanvraag maakt de vorige link ongeldig, en een link werkt één keer", async () => {
    await actief("Martijn", "martijn@smileyapp.test");
    await vraagHerstel("martijn@smileyapp.test", BEHEER, NU);
    const eerste = tokenUit("herstel");
    await vraagHerstel("martijn@smileyapp.test", BEHEER, NU);
    const tweede = tokenUit("herstel");
    expect(tweede).not.toBe(eerste);
    expect(await bekijkHerstel(eerste, NU)).toBeNull();
    expect((await fout(kiesNieuwWachtwoord({ token: eerste, wachtwoord: "een-nieuw-wachtwoord" }, NU))).status).toBe(422);
    expect((await fout(kiesNieuwWachtwoord({ token: tweede, wachtwoord: "te-kort" }, NU))).message).toContain("minimaal 10 tekens");
    const account = await kiesNieuwWachtwoord({ token: tweede, wachtwoord: "een-nieuw-wachtwoord" }, NU);
    expect(account.status).toBe("actief");
    expect(opslag("martijn@smileyapp.test")?.herstel).toBeUndefined();
    expect(await bekijkHerstel(tweede, NU)).toBeNull();
    expect((await fout(kiesNieuwWachtwoord({ token: tweede, wachtwoord: "nog-een-wachtwoord" }, NU))).message).toContain("werkt niet meer");
    // het oude wachtwoord werkt niet meer, het nieuwe wel
    await uitloggen();
    expect((await fout(inloggen("martijn@smileyapp.test", "een-lang-wachtwoord", NU))).message).toBe("E-mailadres of wachtwoord klopt niet.");
    expect((await inloggen("martijn@smileyapp.test", "een-nieuw-wachtwoord", NU)).email).toBe("martijn@smileyapp.test");
  });

  it("na het kiezen zijn alle oude sessies ongeldig; de nieuwe sessie werkt", async () => {
    await actief("Martijn", "martijn@smileyapp.test");
    await inloggen("martijn@smileyapp.test", "een-lang-wachtwoord", NU);
    const oud = h.jar.get(SESSIE_COOKIE) ?? "";
    expect((await huidigAccount())?.email).toBe("martijn@smileyapp.test");
    // een sessie van vóór het eerste nieuwe wachtwoord draagt geen versie (zo bleven de sessies van deel 1 geldig)
    expect(leesSessie(oud)).toEqual({ email: "martijn@smileyapp.test", aangemaakt: "2026-11-19T09:00:00.000Z" });
    h.jar.clear();

    await vraagHerstel("martijn@smileyapp.test", BEHEER, NU);
    await kiesNieuwWachtwoord({ token: tokenUit("herstel"), wachtwoord: "een-nieuw-wachtwoord" }, NU);
    const nieuw = h.jar.get(SESSIE_COOKIE) ?? "";
    expect(opslag("martijn@smileyapp.test")?.sessieVersie).toBe(1);
    expect(leesSessie(nieuw)?.versie).toBe(1);
    expect((await huidigAccount())?.email).toBe("martijn@smileyapp.test");
    // de oude cookie (bijvoorbeeld op een ander apparaat) is nu niets meer waard
    h.jar.set(SESSIE_COOKIE, oud);
    expect(await huidigAccount()).toBeNull();
    // een tweede keer: ook de sessie van na de eerste keer vervalt
    await vraagHerstel("martijn@smileyapp.test", BEHEER, NU);
    await kiesNieuwWachtwoord({ token: tokenUit("herstel"), wachtwoord: "een-derde-wachtwoord" }, NU);
    h.jar.set(SESSIE_COOKIE, nieuw);
    expect(await huidigAccount()).toBeNull();
    // met de versie knoeien kan niet: de handtekening klopt dan niet meer
    const vals = tekenSessie({ email: "martijn@smileyapp.test", aangemaakt: "2026-11-19T09:00:00.000Z", sessieVersie: 2 }, NU.getTime());
    h.jar.set(SESSIE_COOKIE, `${vals.split(".")[0] ?? ""}.${oud.split(".")[1] ?? ""}`);
    expect(await huidigAccount()).toBeNull();
  });

  it("het scherm zegt altijd hetzelfde: bekend, onbekend, geblokkeerd en bij de limiet per adres", async () => {
    await actief("Martijn", "martijn@smileyapp.test");
    h.mails.length = 0;
    const { POST } = await import("@/app/api/voorstel/smileyapp/account/route");
    const stuur = async (email: string) => {
      const res = await POST(
        new Request("http://app:3000/api/voorstel/smileyapp/account", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-host": "smileyapp.zekerflex.com", origin: "https://smileyapp.zekerflex.com" },
          body: JSON.stringify({ actie: "vergeten", email }),
        }),
      );
      return { status: res.status, json: (await res.json()) as unknown };
    };
    const bekend = await stuur("martijn@smileyapp.test");
    expect(bekend).toEqual({ status: 200, json: { ok: true, melding: HERSTEL_ANTWOORD } });
    expect(HERSTEL_ANTWOORD).toBe("Als dit adres bij ons bekend is, staat er zo een mail in je postvak.");
    await vi.waitFor(() => expect(h.mails).toHaveLength(1));
    // de link wijst naar het subdomein waar het verzoek binnenkwam
    expect(h.mails[0]?.text).toContain("https://smileyapp.zekerflex.com/beheer?herstel=");
    expect(await stuur("niemand@smileyapp.test")).toEqual(bekend);
    expect(await stuur("geen adres")).toEqual(bekend);
    // de limiet per adres: zelfde antwoord, maar er gaat geen mail meer uit
    h.limiet = "smileyapp-vergeten-adres";
    expect(await stuur("martijn@smileyapp.test")).toEqual(bekend);
    await Promise.resolve();
    expect(h.mails).toHaveLength(1);

    const route = lees("app/api/voorstel/smileyapp/account/route.ts");
    expect(route).toMatch(/name: "smileyapp-vergeten", identifier: ip, limit: 5, windowSeconds: 3600/);
    expect(route).toMatch(/name: "smileyapp-vergeten-adres", identifier: createHash\("sha256"\)\.update\(normEmail\(d\.email\)\)\.digest\("hex"\), limit: 3, windowSeconds: 3600/);
    // het adres zelf komt niet in de sleutel van de limiet, en er wordt niet op de mail gewacht
    expect(route).toContain("void vraagHerstel(d.email, beheerVan(request)).catch(() => undefined);");
    expect(lees("components/voorstel/smileyapp/beheer/Inloggen.tsx")).toContain(`"${HERSTEL_ANTWOORD}"`);
  });

  it("de mail, de knop in Team en geen token in een logregel", () => {
    const m = herstelMail({ naam: "<b>Martijn</b>", email: "martijn@smileyapp.test", link: `${BEHEER}?herstel=TOKEN` });
    expect(m.kind).toBe("smileyapp-wachtwoord");
    expect(m.text).toContain("De link werkt 60 minuten en één keer.");
    expect(m.html).toContain("&lt;b&gt;Martijn&lt;/b&gt;");
    expect(m.html).not.toMatch(/<img|src=|url\(|<script|<link/i);
    const team = lees("app/api/voorstel/smileyapp/beheer/team/route.ts");
    expect(team).toContain('z.object({ actie: z.literal("herstel"), email: EMAIL })');
    expect(team.indexOf("const ik = await eisBeheerder();")).toBeLessThan(team.indexOf("await vraagHerstel("));
    expect(lees("components/voorstel/smileyapp/beheer/Team.tsx")).toContain("Stuur een link voor een nieuw wachtwoord");
    for (const f of ["lib/voorstel/smileyapp-accounts.ts", "lib/voorstel/smileyapp-mail.ts", "app/api/voorstel/smileyapp/account/route.ts", "app/voorstel/smileyapp/beheer/page.tsx"]) {
      expect(lees(f), f).not.toMatch(/\blogger\b|console\.(log|info|warn|error|debug)/);
    }
    // het token gaat in een POST-body, nooit in een GET naar de API
    expect(lees("components/voorstel/smileyapp/beheer/Inloggen.tsx")).toContain('body: { actie: "nieuw-wachtwoord", token, wachtwoord }');
    // het inlogscherm vult het hele venster met de donkere achtergrond (19 nov: op 390 × 844 was het onder de kaart crème)
    expect(lees("app/voorstel/smileyapp/beheer/page.tsx")).toContain('<div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-smiley-ink" />');
  });
});

describe("pakketkiezer", () => {
  it("de grenzen en de keuzes komen uit de onderdelen van de pakketten", () => {
    expect(grenzenVan(pakket("basis") as Pakket)).toMatchObject({ vragenlijsten: 1, beoordelingen: 100, gebruikers: 1 });
    expect(grenzenVan(pakket("iso") as Pakket)).toMatchObject({ vragenlijsten: 10, beoordelingen: 1000, gebruikers: "meerdere" });
    // het MKB Pakket noemt geen aantallen en het Maatwerk Pakket heeft geen onderdelen: die doen niet mee
    for (const id of ["mkb", "maatwerk"]) expect(grenzenVan(pakket(id) as Pakket), id).toMatchObject({ vragenlijsten: null, beoordelingen: null, gebruikers: null });
    expect(buitenDeKiezer().map((p) => p.id)).toEqual(["mkb"]);
    const vragen = kiezerVragen();
    expect(vragen.map((v) => v.sleutel)).toEqual(["vragenlijsten", "beoordelingen", "gebruikers"]);
    expect(vragen.map((v) => v.keuzes.map((k) => k.label))).toEqual([
      ["1 vragenlijst", "2 tot 10", "Meer dan 10"],
      ["1 tot 100", "101 tot 1.000", "Meer dan 1.000"],
      ["1 gebruiker", "Meerdere gebruikers"],
    ]);
    // de vraag beweert geen periode ("per maand" staat niet in de gegevens)
    expect(vragen[1]?.vraag).not.toMatch(/maand|jaar|week/);
  });

  it("elke combinatie van antwoorden wijst een bestaand pakket aan, met een reden zonder bedrag", () => {
    const [lijsten, oordelen, gebruikers] = kiezerVragen();
    let aantal = 0;
    for (const a of lijsten?.keuzes ?? []) {
      for (const b of oordelen?.keuzes ?? []) {
        for (const c of gebruikers?.keuzes ?? []) {
          const advies = kiesPakket({ vragenlijsten: a.nodig, beoordelingen: b.nodig, gebruikers: c.nodig });
          aantal += 1;
          expect(PAKKETTEN.map((p) => p.id)).toContain(advies.pakket.id);
          expect(advies.reden.length).toBeGreaterThan(20);
          expect(advies.reden).not.toMatch(BEDRAG);
          expect(advies.maatwerk).toBe(advies.pakket.id === "maatwerk");
        }
      }
    }
    expect(aantal).toBe(18);
  });

  it("de uitkomsten kloppen met de pakketten", () => {
    const kies = (a: Antwoorden) => kiesPakket(a).pakket.id;
    expect(kies({ vragenlijsten: 1, beoordelingen: 100, gebruikers: 1 })).toBe("basis");
    expect(kies({ vragenlijsten: 10, beoordelingen: 100, gebruikers: 1 })).toBe("iso");
    expect(kies({ vragenlijsten: 1, beoordelingen: 1000, gebruikers: 1 })).toBe("iso");
    expect(kies({ vragenlijsten: 1, beoordelingen: 100, gebruikers: "meerdere" })).toBe("iso");
    expect(kies({ vragenlijsten: "meer", beoordelingen: 100, gebruikers: 1 })).toBe("maatwerk");
    expect(kies({ vragenlijsten: 1, beoordelingen: "meer", gebruikers: "meerdere" })).toBe("maatwerk");
    expect(kiesPakket({ vragenlijsten: 1, beoordelingen: 100, gebruikers: 1 }).reden).toBe("In het Basis Pakket zitten 1 vragenlijst, 100 beoordelingen en 1 gebruiker. Dat is genoeg voor wat je invulde.");
    expect(kiesPakket({ vragenlijsten: "meer", beoordelingen: "meer", gebruikers: 1 }).reden).toBe(
      "Je hebt meer vragenlijsten en beoordelingen nodig dan er in het Basis Pakket en het ISO Pakket zitten. Het Maatwerk Pakket stel je zelf samen, zodat je krijgt wat je nodig hebt.",
    );
  });

  it("volgt de pakketten uit het beheer, en valt eerlijk terug op maatwerk als er niets af te leiden is", () => {
    const aangepast = metOverschrijvingen({ basis: { onderdelen: ["3 vragenlijsten", "250 beoordelingen", "2 gebruikers"] } });
    expect(kiezerVragen(aangepast).map((v) => v.keuzes.map((k) => k.label))).toEqual([
      ["1 tot 3", "4 tot 10", "Meer dan 10"],
      ["1 tot 250", "251 tot 1.000", "Meer dan 1.000"],
      ["1 tot 2", "Meerdere gebruikers"],
    ]);
    expect(kiesPakket({ vragenlijsten: 3, beoordelingen: 250, gebruikers: 2 }, aangepast).pakket.id).toBe("basis");
    // geen enkel pakket noemt nog aantallen: geen keuzes, en de uitkomst is het pakket op aanvraag
    const zonder = metOverschrijvingen({ basis: { onderdelen: ["Eigen huisstijl"] }, iso: { onderdelen: ["Instelservice"] } });
    expect(kiezerVragen(zonder).every((v) => v.keuzes.length === 0)).toBe(true);
    const advies = kiesPakket({ vragenlijsten: 1, beoordelingen: 1, gebruikers: 1 }, zonder);
    expect([advies.pakket.id, advies.maatwerk]).toEqual(["maatwerk", true]);
    expect(advies.reden).toContain("niet af te leiden");
  });

  // 19 nov 2026 (deel 3, de site in het Engels en het Duits): de kiezer krijgt zijn teksten en het basispad van de taal
  // als prop, met de Nederlandse standaard in lib/voorstel/smileyapp-teksten.ts. Was: "{prijsTekst(advies.pakket)}",
  // "href={`${BASE}/demo?pakket=${advies.pakket.id}`}" en de twee knopteksten letterlijk in het onderdeel. De eis is
  // dezelfde gebleven: het bedrag komt uit het pakket zelf (nu via euroTaal, dat voor Nederlands euro() is), en de
  // knoppen leiden naar de demo-aanvraag en de pakketten.
  it("het onderdeel toont de prijs uit het pakket zelf en staat op de voorpagina en de demopagina", () => {
    const k = lees("components/voorstel/smileyapp/PakketKiezer.tsx");
    expect(k).toContain("advies.pakket.prijs === null ? t.opAanvraag : euroTaal(advies.pakket.prijs, t.taal)");
    expect(k).toContain("teksten: t = KIEZER_NL,");
    expect(k).toContain("basis = BASE,");
    expect(k).toContain("href={`${basis}/demo?pakket=${advies.pakket.id}`}");
    for (const p of PAKKETTEN) if (p.prijs !== null) expect(euroTaal(p.prijs, "nl")).toBe(euro(p.prijs));
    expect([KIEZER_NL.opAanvraag, KIEZER_NL.demoKnop, KIEZER_NL.alleKnop, KIEZER_NL.taal]).toEqual([prijsTekst({ prijs: null }), "Demo van dit pakket", "Bekijk alle pakketten", "nl"]);
    expect(lees("app/voorstel/smileyapp/page.tsx")).toContain("<PakketKiezer pakketten={pakketten} />");
    expect(lees("app/voorstel/smileyapp/demo/page.tsx")).toContain("<PakketKiezer pakketten={pakketten} compact />");
  });
});

describe("branches en klantverhalen", () => {
  it("vijf branches, elk met vijf voorbeeldvragen in een soort die Smileyapp kent", () => {
    expect(Object.keys(BRANCHES)).toEqual(["horeca", "onderwijs", "zorg", "winkel", "evenementen"]);
    expect(BRANCHE_LIJST).toHaveLength(5);
    for (const [slug, b] of Object.entries(BRANCHES)) {
      expect(b.slug, slug).toBe(slug);
      expect(slug).toMatch(/^[a-z]+$/);
      expect(b.vragen, slug).toHaveLength(5);
      expect(new Set(b.vragen.map((v) => v.tekst)).size, slug).toBe(5);
      for (const v of b.vragen) {
        expect(VRAAGSOORTEN as readonly string[], `${slug}: ${v.tekst}`).toContain(v.soort);
        expect(v.tekst.length).toBeGreaterThan(10);
      }
      expect(b.intro.length, slug).toBeGreaterThanOrEqual(1);
      expect(b.momenten.length, slug).toBeGreaterThanOrEqual(3);
      // algemeen: geen cijfers, percentages of bedragen in de inleiding
      expect(b.intro.join(" "), slug).not.toMatch(/\d|%|€/);
    }
    expect(Object.keys(SOORT_LABEL).sort()).toEqual([...VRAAGSOORTEN].sort());
    expect(VOORBEELD_LABEL).toBe("Voorbeeld, in je eigen dashboard pas je alles aan");
  });

  it("een onbekende slug bestaat niet, ook niet 'constructor'", () => {
    expect(branche("horeca")?.naam).toBe("Horeca");
    for (const s of ["constructor", "toString", "__proto__", "Horeca", "", "horeca/"]) expect(branche(s), s).toBeUndefined();
    const pagina = lees("app/voorstel/smileyapp/branches/[slug]/page.tsx");
    expect(pagina).toContain("if (!b) notFound();");
    expect(pagina).toContain("{VOORBEELD_LABEL}");
    expect(lees("lib/voorstel/smileyapp-branches.ts")).toContain("Object.hasOwn(BRANCHES, slug)");
  });

  it("alleen bij onderwijs de twee echte quotes, letterlijk", () => {
    expect(quotesVoor("onderwijs")).toBe(QUOTES);
    for (const s of ["horeca", "zorg", "winkel", "evenementen"]) expect(quotesVoor(s)).toEqual([]);
  });

  it("de klantverhalen: de volledige quote, en 'wat ze meten' staat in de quote zelf", () => {
    expect(VERHALEN.map((v) => v.organisatie)).toEqual(["Hanzehogeschool", "Alfa College"]);
    VERHALEN.forEach((v, i) => {
      expect(v.quote).toBe(QUOTES[i]?.tekst);
      expect(v.naam).toBe(QUOTES[i]?.naam);
      expect(v.klant?.naam).toBe(v.organisatie);
      expect(`${v.gebruik} ${v.eerst ?? ""} ${v.meten.join(" ")}`).not.toMatch(/\d|%|€/);
    });
    const quote = (i: number) => (QUOTES[i]?.tekst.join(" ") ?? "").toLowerCase();
    for (const woord of ["minor", "vakken", "evaluatieformulier", "word"]) expect(quote(0), woord).toContain(woord);
    for (const woord of ["stagemarkten", "trainingen", "workshops", "praktijkopdrachten", "bedrijfsbezoeken", "voorlichting"]) expect(quote(1), woord).toContain(woord);
    expect(lees("app/voorstel/smileyapp/page.tsx")).toContain("Lees de verhalen");
  });

  it("de links: Branches in het menu (in de kop pas vanaf xl), Klantverhalen in de footer en het uitklapmenu", () => {
    expect(MENU.find((m) => m.label === "Branches")).toEqual({ label: "Branches", href: `${BASE}/branches`, breed: true });
    expect(MENU.filter((m) => m.breed)).toHaveLength(1);
    expect(MENU_FOOTER).toEqual([{ label: "Klantverhalen", href: `${BASE}/klanten` }]);
    const layout = lees("app/voorstel/smileyapp/layout.tsx");
    expect(layout).toContain('className={m.breed ? "hidden xl:block" : undefined}');
    expect(layout).toContain("{[...MENU, ...MENU_FOOTER].map((m) => (");
    expect(lees("components/voorstel/smileyapp/SmileyMenu.tsx")).toContain("{[...MENU, ...MENU_FOOTER].map((m) => (");
  });
});

describe("eigen blogberichten", () => {
  const goed: BerichtInvoer = { titel: "  Meten is weten:  3 tips & meer!  ", datum: "2026-11-19", samenvatting: "Drie tips om vaker feedback te krijgen.", tekst: "Eerste alinea.\r\n\r\nTweede alinea\nmet een regel.\n\n\n", status: "gepubliceerd" };

  it("slug, alinea's, datum en de controle van een bericht", () => {
    expect(maakSlug("Meten is weten: 3 tips & meer!")).toBe("meten-is-weten-3-tips-en-meer");
    expect(maakSlug("Café Ünïcode")).toBe("cafe-unicode");
    expect(maakSlug("!!!")).toBe("bericht");
    expect(uniekeSlug("x", [])).toBe("x");
    expect(uniekeSlug("x", ["x", "x-2"])).toBe("x-3");
    // een eigen bericht krijgt nooit de slug van een vast bericht
    expect(uniekeSlug(BLOG[0]?.slug ?? "", [])).toBe(`${BLOG[0]?.slug ?? ""}-2`);
    expect(alineas(goed.tekst)).toEqual(["Eerste alinea.", "Tweede alinea\nmet een regel."]);
    expect(isDatum("2026-02-28")).toBe(true);
    for (const d of ["2026-02-31", "28-02-2026", "2026-2-3", ""]) expect(isDatum(d), d).toBe(false);
    expect(valideerBericht(goed)).toEqual({ ok: true, waarde: { titel: "Meten is weten: 3 tips & meer!", datum: "2026-11-19", samenvatting: "Drie tips om vaker feedback te krijgen.", tekst: "Eerste alinea.\n\nTweede alinea\nmet een regel.", status: "gepubliceerd" } });
    expect(valideerBericht({ ...goed, titel: "x" })).toMatchObject({ ok: false, veld: "titel" });
    expect(valideerBericht({ ...goed, titel: "x".repeat(121) })).toMatchObject({ ok: false, veld: "titel" });
    expect(valideerBericht({ ...goed, datum: "morgen" })).toMatchObject({ ok: false, veld: "datum" });
    expect(valideerBericht({ ...goed, samenvatting: "kort" })).toMatchObject({ ok: false, veld: "samenvatting" });
    expect(valideerBericht({ ...goed, status: "weg" })).toMatchObject({ ok: false, veld: "status" });
    // gepubliceerd zonder tekst kan niet; als concept mag het
    expect(valideerBericht({ ...goed, tekst: " \n " })).toMatchObject({ ok: false, veld: "tekst" });
    expect(valideerBericht({ ...goed, tekst: "", status: "concept" })).toMatchObject({ ok: true });
  });

  it("zichtbaar: gepubliceerd en de datum is bereikt; de vier vaste berichten staan er altijd", () => {
    expect(zichtbaar({ status: "gepubliceerd", datum: "2026-11-19" }, "2026-11-19")).toBe(true);
    expect(zichtbaar({ status: "gepubliceerd", datum: "2026-11-20" }, "2026-11-19")).toBe(false);
    expect(zichtbaar({ status: "concept", datum: "2026-11-01" }, "2026-11-19")).toBe(false);
    expect(BLOG).toHaveLength(4);
    const eigen = (o: Partial<EigenBericht>): EigenBericht => ({ id: "a".repeat(16), slug: "eigen", titel: "Eigen", datum: "2026-11-10", samenvatting: "Samenvatting", tekst: "Een.\n\nTwee.", status: "gepubliceerd", aangemaakt: "2026-11-10T09:00:00.000Z", gewijzigd: "2026-11-10T09:00:00.000Z", ...o });
    expect(blogLijst([], "2026-11-19").map((b) => b.slug)).toEqual(BLOG.map((b) => b.slug));
    const lijst = blogLijst([eigen({}), eigen({ id: "b".repeat(16), slug: "oud", datum: "2023-05-01" }), eigen({ id: "c".repeat(16), slug: "concept", status: "concept" }), eigen({ id: "d".repeat(16), slug: "later", datum: "2026-12-01" }), eigen({ id: "e".repeat(16), slug: BLOG[1]?.slug ?? "" })], "2026-11-19");
    expect(lijst.map((b) => b.slug)).toEqual(["eigen", ...BLOG.map((b) => b.slug), "oud"]);
    expect(lijst[0]).toMatchObject({ eigen: true, inhoud: [{ type: "alinea", tekst: "Een." }, { type: "alinea", tekst: "Twee." }] });
    expect(lijst[0]?.beeld).toBeUndefined();
    expect(lijst[1]?.beeld?.src).toBe(BLOG[0]?.beeld);
  });

  it("bewaren, wijzigen (de slug blijft), inplannen en verwijderen", async () => {
    const a = await bewaarBericht(undefined, goed, "Sanne", NU);
    expect(a).toMatchObject({ slug: "meten-is-weten-3-tips-en-meer", status: "gepubliceerd", door: "Sanne", aangemaakt: "2026-11-19T09:00:00.000Z" });
    expect(a.id).toMatch(/^[a-f0-9]{16}$/);
    expect([...h.kv.keys()]).toEqual([`voorstel-smileyapp:blog:${a.id}`]);
    expect((await zichtbareBerichten(NU)).map((b) => b.slug)).toEqual([a.slug, ...BLOG.map((b) => b.slug)]);
    // dezelfde titel nog eens: een eigen slug
    const b = await bewaarBericht(undefined, { ...goed, status: "concept" }, "Sanne", NU);
    expect(b.slug).toBe("meten-is-weten-3-tips-en-meer-2");
    expect(await zichtbareBerichten(NU)).toHaveLength(5);
    // de titel wijzigen houdt de link heel; een datum in de toekomst haalt het bericht (nog) van de site
    const later = new Date("2026-11-20T08:00:00+01:00");
    const c = await bewaarBericht(a.id, { ...goed, titel: "Een andere titel", datum: "2026-11-21" }, "Martijn", later);
    expect(c).toMatchObject({ slug: a.slug, titel: "Een andere titel", door: "Martijn", aangemaakt: a.aangemaakt, gewijzigd: "2026-11-20T07:00:00.000Z" });
    expect(await zichtbareBerichten(later)).toHaveLength(4);
    // de Nederlandse dag telt: op 21 nov 00:30 (in UTC nog de 20e) staat hij erop
    expect(await zichtbareBerichten(new Date("2026-11-21T00:30:00+01:00"))).toHaveLength(5);
    expect((await fout(bewaarBericht("0".repeat(16), goed, "Sanne", NU))).status).toBe(404);
    expect((await fout(bewaarBericht("../account:x", goed, "Sanne", NU))).status).toBe(404);
    expect((await fout(bewaarBericht(undefined, { ...goed, titel: "" }, "Sanne", NU))).status).toBe(422);
    await verwijderBericht(a.id);
    expect((await eigenBerichten()).map((x) => x.id)).toEqual([b.id]);
    expect((await fout(verwijderBericht(a.id))).status).toBe(404);
    // de blogpagina's lezen deze lijst
    expect(lees("app/voorstel/smileyapp/blog/page.tsx")).toContain("await zichtbareBerichten()");
    expect(lees("app/voorstel/smileyapp/blog/[slug]/page.tsx")).toContain("await zichtbareBerichten()");
  });
});

describe("pakketten aanpassen in het beheer", () => {
  const basis: PakketInvoer = alsInvoer(PAKKETTEN[0] as Pakket);

  it("de controle: prijs, looptijd, label en onderdelen", () => {
    expect(leesBedrag("59,5")).toBe(59.5);
    expect(leesBedrag("59.50")).toBe(59.5);
    expect(leesBedrag("1.250,50")).toBe(1250.5);
    expect(leesBedrag("1.250")).toBe(1250);
    expect(leesBedrag("0")).toBe(0);
    for (const t of ["", "gratis", "12,345", "-5", "1e3", "12,", "1.2.3"]) expect(leesBedrag(t), t).toBeNull();
    const goed = valideerPakket({ prijs: " 59,50 ", looptijd: " 3 ", label: "  Nieuw  ", onderdelen: "2 vragenlijsten\n\n  20 vragen  \n" });
    expect(goed).toEqual({ ok: true, waarde: { prijs: 59.5, minimaalMaanden: 3, label: "Nieuw", onderdelen: ["2 vragenlijsten", "20 vragen"] } });
    // leeg = op aanvraag en geen looptijd
    expect(valideerPakket({ ...basis, prijs: "", looptijd: "" })).toMatchObject({ ok: true, waarde: { prijs: null, minimaalMaanden: null } });
    expect(valideerPakket({ ...basis, prijs: "100000" })).toMatchObject({ ok: true, waarde: { prijs: 100000 } });
    expect(valideerPakket({ ...basis, prijs: "100000,01" })).toMatchObject({ ok: false, veld: "prijs" });
    expect(valideerPakket({ ...basis, prijs: "12,345" })).toMatchObject({ ok: false, veld: "prijs" });
    for (const l of ["0", "61", "1,5", "een"]) expect(valideerPakket({ ...basis, looptijd: l }), l).toMatchObject({ ok: false, veld: "looptijd" });
    for (const l of ["1", "60"]) expect(valideerPakket({ ...basis, looptijd: l }), l).toMatchObject({ ok: true });
    expect(valideerPakket({ ...basis, label: " " })).toMatchObject({ ok: false, veld: "label" });
    expect(valideerPakket({ ...basis, label: "x".repeat(31) })).toMatchObject({ ok: false, veld: "label" });
    expect(valideerPakket({ ...basis, onderdelen: Array.from({ length: 13 }, (_, i) => `onderdeel ${i}`).join("\n") })).toMatchObject({ ok: false, veld: "onderdelen" });
    expect(valideerPakket({ ...basis, onderdelen: Array.from({ length: 12 }, (_, i) => `onderdeel ${i}`).join("\n") })).toMatchObject({ ok: true });
    expect(valideerPakket({ ...basis, onderdelen: "x".repeat(121) })).toMatchObject({ ok: false, veld: "onderdelen" });
    expect(valideerPakket({ ...basis, onderdelen: "x".repeat(120) })).toMatchObject({ ok: true });
    // de standaard zelf komt ongewijzigd door de controle
    for (const p of PAKKETTEN) expect(valideerPakket(alsInvoer(p)), p.id).toEqual({ ok: true, waarde: { prijs: p.prijs, minimaalMaanden: p.minimaalMaanden, label: p.label, onderdelen: [...p.onderdelen] } });
  });

  it("samenvoegen: alleen wat is overschreven wijkt af; naam, id en uitleg blijven", () => {
    expect(metOverschrijvingen({})).toEqual(PAKKETTEN);
    const o = metOverschrijvingen({ iso: { prijs: 199, label: "Actie" }, maatwerk: { prijs: 0 }, basis: { prijs: null, minimaalMaanden: null, onderdelen: [] } });
    expect(o.map((p) => [p.id, p.naam])).toEqual(PAKKETTEN.map((p) => [p.id, p.naam]));
    expect(o[1]).toEqual({ ...PAKKETTEN[1], prijs: 199, label: "Actie" });
    expect(o[3]).toEqual({ ...PAKKETTEN[3], prijs: 0 });
    expect(o[0]).toMatchObject({ prijs: null, minimaalMaanden: null, onderdelen: [] });
    expect(o[2]).toEqual(PAKKETTEN[2]);
    // de constante zelf is niet geraakt
    expect(PAKKETTEN[1]?.label).toBe("Meest gebruikt");
  });

  it("wat in de opslag niet klopt, wordt overgeslagen", () => {
    expect(leesOverschrijvingen(null)).toEqual({});
    expect(leesOverschrijvingen("kapot")).toEqual({});
    expect(
      leesOverschrijvingen({
        basis: { prijs: -1, minimaalMaanden: 99, label: "", onderdelen: "geen lijst" },
        iso: { prijs: 199.999, minimaalMaanden: 3, label: " Actie ", onderdelen: ["a", 5] },
        mkb: { prijs: null, onderdelen: ["Eén", " Twee "] },
        constructor: { prijs: 1 },
        onbekend: { prijs: 1 },
      }),
    ).toEqual({ iso: { prijs: 200, minimaalMaanden: 3, label: "Actie" }, mkb: { prijs: null, onderdelen: ["Eén", "Twee"] } });
  });

  it("bewaren: site, veelgestelde vragen en chat zeggen daarna hetzelfde; terug naar de standaard haalt het weg", async () => {
    expect(await smileyappPakketten()).toEqual(PAKKETTEN);
    await bewaarPakket("iso", { prijs: "199", looptijd: "3", label: "Actie", onderdelen: "10 vragenlijsten\n1.000 beoordelingen\nMeerdere gebruikers" });
    await bewaarPakket("mkb", { ...alsInvoer(PAKKETTEN[2] as Pakket), prijs: "" });
    expect([...h.kv.keys()]).toEqual(["voorstel-smileyapp:pakketten"]);
    const nu = await smileyappPakketten();
    const iso = pakket("iso", nu);
    expect(iso).toMatchObject({ prijs: 199, minimaalMaanden: 3, label: "Actie", naam: "ISO Pakket" });
    expect(prijsTekst(iso as Pakket)).toBe(euro(199));
    expect(prijsTekst(pakket("mkb", nu) as Pakket)).toBe("Op aanvraag");
    expect((await pakkettenVoorBeheer()).aangepast).toEqual(["iso", "mkb"]);

    const kost = veelgesteld(nu).find((v) => v.vraag === "Wat kost Smileyapp?")?.antwoord ?? "";
    const loopt = veelgesteld(nu).find((v) => v.vraag === "Hoe lang loopt een pakket minimaal?")?.antwoord ?? "";
    const chat = smileyappKennis({ pakketten: nu }).fragmenten;
    const prijzen = chat.find((f) => f.titel === "Pakketten en prijzen")?.tekst ?? "";
    for (const p of nu) {
      const bedrag = p.prijs === null ? "op aanvraag" : euro(p.prijs);
      expect(kost, p.naam).toContain(`${p.naam}: ${p.prijs === null ? "prijs op aanvraag" : bedrag}`);
      expect(prijzen, p.naam).toContain(bedrag);
    }
    // de oude prijs van het ISO Pakket staat nergens meer
    for (const tekst of [kost, prijzen, chat.find((f) => f.titel === "Pakket: ISO Pakket")?.tekst ?? "", chat.find((f) => f.titel === "Vraag: Wat kost Smileyapp?")?.tekst ?? ""]) {
      expect(tekst).toContain(euro(199));
      expect(tekst).not.toContain(euro(PAKKETTEN[1]?.prijs ?? 0));
    }
    expect(loopt).toContain("ISO Pakket: minimaal 3 maanden");
    expect(chat.find((f) => f.titel === "Pakket: ISO Pakket")?.tekst).toContain("minimaal 3 maanden");
    // zonder argument blijft alles de standaard (zo blijven de bestaande bewakers geldig)
    expect(veelgesteld()).toEqual(veelgesteld(PAKKETTEN));
    expect(smileyappKennis().fragmenten).toEqual(smileyappKennis({ pakketten: PAKKETTEN }).fragmenten);

    // een fout bewaart niets
    expect((await fout(bewaarPakket("iso", { prijs: "veel", looptijd: "3", label: "Actie", onderdelen: "" }))).status).toBe(422);
    expect(pakket("iso", await smileyappPakketten())?.prijs).toBe(199);
    // weer gelijk aan de standaard: de overschrijving verdwijnt vanzelf
    await bewaarPakket("iso", alsInvoer(PAKKETTEN[1] as Pakket));
    expect((await pakkettenVoorBeheer()).aangepast).toEqual(["mkb"]);
    await herstelPakketten("mkb");
    expect(h.kv.size).toBe(0);
    await bewaarPakket("basis", { ...basis, prijs: "10" });
    await herstelPakketten();
    expect(h.kv.size).toBe(0);
    expect(await smileyappPakketten()).toEqual(PAKKETTEN);
    // een kapotte rij in de opslag haalt de site niet onderuit
    h.kv.set("voorstel-smileyapp:pakketten", "kapot");
    expect(await smileyappPakketten()).toEqual(PAKKETTEN);
  });

  it("elke plek die een pakket of prijs toont, leest dezelfde bron", () => {
    const home = lees("app/voorstel/smileyapp/page.tsx");
    expect(home).toContain('export const dynamic = "force-dynamic";');
    expect(home).toContain("await Promise.all([smileyappPakketten(), zichtbareBerichten()])");
    expect(home).toContain("const vragen = veelgesteld(pakketten);");
    expect(home).toContain("{pakketten.map((p) => (");
    expect(home).not.toMatch(/\bPAKKETTEN\b/);
    expect(lees("app/voorstel/smileyapp/contact/page.tsx")).toContain("pakket(Array.isArray(q) ? q[0] : q, await smileyappPakketten())");
    const demo = lees("app/voorstel/smileyapp/demo/page.tsx");
    expect(demo).toContain('export const dynamic = "force-dynamic";');
    expect(demo).toContain("pakket(Array.isArray(q) ? q[0] : q, pakketten)");
    // deel 6a (19 nov 2026): de chat krijgt naast de pakketten ook de veelgestelde vragen van het team (smileyappVragen).
    // Was: "smileyappKennis({ medewerker, pakketten: await smileyappPakketten() })".
    expect(lees("app/api/voorstel/smileyapp/chat/route.ts")).toContain("const pakketten = await smileyappPakketten();");
    expect(lees("app/api/voorstel/smileyapp/chat/route.ts")).toContain("smileyappKennis({ medewerker, pakketten, vragen: await smileyappVragen(veelgesteld(pakketten)) })");
    expect(lees("lib/voorstel/smileyapp-pakketten.ts")).toContain('const SLEUTEL = "voorstel-smileyapp:pakketten";');
  });
});

describe("bezoekcijfers", () => {
  it("alleen paden binnen het voorstel uit de vaste lijst; het beheer en onbekende adressen tellen niet", () => {
    expect(telPad(BASE)).toBe("/");
    expect(telPad("/")).toBe("/");
    expect(telPad(`${BASE}/demo`)).toBe("/demo");
    expect(telPad("/demo/")).toBe("/demo");
    expect(telPad(`${BASE}/blog/${BLOG[0]?.slug ?? ""}`)).toBe(`/blog/${BLOG[0]?.slug ?? ""}`);
    // een eigen bericht: één gezamenlijke teller, zodat niemand de lijst kan volschrijven met verzonnen adressen
    expect(telPad("/blog/een-eigen-bericht")).toBe(EIGEN_BLOG);
    expect(telPad("/branches/horeca")).toBe("/branches/horeca");
    expect(telPad("/klanten")).toBe("/klanten");
    for (const p of ["/beheer", `${BASE}/beheer`, "/beheer/x", "/branches/constructor", "/branches/onbekend", "/bestaat-niet", "/demo?bron=beurs", "/demo#x", "demo", "/blog/Een Bericht", "/voorstel/schwarzwald", "/admin", "", "/" + "x".repeat(300)]) {
      expect(telPad(p), p).toBeNull();
    }
    for (const p of [null, undefined, 5, {}, ["/"]]) expect(telPad(p)).toBeNull();
    expect(paginaNaam("/demo")).toBe("Demo aanvragen");
    expect(paginaNaam("/branches/zorg")).toBe("Branche: Zorg");
    expect(paginaNaam(EIGEN_BLOG)).toBe("Blog: eigen berichten");
  });

  it("robots tellen niet", () => {
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
    expect(isMens(chrome, null)).toBe(true);
    expect(isMens("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", null)).toBe(true);
    expect(isMens("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", null)).toBe(false);
    expect(isMens("curl/8.4.0", null)).toBe(false);
    expect(isMens("WhatsApp/2.23", null)).toBe(false);
    expect(isMens(null, null)).toBe(false);
    expect(isMens(chrome, "prefetch")).toBe(false);
  });

  it("optellen: 30 dagen, top 5 en het percentage alleen als de demopagina bezocht is", () => {
    const dagen = ["2026-11-17", "2026-11-18", "2026-11-19"];
    const c = somCijfers(dagen, [
      { v: "10", e: "4", "p:/": "5", "p:/demo": "3", "p:/blog": "2", "p:/kwaad": "99" },
      null,
      { v: "7", e: "2", a: "1", "p:/demo": "1", "p:/": "2", "p:/klanten": "1", "p:/contact": "1", "p:/branches": "1", "p:/blog/*": "1" },
    ]);
    expect(c.dagen).toEqual([
      { dag: "2026-11-17", weergaven: 10, aanvragen: 0 },
      { dag: "2026-11-18", weergaven: 0, aanvragen: 0 },
      { dag: "2026-11-19", weergaven: 7, aanvragen: 1 },
    ]);
    expect([c.weergaven, c.binnenkomsten, c.aanvragen, c.demoWeergaven]).toEqual([17, 6, 1, 4]);
    expect(c.percentage).toBe(25);
    expect(c.paginas).toHaveLength(5);
    expect(c.paginas.slice(0, 3)).toEqual([
      { pad: "/", naam: "Voorpagina", weergaven: 7 },
      { pad: "/demo", naam: "Demo aanvragen", weergaven: 4 },
      { pad: "/blog", naam: "Blog", weergaven: 2 },
    ]);
    // een veld dat we niet zelf tellen komt niet op het scherm
    expect(c.paginas.map((p) => p.pad)).not.toContain("/kwaad");
    // niemand op de demopagina: geen percentage (ook niet 0% of oneindig)
    expect(somCijfers(["2026-11-19"], [{ v: "3", a: "1", "p:/": "3" }]).percentage).toBeNull();
    expect(somCijfers(["2026-11-19"], [null])).toMatchObject({ weergaven: 0, aanvragen: 0, percentage: null, paginas: [] });
    const scherm = lees("components/voorstel/smileyapp/beheer/Cijfers.tsx");
    expect(scherm).toContain("Dit zijn bezoeken, geen unieke personen.");
    expect(scherm).toContain("data.percentage === null");
  });

  it("de telroute: altijd 204, telt alleen een mens op een pagina van het voorstel, en bewaart geen IP of referrer", async () => {
    const { POST } = await import("@/app/api/voorstel/smileyapp/tel/route");
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
    const stuur = async (body: unknown, koppen: Record<string, string> = {}) =>
      (
        await POST(
          new Request("http://app:3000/api/voorstel/smileyapp/tel", {
            method: "POST",
            headers: { "content-type": "application/json", "x-forwarded-host": "smileyapp.zekerflex.com", origin: "https://smileyapp.zekerflex.com", "user-agent": chrome, referer: "https://www.google.com/search?q=geheim", ...koppen },
            body: typeof body === "string" ? body : JSON.stringify(body),
          }),
        )
      ).status;
    expect(await stuur({ pad: "/demo", buiten: true })).toBe(204);
    expect(await stuur({ pad: `${BASE}/blog`, buiten: "ja" })).toBe(204);
    expect(h.geteld).toEqual([
      { pad: "/demo", buiten: true },
      { pad: "/blog", buiten: false },
    ]);
    h.geteld.length = 0;
    // geweigerd, maar nooit een 403 of 429 (CrowdSec): andere website, robot, beheer, onbekend pad, kapotte body, limiet
    expect(await stuur({ pad: "/demo" }, { origin: "https://evil.example" })).toBe(204);
    expect(await stuur({ pad: "/demo" }, { "user-agent": "Mozilla/5.0 (compatible; bingbot/2.0)" })).toBe(204);
    expect(await stuur({ pad: "/beheer" })).toBe(204);
    expect(await stuur({ pad: "/bestaat-niet" })).toBe(204);
    expect(await stuur("{kapot")).toBe(204);
    expect(await stuur({ pad: "/demo" }, { "content-type": "text/plain" })).toBe(204);
    h.limiet = "smileyapp-tel";
    expect(await stuur({ pad: "/demo" })).toBe(204);
    expect(h.geteld).toEqual([]);

    const opslag = lees("lib/voorstel/smileyapp-cijfers.ts");
    expect(opslag).toContain("const sleutel = (dag: string) => `voorstel-smileyapp:cijfers:${dag}`;");
    expect(opslag).toContain("const BEWAAR_SECONDEN = 400 * 86_400;");
    // de opslag kent alleen tellers: geen IP, user-agent, referrer of cookie
    const zonderCommentaar = opslag.split("\n").filter((r) => !/^\s*(\/\/|\/\*\*|\*)/.test(r)).join("\n");
    expect(zonderCommentaar).not.toMatch(/\bip\b|userAgent|user-agent|referer|referrer|cookie/i);
    const route = lees("app/api/voorstel/smileyapp/tel/route.ts");
    expect(route).not.toMatch(/AppError|jsonError|status: 40[0-9]|status: 429/);
    expect(route).not.toMatch(/referer|referrer/i);
    const teller = lees("components/voorstel/smileyapp/SmileyTeller.tsx");
    expect(teller).toContain("const geteld = telPad(pad);");
    expect(teller).toContain("body: JSON.stringify({ pad: geteld, buiten })");
    expect(teller).not.toMatch(/localStorage|sessionStorage|document\.cookie|location\.search/);
    expect(lees("app/voorstel/smileyapp/layout.tsx")).toContain("<SmileyTeller />");
    // een demo-aanvraag telt mee, na het bewaren
    const aanvraag = lees("app/api/voorstel/smileyapp/aanvraag/route.ts");
    expect(aanvraag.indexOf("await maakAanvraag(")).toBeLessThan(aanvraag.indexOf("void telDemoAanvraag().catch(() => undefined);"));
  });
});

describe("QR-code naar de demo-aanvraag", () => {
  it("wijst naar de demo-aanvraag op het subdomein, met een bron als die klopt", () => {
    expect(DEMO_ADRES).toBe("https://smileyapp.zekerflex.com/demo");
    expect(demoQrAdres()).toBe("https://smileyapp.zekerflex.com/demo");
    expect(demoQrAdres(" Beurs-2026 ")).toBe("https://smileyapp.zekerflex.com/demo?bron=beurs-2026");
    for (const b of ["met spatie", "a&b=c", "x".repeat(31), "-streep", "streep-", "a--b", "é", ""]) expect(demoQrAdres(b), b).toBe(DEMO_ADRES);
    expect(leesBron("x".repeat(30))).toBe("x".repeat(30));
    expect(leesBron(5)).toBeUndefined();
    const { adres, pad, zijde } = demoQr("beurs");
    expect(adres).toBe("https://smileyapp.zekerflex.com/demo?bron=beurs");
    expect(zijde).toBeGreaterThan(21 + 8 - 1);
    expect(pad).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
    // een andere inhoud geeft een andere code
    expect(demoQr().pad).not.toBe(pad);
    const svg = demoQrSvg("beurs");
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(`d="${pad}"`);
    expect(svg).toContain("#0E2A20");
    expect(qrBestandsnaam("beurs", "png")).toBe("smileyapp-demo-qr-beurs.png");
    expect(qrBestandsnaam('x"; rm', "svg")).toBe("smileyapp-demo-qr.svg");
  });

  it("de bron gaat mee met de aanvraag; een bron die niet klopt valt weg zonder de aanvraag tegen te houden", () => {
    const basis = { soort: "demo", naam: "Jan Jansen", bedrijf: "Bakkerij Jansen", email: "jan@bakkerij.test", toestemming: true };
    expect(valideerAanvraag({ ...basis, bron: " Beurs " }, NU)).toMatchObject({ ok: true, waarde: { bron: "beurs" } });
    const zonder = valideerAanvraag({ ...basis, bron: "<script>" }, NU);
    expect(zonder).toMatchObject({ ok: true });
    expect(zonder.ok && "bron" in zonder.waarde).toBe(false);
    const demo = lees("app/voorstel/smileyapp/demo/page.tsx");
    expect(demo).toContain("const bron = leesBron(Array.isArray(sp.bron) ? sp.bron[0] : sp.bron);");
    expect(lees("components/voorstel/smileyapp/AanvraagFormulier.tsx")).toContain("...(bron ? { bron } : {})");
    expect(lees("components/voorstel/smileyapp/beheer/Aanvragen.tsx")).toContain("<dd className=\"font-semibold\">{a.bron}</dd>");
  });

  it("de bestandsroute: zonder punt in het pad, met Content-Disposition, alleen voor het team", () => {
    const pad = "app/api/voorstel/smileyapp/beheer/qr/route.ts";
    expect(path.dirname(pad).replace("app/api", "/api")).not.toContain(".");
    const r = lees(pad);
    expect(r.indexOf("await smileyPoort(request);")).toBeGreaterThan(0);
    expect(r.indexOf("await smileyPoort(request);")).toBeLessThan(r.indexOf("await eisToegang();"));
    expect(r.indexOf("await eisToegang();")).toBeLessThan(r.indexOf("searchParams"));
    expect(r).toContain('"Content-Disposition": `attachment; filename="${qrBestandsnaam(bron, vorm)}"`');
    expect(r).toContain('"X-Content-Type-Options": "nosniff"');
    const scherm = lees("components/voorstel/smileyapp/beheer/QrCode.tsx");
    expect(scherm).toContain("`${BEHEER_API}/qr?vorm=${vorm}${bron ? `&bron=${bron}` : \"\"}`");
    expect(scherm).toContain("Scan en vraag een <span className=\"text-smiley-sun\">demo</span> aan");
    expect(scherm).toContain("sm-print-kaart");
    expect(lees("app/voorstel/smileyapp/smiley.css")).toContain("@page smkaart { size: A5 portrait; margin: 0; }");
  });
});

describe("bronbewakers deel 2", () => {
  const loop = (map: string, filter: (naam: string) => boolean): string[] =>
    readdirSync(path.join(ROOT, map)).flatMap((naam) => {
      const rel = `${map}/${naam}`;
      return statSync(path.join(ROOT, rel)).isDirectory() ? loop(rel, filter) : filter(naam) ? [rel] : [];
    });
  const ROUTES = loop("app/api/voorstel/smileyapp", (n) => n === "route.ts");
  const NIEUW = ["app/api/voorstel/smileyapp/beheer/inhoud/route.ts", "app/api/voorstel/smileyapp/beheer/qr/route.ts", "app/api/voorstel/smileyapp/tel/route.ts"];
  const handlers = (s: string) => s.split(/\nexport async function /).slice(1);

  it("elke nieuwe route controleert de herkomst en heeft een limiet, vóór er een body gelezen wordt", () => {
    for (const r of NIEUW) expect(ROUTES, r).toContain(r);
    for (const r of NIEUW) {
      const s = lees(r);
      expect(s, r).not.toMatch(/request\.(json|text|formData|arrayBuffer|blob)\(/);
      const lijst = handlers(s);
      expect(lijst.length, r).toBeGreaterThanOrEqual(1);
      for (const hnd of lijst) {
        const poort = hnd.indexOf("await smileyPoort(request");
        const herkomst = poort >= 0 ? poort : hnd.indexOf("zelfdeHerkomst(request.headers, request.url)");
        const limiet = poort >= 0 ? poort : hnd.indexOf("await enforceRateLimit(");
        expect(herkomst, `${r}: herkomst`).toBeGreaterThanOrEqual(0);
        expect(limiet, `${r}: limiet`).toBeGreaterThanOrEqual(0);
        const body = hnd.indexOf("await jsonBegrensd(");
        if (body >= 0) {
          expect(herkomst, r).toBeLessThan(body);
          expect(limiet, r).toBeLessThan(body);
        }
      }
    }
    expect(lees("app/api/voorstel/smileyapp/tel/route.ts")).toMatch(/name: "smileyapp-tel", identifier: clientIp\(request\), limit: 60, windowSeconds: 600/);
    expect(lees("app/api/voorstel/smileyapp/beheer/inhoud/route.ts")).toMatch(/name: "smileyapp-inhoud", identifier: ik\.id, limit: 120, windowSeconds: 3600/);
  });

  it("de QR- en inhoudroutes eisen een sessie vóór er iets gelezen of geschreven wordt", () => {
    for (const r of NIEUW.filter((x) => x.includes("/beheer/"))) {
      for (const hnd of handlers(lees(r))) {
        const naam = hnd.slice(0, hnd.indexOf("("));
        const poort = hnd.indexOf("await smileyPoort(request");
        const sessie = hnd.indexOf("await eisToegang()");
        expect(poort, `${r} ${naam}`).toBeGreaterThanOrEqual(0);
        expect(sessie, `${r} ${naam}: sessie`).toBeGreaterThan(poort);
        expect(hnd.slice(0, sessie), `${r} ${naam}`).not.toMatch(/Cijfers\(|Berichten\(|Pakket|searchParams|jsonBegrensd/);
      }
      expect(lees(r), r).not.toContain("AppError.forbidden");
    }
  });

  it("nergens een prijs buiten lib/voorstel/smileyapp.ts, en nergens een canonical of JSON-LD", () => {
    const code = [
      ...loop("app/voorstel/smileyapp", (n) => /\.(ts|tsx|css)$/.test(n)),
      ...loop("components/voorstel/smileyapp", (n) => /\.(ts|tsx)$/.test(n)),
      ...ROUTES,
      ...readdirSync(path.join(ROOT, "lib/voorstel")).filter((n) => n.startsWith("smileyapp-")).map((n) => `lib/voorstel/${n}`),
    ];
    expect(code.length).toBeGreaterThan(55);
    for (const f of code) {
      const s = lees(f);
      expect(s, f).not.toMatch(BEDRAG);
      expect(s, f).not.toMatch(/canonical\(|LocalBusiness|application\/ld\+json|ldJson\(/);
    }
  });

  it("de nieuwe pagina's: één kop, een knop naar de demo, en geen <form> in de nieuwe onderdelen", () => {
    for (const p of ["app/voorstel/smileyapp/branches/page.tsx", "app/voorstel/smileyapp/branches/[slug]/page.tsx", "app/voorstel/smileyapp/klanten/page.tsx"]) {
      const s = lees(p);
      expect(s.match(/<h1[\s>]/g) ?? [], p).toHaveLength(1);
      expect(s, p).toContain("href={`${BASE}/demo`}");
    }
    for (const f of ["PakketKiezer.tsx", "ProbeerZelf.tsx", "SmileyTeller.tsx", "beheer/BlogBeheer.tsx", "beheer/PakkettenBeheer.tsx", "beheer/QrCode.tsx", "beheer/Cijfers.tsx"]) {
      const s = lees(`components/voorstel/smileyapp/${f}`);
      expect(s, f).not.toMatch(/<form[\s>]|<h1[\s>]/);
      // client-onderdelen laden niets van de server
      expect(s, f).not.toMatch(/from "@\/lib\/(storage|prisma|mail|redis|voorstel\/smileyapp-(accounts|aanvragen|blog|pakketten|cijfers|poort|mail))"/);
    }
  });

  it("probeer het zelf: alles in de browser, met toetsenbord en knoppen, en duidelijk een voorbeeld", () => {
    const s = lees("components/voorstel/smileyapp/ProbeerZelf.tsx");
    expect(s).not.toMatch(/fetch\(|localStorage|sessionStorage|document\.cookie/);
    expect(s).toContain('role="slider"');
    expect(s).toContain("ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1");
    // 19 nov 2026 (deel 3, talen): de teksten zijn een prop met de Nederlandse standaard uit smileyapp-teksten.ts.
    // Was: de twee zinnen letterlijk in het onderdeel (aria-label="Kies een cijfer van 1 tot 10" en de staafjes-zin).
    expect(s).toContain("aria-label={t.kiesCijfer}");
    expect(s).toContain("teksten: t = PROBEER_NL");
    expect(PROBEER_NL.kiesCijfer).toBe("Kies een cijfer van 1 tot 10");
    expect(PROBEER_NL.staafjes).toContain("De staafjes zijn voorbeeldcijfers, geen echte resultaten.");
    // beweging alleen als de bezoeker dat niet heeft uitgezet
    expect(s.match(/transition-\[height/g)).toHaveLength(1);
    expect(s).toContain("motion-safe:transition-[height,background-color]");
    expect(lees("app/voorstel/smileyapp/page.tsx")).toContain("<ProbeerZelf vraag={VOORBEELDVRAAG} />");
  });
});
