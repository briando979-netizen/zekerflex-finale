import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FLAG_REGISTRY } from "@/lib/flags";
import { isAutomatedKind } from "@/lib/mail/categories";
import { eigenNaamruimte, veiligeMapNaam } from "@/lib/mail/imap";
import { INFO_MAPPEN, antwoordOnderwerp, antwoordTekst, automatischeReden, deelIn, kopVeld, maskeerAdres } from "@/lib/mail/info-indeling";
import {
  ANTWOORD_VENSTER_DAGEN,
  INFO_MAIL_VLAG,
  MAX_ANTWOORDEN_PER_UUR,
  loopInfoNa,
  type InfoAfhankelijkheden,
  type InfoAntwoord,
  type InfoEnvelop,
  type InfoMerk,
  type InfoStand,
} from "@/lib/mail/info-ronde";

// De info-ronde (18 nov 2026): de postbus info@ indelen, automatische mails apart, één eerste antwoord aan wie werk
// zoekt en een melding bij een bedrijf. Standaard de proefstand: dan gebeurt er niets met de postbus.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const NU = new Date("2026-11-18T15:00:00+01:00");
const GISTEREN = "Tue, 17 Nov 2026 10:00:00 +0100";
const mensKop = "From: Jan <jan@voorbeeld.test>\r\nSubject: vraag\r\nContent-Type: text/plain\r\n";

describe("indelen van een mail aan info@", () => {
  it("noreply, mailer-daemon en een eigen afzender zijn automatisch", () => {
    expect(deelIn({ vanAdres: "noreply@bedrijf.test", onderwerp: "Je bestelling", kop: mensKop }).soort).toBe("automatisch");
    expect(deelIn({ vanAdres: "no-reply+abc@bedrijf.test", onderwerp: "Welkom", kop: mensKop }).soort).toBe("automatisch");
    expect(deelIn({ vanAdres: "nieuwsbrief@zekerflex.com", onderwerp: "Ik zoek werk", kop: mensKop }).soort).toBe("automatisch");
    expect(deelIn({ vanAdres: "MAILER-DAEMON@mx.test", onderwerp: "Undelivered Mail Returned to Sender", kop: mensKop }).soort).toBe("terugkaatser");
  });

  it("een terugkaatser is ook aan de kop te herkennen", () => {
    const kop = 'From: bezorging@mx.test\r\nContent-Type: multipart/report; report-type=delivery-status;\r\n boundary="x"\r\n';
    expect(deelIn({ vanAdres: "bezorging@mx.test", onderwerp: "Bericht", kop }).soort).toBe("terugkaatser");
  });

  it("een lijstmail of automatisch antwoord is automatisch, ook als hij over werk gaat", () => {
    const basis = { vanAdres: "piet@voorbeeld.test", onderwerp: "Ik zoek werk" };
    expect(deelIn({ ...basis, kop: `${mensKop}List-Unsubscribe: <https://voorbeeld.test/af>\r\n` }).soort).toBe("automatisch");
    expect(deelIn({ ...basis, kop: `${mensKop}Precedence: bulk\r\n` }).soort).toBe("automatisch");
    expect(deelIn({ ...basis, kop: `${mensKop}Auto-Submitted: auto-replied\r\n` }).soort).toBe("automatisch");
    expect(automatischeReden("piet@voorbeeld.test", `${mensKop}Auto-Submitted: no\r\n`)).toBeNull();
  });

  it('"netwerk" is geen werk, en een los woord "werk" ook niet', () => {
    expect(deelIn({ vanAdres: "piet@voorbeeld.test", onderwerp: "Vraag over jullie netwerk", kop: mensKop, tekst: "Ons netwerk is traag." }).soort).toBe("rest");
    expect(deelIn({ vanAdres: "piet@voorbeeld.test", onderwerp: "De app werkt niet", kop: mensKop, tekst: "Het inloggen werkt niet op mijn werk." }).soort).toBe("rest");
  });

  it("een echte werkzoeker wordt herkend, in het onderwerp of het begin van de tekst", () => {
    const m = (onderwerp: string, tekst = "") => deelIn({ vanAdres: "piet@voorbeeld.test", onderwerp, kop: mensKop, tekst }).soort;
    expect(m("Ik zoek werk")).toBe("werkzoekend");
    expect(m("Sollicitatie")).toBe("werkzoekend");
    expect(m("Hallo", "Goedemiddag, ik ben op zoek naar een bijbaan in Groningen.")).toBe("werkzoekend");
    expect(m("Vraag", "Kan ik bij jullie werken?")).toBe("werkzoekend");
    expect(m("Hello", "I am looking for a job in the Netherlands")).toBe("werkzoekend");
  });

  it("geciteerde tekst van een oude mail telt niet mee", () => {
    expect(deelIn({ vanAdres: "piet@voorbeeld.test", onderwerp: "Re: factuur", kop: mensKop, tekst: "Dank je.\n> Ik zoek werk" }).soort).toBe("rest");
  });

  it("een bedrijf gaat vóór werkzoekend en krijgt dus nooit het automatische antwoord", () => {
    const m = (onderwerp: string, tekst = "") => deelIn({ vanAdres: "info@bakker.test", onderwerp, kop: mensKop, tekst }).soort;
    expect(m("Personeel nodig voor december")).toBe("bedrijf");
    expect(m("Vacature plaatsen")).toBe("bedrijf");
    expect(m("Offerte uitzendkrachten")).toBe("bedrijf");
    expect(m("Vraag", "Wij zoeken drie mensen voor ons magazijn, kunnen jullie werk aanbieden?")).toBe("bedrijf");
  });

  it("een afwijkend antwoordadres krijgt geen automatisch antwoord", () => {
    expect(deelIn({ vanAdres: "piet@voorbeeld.test", replyTo: "lijst@groep.test", onderwerp: "Ik zoek werk", kop: mensKop }).soort).toBe("rest");
  });

  it("kopregels worden ontvouwen en adressen gemaskeerd", () => {
    expect(kopVeld("Subject: een\r\n twee\r\nX: y\r\n", "subject")).toBe("een twee");
    expect(maskeerAdres("Jan.Jansen@Gmail.com")).toBe("j***@gmail.com");
    expect(maskeerAdres(null)).toBe("onbekend");
  });
});

describe("het eerste antwoord", () => {
  it("is kort, eerlijk en zonder streepjes als scheidingsteken", () => {
    const t = antwoordTekst();
    expect(t).toContain("https://zekerflex.com/register");
    expect(t).toContain("nog in opbouw");
    expect(t).toContain("ID controleren");
    expect(t).toContain("automatisch verstuurd");
    expect(t).not.toMatch(/[—–]|^-{2,}/m);
    expect(t).not.toMatch(/verzeker|garan|bank|voorschot|direct uitbetaald/i);
    expect(t.length).toBeLessThan(900);
  });

  it('het onderwerp wordt "Re:" plus het oude onderwerp, één keer', () => {
    expect(antwoordOnderwerp("Ik zoek werk")).toBe("Re: Ik zoek werk");
    expect(antwoordOnderwerp("RE: Re: Ik zoek werk")).toBe("Re: Ik zoek werk");
    expect(antwoordOnderwerp("werk\r\nBcc: x@y.test")).not.toMatch(/[\r\n]/);
    expect(antwoordOnderwerp(null)).toBe("Re: je bericht aan ZekerFlex");
  });
});

// ---- de ronde, met een postbus van karton -----------------------------------------------------------------------

interface Nep {
  d: InfoAfhankelijkheden;
  verplaatst: { uid: number; map: string }[];
  verstuurd: InfoAntwoord[];
  gemeld: string[];
  merken: Map<number, InfoMerk>;
  beantwoord: Set<string>;
  stand: () => InfoStand | null;
}

function nep(opties: { aan: boolean; lijst: InfoEnvelop[]; koppen?: Record<number, string>; teksten?: Record<number, string>; bounceVerwerkt?: number[]; uur?: number }): Nep {
  const verplaatst: Nep["verplaatst"] = [];
  const verstuurd: InfoAntwoord[] = [];
  const gemeld: string[] = [];
  const merken = new Map<number, InfoMerk>();
  const beantwoord = new Set<string>();
  let stand: InfoStand | null = null;
  let uur = opties.uur ?? 0;
  const d: InfoAfhankelijkheden = {
    aan: async () => opties.aan,
    lijst: async () => opties.lijst,
    kop: async (uid) => opties.koppen?.[uid] ?? mensKop,
    tekst: async (uid) => opties.teksten?.[uid] ?? "",
    merk: async (uid) => merken.get(uid) ?? null,
    zetMerk: async (uid, m) => void merken.set(uid, m),
    bounceVerwerkt: async (uid) => (opties.bounceVerwerkt ?? []).includes(uid),
    verplaats: async (uid, map) => {
      verplaatst.push({ uid, map });
      return true;
    },
    markeerBeantwoord: async () => undefined,
    alGeantwoord: async (adres) => beantwoord.has(adres),
    onthoudAntwoord: async (adres) => void beantwoord.add(adres),
    antwoordenDitUur: async () => uur,
    telAntwoord: async () => void (uur += 1),
    stuur: async (a) => {
      verstuurd.push(a);
      return true;
    },
    meld: async (afzender, onderwerp) => {
      gemeld.push(`${afzender}: ${onderwerp}`);
      return true;
    },
    vorigeStand: async () => stand,
    bewaar: async (s) => void (stand = s),
    ruimOp: async () => undefined,
  };
  return { d, verplaatst, verstuurd, gemeld, merken, beantwoord, stand: () => stand };
}

const mail = (uid: number, van: string, onderwerp: string, extra: Partial<InfoEnvelop> = {}): InfoEnvelop => ({
  uid,
  date: GISTEREN,
  fromAddress: van,
  fromName: null,
  replyToAddress: null,
  subject: onderwerp,
  messageId: `m${uid}@voorbeeld.test`,
  ...extra,
});

const POSTBUS = [
  mail(1, "noreply@winkel.test", "Je pakket is onderweg"),
  mail(2, "mailer-daemon@mx.test", "Undelivered Mail Returned to Sender"),
  mail(3, "piet@voorbeeld.test", "Ik zoek werk"),
  mail(4, "info@bakker.test", "Personeel nodig", { fromName: "Bakker Jansen" }),
  mail(5, "klant@voorbeeld.test", "Vraag over mijn factuur"),
];

describe("de info-ronde", () => {
  it("proefstand: deelt in en schrijft op, maar verplaatst, verstuurt en meldt niets", async () => {
    const n = nep({ aan: false, lijst: POSTBUS });
    const s = await loopInfoNa(n.d, NU);
    expect(s.proef).toBe(true);
    expect(s.nieuw).toBe(5);
    expect(s.perSoort).toEqual({ terugkaatser: 1, automatisch: 1, bedrijf: 1, werkzoekend: 1, rest: 1 });
    expect(n.verplaatst).toEqual([]);
    expect(n.verstuurd).toEqual([]);
    expect(n.gemeld).toEqual([]);
    expect(s.beslissingen).toHaveLength(5);
    expect(s.beslissingen.every((b) => !b.echt)).toBe(true);
    expect(s.beslissingen.find((b) => b.soort === "werkzoekend")?.actie).toContain("zou het eerste antwoord");
    // nergens een volledig adres
    expect(JSON.stringify(s)).not.toMatch(/piet@|info@bakker|klant@|noreply@|mailer-daemon@/);
    expect(s.voorbeeld.tekst).toContain("zekerflex.com/register");
  });

  it("proefstand: een tweede ronde bekijkt dezelfde mails niet opnieuw", async () => {
    const n = nep({ aan: false, lijst: POSTBUS });
    await loopInfoNa(n.d, NU);
    const s = await loopInfoNa(n.d, NU);
    expect(s.nieuw).toBe(0);
    expect(s.beslissingen).toHaveLength(5);
  });

  it("echt: automatisch naar de map, antwoord aan de werkzoeker, melding bij het bedrijf, de rest blijft staan", async () => {
    const n = nep({ aan: true, lijst: POSTBUS, bounceVerwerkt: [2] });
    const s = await loopInfoNa(n.d, NU);
    expect(s.proef).toBe(false);
    expect(n.verplaatst).toEqual([
      { uid: 1, map: INFO_MAPPEN.automatisch },
      { uid: 2, map: INFO_MAPPEN.terugkaatsers },
      { uid: 3, map: INFO_MAPPEN.beantwoord },
    ]);
    expect(n.verstuurd).toEqual([{ aan: "piet@voorbeeld.test", onderwerp: "Re: Ik zoek werk", tekst: antwoordTekst(), inReplyTo: "m3@voorbeeld.test" }]);
    expect(n.gemeld).toEqual(["Bakker Jansen: Personeel nodig"]);
    expect(s.gedaan).toEqual({ verplaatst: 3, beantwoord: 1, gemeld: 1 });
  });

  it("echt na proef: wat in de proef alleen bekeken was, wordt nu echt afgehandeld", async () => {
    const n = nep({ aan: false, lijst: POSTBUS, bounceVerwerkt: [2] });
    await loopInfoNa(n.d, NU);
    const echt = { ...n.d, aan: async () => true };
    await loopInfoNa(echt, NU);
    expect(n.verstuurd).toHaveLength(1);
    await loopInfoNa(echt, NU);
    expect(n.verstuurd).toHaveLength(1);
  });

  it("een terugkaatser blijft staan tot de bounce-ronde hem verwerkt heeft", async () => {
    const n = nep({ aan: true, lijst: [POSTBUS[1]!] });
    const s = await loopInfoNa(n.d, NU);
    expect(n.verplaatst).toEqual([]);
    expect(s.nieuw).toBe(0);
    expect(n.merken.has(2)).toBe(false);
  });

  it("een automatische mail met een bijlage blijft staan (kan een factuur zijn)", async () => {
    const n = nep({ aan: true, lijst: [POSTBUS[0]!], koppen: { 1: 'Content-Type: multipart/mixed; boundary="b"\r\n' } });
    const s = await loopInfoNa(n.d, NU);
    expect(n.verplaatst).toEqual([]);
    expect(s.beslissingen[0]?.actie).toContain("bijlage");
  });

  it("nooit twee keer hetzelfde adres binnen 30 dagen", async () => {
    const n = nep({ aan: true, lijst: [mail(3, "piet@voorbeeld.test", "Ik zoek werk"), mail(6, "Piet@Voorbeeld.test", "Nog steeds op zoek naar werk")] });
    const s = await loopInfoNa(n.d, NU);
    expect(n.verstuurd).toHaveLength(1);
    expect(s.beslissingen.some((b) => b.actie.includes(`laatste ${ANTWOORD_VENSTER_DAGEN} dagen`))).toBe(true);
  });

  it("geen antwoord op een mail die de eigenaar al beantwoordde", async () => {
    const n = nep({ aan: true, lijst: [mail(3, "piet@voorbeeld.test", "Ik zoek werk", { answered: true })] });
    await loopInfoNa(n.d, NU);
    expect(n.verstuurd).toEqual([]);
  });

  it("nooit op een mail ouder dan 3 dagen, of zonder leesbare datum", async () => {
    const n = nep({ aan: true, lijst: [mail(3, "piet@voorbeeld.test", "Ik zoek werk", { date: "Sat, 14 Nov 2026 10:00:00 +0100" }), mail(7, "kees@voorbeeld.test", "Ik zoek werk", { date: null })] });
    const s = await loopInfoNa(n.d, NU);
    expect(s.nieuw).toBe(0);
    expect(n.verstuurd).toEqual([]);
  });

  it("hooguit 20 antwoorden per uur; wie te veel is, komt later aan de beurt", async () => {
    const n = nep({ aan: true, lijst: [mail(3, "piet@voorbeeld.test", "Ik zoek werk"), mail(8, "kees@voorbeeld.test", "Ik zoek werk")], uur: MAX_ANTWOORDEN_PER_UUR - 1 });
    await loopInfoNa(n.d, NU);
    expect(n.verstuurd.map((a) => a.aan)).toEqual(["piet@voorbeeld.test"]);
    expect(n.merken.has(8)).toBe(false);
  });

  it("een postbus die niet te lezen is, geeft een stand met de reden en breekt niets", async () => {
    const n = nep({ aan: true, lijst: [] });
    const s = await loopInfoNa({ ...n.d, lijst: async () => Promise.reject(Object.assign(new Error("x"), { name: "GeenPostbus" })) }, NU);
    expect(s.fout).toContain("GeenPostbus");
  });
});

describe("inbouw", () => {
  it("de vlag staat standaard uit (proef)", () => {
    expect(FLAG_REGISTRY.find((f) => f.key === INFO_MAIL_VLAG)?.default).toBe(false);
  });

  it("het antwoord is een mail waarop een mens antwoorden leest, met de kopregels van een automatisch antwoord", () => {
    expect(isAutomatedKind("info-antwoord")).toBe(false);
    const mail = lees("lib/mail/index.ts");
    expect(mail).toContain("Auto-Submitted: auto-replied");
    expect(mail).toContain("In-Reply-To: <${antwoordOp}>");
    const db = lees("lib/mail/info-ronde-db.ts");
    expect(db).toContain('kind: "info-antwoord"');
    expect(db).toContain("autoAntwoord: true");
  });

  it("verplaatsen gaat met MOVE en er wordt nergens iets verwijderd", () => {
    const imap = lees("lib/mail/imap.ts");
    expect(imap).toContain("UID MOVE");
    expect(imap).not.toMatch(/EXPUNGE|\\\\Deleted/);
    expect(eigenNaamruimte(['* NAMESPACE (("INBOX." ".")) NIL NIL', "z1 OK"])).toEqual({ voorvoegsel: "INBOX.", scheiding: "." });
    expect(eigenNaamruimte(['* NAMESPACE (("" "/")) NIL NIL'])).toEqual({ voorvoegsel: "", scheiding: "/" });
    expect(eigenNaamruimte([])).toEqual({ voorvoegsel: "", scheiding: "/" });
    for (const m of Object.values(INFO_MAPPEN)) expect(veiligeMapNaam(m)).toBe(m);
    expect(veiligeMapNaam("INBOX.*")).toBeNull();
    expect(veiligeMapNaam('a"b')).toBeNull();
  });

  it("cron, hartslag, AVG en het paneel zijn aangesloten", () => {
    expect(lees("deploy/cron/entrypoint.sh")).toContain("/api/internal/mail/info");
    expect(lees("lib/ops/heartbeat.ts")).toContain('job: "info-mail"');
    expect(lees("lib/privacy/anonymize.ts")).toContain("infoAntwoordSleutel(oldEmail)");
    expect(lees("app/admin/mail/page.tsx")).toContain("<InfoMailPanel />");
    expect(lees("app/api/admin/mail/info/route.ts")).toContain('withAdminAccess(["PLATFORM_ADMIN"]');
    // het logboek van de cron-route krijgt alleen aantallen
    expect(lees("app/api/internal/mail/info/route.ts")).not.toContain("beslissingen");
  });
});
