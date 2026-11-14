import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { aanbiederVan, blokBijBounce, envelopDatum, isBounceAfzender, leesBounce, mailStatusLabel, recordIdUitMessageId, soortVanCode, veiligeDiagnose } from "@/lib/mail/bounce";
import { rondBouncesAf, type BounceAfhankelijkheden, type Envelop } from "@/lib/mail/bounce-ronde";
import type { BerichtMerk } from "@/lib/mail/bounce-opslag";

// Terugkaatsers (14 nov): de nieuwsbrief van 7 nov werd 12 keer door Microsoft geweigerd ("5.7.1 … lacks SPF/DKIM/DMARC")
// terwijl het mail-log "afgeleverd" zei. Nagemaakte terugkaatsers, zonder echte adressen (.test-domeinen).

const MICROSOFT = [
  "From: Microsoft Outlook <postmaster@outlook.com>",
  "To: <info@zekerflex.com>",
  "Subject: Undeliverable: ZekerFlex nieuws",
  "Message-ID: <rapport1@AM7PEPF.prod.outlook.com>",
  'Content-Type: multipart/report; report-type=delivery-status; boundary="b1"',
  "",
  "--b1",
  "Content-Type: text/plain",
  "",
  "Delivery has failed to these recipients or groups.",
  "--b1",
  "Content-Type: message/delivery-status",
  "",
  "Reporting-MTA: dns;AM7PEPF00000050.prod.outlook.com",
  "",
  "Final-Recipient: rfc822;klant@hotmail.test",
  "Action: failed",
  "Status: 5.7.1",
  "Diagnostic-Code: smtp;550 5.7.1 Message rejected: Message lacks SPF/DKIM/DMARC Auth Records (AS9031519)",
  " [AM7PEPF00000050.EURPRD83.prod.outlook.com 2026-11-07T15:50:48.154Z 08DF3C052F61C4B2]",
  "--b1",
  "Content-Type: text/rfc822-headers",
  "",
  "From: ZekerFlex <nieuwsbrief@zekerflex.com>",
  "Message-ID: <a1b2c3d4-e5f@zekerflex.com>",
  "Subject: ZekerFlex nieuws",
  "--b1--",
].join("\r\n");

const GMAIL = [
  "From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
  "Subject: Delivery Status Notification (Failure)",
  'Content-Type: multipart/report; report-type=delivery-status; boundary="g"',
  "",
  "--g",
  "Content-Type: message/delivery-status",
  "",
  "Final-Recipient: rfc822; bestaatniet@gmail.test",
  "Action: failed",
  "Status: 5.1.1",
  "Remote-MTA: dns; gmail-smtp-in.l.google.com. (192.0.2.10)",
  "Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist. bestaatniet@gmail.test",
  "--g",
  "Content-Type: message/rfc822",
  "",
  "From: ZekerFlex <noreply@zekerflex.com>",
  "Message-ID: <0123456789ab@zekerflex.com>",
  "Subject: Een voorstel op maat",
  "--g--",
].join("\r\n");

const VERTRAAGD = [
  "From: Mail Delivery System <MAILER-DAEMON@mx.provider.test>",
  "Subject: Delayed Mail (still being retried)",
  'Content-Type: multipart/report; report-type=delivery-status; boundary="d"',
  "",
  "--d",
  "Content-Type: message/delivery-status",
  "",
  "Final-Recipient: rfc822;vol@bedrijf.test",
  "Action: delayed",
  "Status: 4.2.2",
  "Diagnostic-Code: smtp; 452 4.2.2 Mailbox full",
  "--d--",
].join("\r\n");

const EXIM = [
  "From: Mail Delivery System <Mailer-Daemon@mx.example.test>",
  "Subject: Mail delivery failed: returning message to sender",
  "",
  "This message was created automatically by mail delivery software.",
  "A message that you sent could not be delivered. This is a permanent error. The following address(es) failed:",
  "",
  "  <weg@oud-bedrijf.test>:",
  "    host mx.oud-bedrijf.test [192.0.2.1]",
  "    SMTP error from remote mail server after RCPT TO:<weg@oud-bedrijf.test>:",
  "    550 5.1.1 <weg@oud-bedrijf.test>: Recipient address rejected: User unknown",
].join("\r\n");

const OFFERTE = [
  "From: Jan <jan@bedrijf.test>",
  "Subject: Offerte voor drie kelners",
  "",
  "Goedemiddag, wij zoeken drie kelners voor zaterdag. Vorige keer was een mail undeliverable, vandaar deze nieuwe.",
].join("\r\n");

describe("terugkaatsers lezen", () => {
  it("Microsoft weigert op SPF/DKIM/DMARC: beleid, niet de schuld van het adres; uitleg zonder id's", () => {
    const b = leesBounce(MICROSOFT)!;
    expect(b.regels).toHaveLength(1);
    expect(b.regels[0]).toMatchObject({ ontvanger: "klant@hotmail.test", code: "5.7.1", soort: "beleid" });
    expect(b.regels[0]!.diagnose).toContain("Message lacks SPF/DKIM/DMARC Auth Records");
    expect(b.regels[0]!.diagnose).not.toContain("08DF3C052F61C4B2");
    expect(b.origineelMessageId).toBe("a1b2c3d4-e5f@zekerflex.com");
    expect(recordIdUitMessageId(b.origineelMessageId)).toBe("a1b2c3d4-e5f");
    expect(aanbiederVan(b.regels[0]!.ontvanger)).toBe("microsoft");
  });

  it("Gmail: het adres bestaat niet = hard; de uitleg noemt het adres niet", () => {
    const b = leesBounce(GMAIL)!;
    expect(b.regels[0]).toMatchObject({ ontvanger: "bestaatniet@gmail.test", code: "5.1.1", soort: "hard" });
    expect(b.regels[0]!.diagnose).not.toMatch(/@gmail\.test/);
    expect(recordIdUitMessageId(b.origineelMessageId)).toBe("0123456789ab");
  });

  it("uitgesteld en postbus vol: zacht", () => {
    expect(leesBounce(VERTRAAGD)!.regels[0]).toMatchObject({ code: "4.2.2", soort: "zacht" });
  });

  it("een oude melding zonder rapportblok: het ene adres uit de tekst", () => {
    expect(leesBounce(EXIM)!.regels).toEqual([expect.objectContaining({ ontvanger: "weg@oud-bedrijf.test", code: "5.1.1", soort: "hard" })]);
  });

  it("een gewone mail (offerte) is nooit een terugkaatser, ook niet met 'undeliverable' in de tekst", () => {
    expect(leesBounce(OFFERTE)).toBeNull();
    expect(isBounceAfzender("jan@bedrijf.test", "Offerte voor drie kelners")).toBe(false);
    expect(isBounceAfzender("postmaster@outlook.com", "Undeliverable: x")).toBe(true);
    expect(isBounceAfzender("iemand@bedrijf.test", "Mail delivery failed: returning message to sender")).toBe(true);
  });

  it("indeling van codes en uitleg", () => {
    expect(soortVanCode("5.1.10")).toBe("hard");
    expect(soortVanCode("5.4.1")).toBe("hard");
    expect(soortVanCode("5.7.26")).toBe("beleid");
    expect(soortVanCode("5.2.2")).toBe("zacht");
    expect(soortVanCode("5.0.0", "550 no such user here")).toBe("hard");
    expect(soortVanCode("5.0.0", "blocked by spamhaus")).toBe("beleid");
    expect(soortVanCode("5.0.0", "iets onbekends")).toBe("zacht"); // voorzichtig: niet onderdrukken
    expect(soortVanCode("5.1.1", "", "delayed")).toBe("zacht");
    expect(veiligeDiagnose("550 <x@y.test> from [192.0.2.1] 10.0.0.1")).toBe("550 <<adres>> from [<ip>] <ip>");
  });

  it("alleen outreach, nieuwsbrief en herinneringen worden tegengehouden; verificatie, wachtwoord en beveiliging nooit", () => {
    for (const s of ["sales-outreach", "nieuwsbrief", "onboarding-reminder", "timesheet-reminder"]) expect(blokBijBounce(s), s).toBe(true);
    for (const s of ["verification", "wachtwoord-reset", "security", "invoice", "welcome", undefined]) expect(blokBijBounce(s), String(s)).toBe(false);
  });

  it("de datum van een envelop", () => {
    expect(envelopDatum("Sat, 07 Nov 2026 16:50:48 +0100")).toBe(Date.parse("2026-11-07T15:50:48Z"));
    expect(envelopDatum(null)).toBeNull();
  });

  it("de status in Beheer → Mail", () => {
    expect(mailStatusLabel({ delivered: true, transport: "smtp", bounce: { soort: "hard" } })).toEqual({ label: "teruggekaatst", toon: "crit" });
    expect(mailStatusLabel({ delivered: true, transport: "smtp", bounce: { soort: "beleid" } }).label).toBe("geweigerd");
    expect(mailStatusLabel({ delivered: false, transport: "mailbox", suppressed: "teruggekaatst (het adres bestaat niet)" }).label).toBe("niet verstuurd (kaatst terug)");
    expect(mailStatusLabel({ delivered: true, transport: "smtp" }).label).toBe("afgeleverd");
  });
});

// --- de ronde, met nep-afhankelijkheden ---------------------------------------------------------

const NU = new Date("2026-11-14T03:35:00+00:00");

function nep(aan: boolean, berichten: Record<number, { ruw: string; date?: string; from?: string; subject?: string }>) {
  const merken = new Map<number, BerichtMerk>();
  const roep = { ruw: [] as number[], hard: [] as string[], zacht: [] as string[], beleid: [] as string[], mailLog: [] as string[] };
  let zachtWordtHard = false;
  let metingen = 0;
  const d: BounceAfhankelijkheden = {
    aan: async () => aan,
    lijst: async (): Promise<Envelop[]> =>
      Object.entries(berichten).map(([uid, b]) => ({ berichtUid: Number(uid), date: b.date ?? "Sat, 07 Nov 2026 16:50:48 +0100", fromAddress: b.from ?? "postmaster@outlook.com", subject: b.subject ?? "Undeliverable: x" })),
    ruw: async (uid) => {
      roep.ruw.push(uid);
      return berichten[uid]?.ruw ?? null;
    },
    merk: async (uid) => merken.get(uid) ?? null,
    zetMerk: async (uid, m) => void merken.set(uid, m),
    merken: async () => [...merken.values()],
    hard: async (r) => {
      roep.hard.push(r.code);
      return { onderdrukt: true, leads: 1 };
    },
    zacht: async (r) => {
      roep.zacht.push(r.code);
      return zachtWordtHard;
    },
    beleid: async (a) => {
      roep.beleid.push(a);
      return true;
    },
    mailLog: async (id) => {
      roep.mailLog.push(id);
      return true;
    },
    bewaar: async () => void (metingen += 1),
    ruimOp: async () => undefined,
  };
  return { d, merken, roep, zetAan: (v: boolean) => (aan = v), zetZachtWordtHard: (v: boolean) => (zachtWordtHard = v), metingen: () => metingen };
}

describe("de bounce-ronde", () => {
  const POST = { 1: { ruw: MICROSOFT }, 2: { ruw: GMAIL, from: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification (Failure)" }, 3: { ruw: OFFERTE, from: "jan@bedrijf.test", subject: "Offerte" } };

  it("vlag uit: alleen lezen, indelen en tellen; niets onderdrukt, de offerte niet eens opgehaald", async () => {
    const n = nep(false, POST);
    const m = await rondBouncesAf(n.d, NU);
    expect(n.roep.ruw.sort()).toEqual([1, 2]);
    expect([n.roep.hard, n.roep.beleid, n.roep.mailLog]).toEqual([[], [], []]);
    expect(m).toMatchObject({ droog: true, nieuw: 2, venster: { hard: 1, beleid: 1, zacht: 0 }, codes: { "5.7.1": 1, "5.1.1": 1 }, aanbieders: { microsoft: 1, anders: 1 } });
    expect(JSON.stringify(m)).not.toMatch(/@/); // nooit een adres in de stand
    expect([...n.merken.values()].every((x) => x.verwerkt === false)).toBe(true);
  });

  it("een volgende ronde met de vlag uit haalt niets opnieuw op", async () => {
    const n = nep(false, POST);
    await rondBouncesAf(n.d, NU);
    n.roep.ruw.length = 0;
    const m = await rondBouncesAf(n.d, NU);
    expect(n.roep.ruw).toEqual([]);
    expect(m.nieuw).toBe(0);
    expect(m.venster).toEqual({ hard: 1, beleid: 1, zacht: 0 });
  });

  it("vlag aan na een droge ronde: wat alleen gelezen was, wordt nu verwerkt, één keer", async () => {
    const n = nep(false, POST);
    await rondBouncesAf(n.d, NU);
    n.zetAan(true);
    const m = await rondBouncesAf(n.d, NU);
    expect(n.roep.hard).toEqual(["5.1.1"]);
    expect(n.roep.beleid).toEqual(["microsoft"]); // één melding per aanbieder
    expect(n.roep.mailLog.sort()).toEqual(["0123456789ab", "a1b2c3d4-e5f"]);
    expect(m.gedaan).toMatchObject({ onderdrukt: 1, leads: 1, mailLog: 2, meldingen: 1 });
    n.roep.hard.length = 0;
    await rondBouncesAf(n.d, NU);
    expect(n.roep.hard).toEqual([]); // verwerkt = klaar
  });

  it("zacht drie keer: telt als hard", async () => {
    const n = nep(true, { 5: { ruw: VERTRAAGD, from: "MAILER-DAEMON@mx.provider.test", subject: "Delayed Mail" } });
    n.zetZachtWordtHard(true);
    const m = await rondBouncesAf(n.d, NU);
    expect(n.roep.zacht).toEqual(["4.2.2"]);
    expect(n.roep.hard).toEqual(["4.2.2"]);
    expect(m.gedaan.zachtNaarHard).toBe(1);
  });

  it("ouder dan 30 dagen: niet meer bekeken", async () => {
    const n = nep(true, { 7: { ruw: GMAIL, date: "Mon, 05 Oct 2026 10:00:00 +0200" } });
    await rondBouncesAf(n.d, NU);
    expect(n.roep.ruw).toEqual([]);
  });

  it("de postbus is niet te lezen: geen crash, wel een stand met de reden (zonder gegevens)", async () => {
    const n = nep(true, POST);
    n.d.lijst = async () => {
      throw Object.assign(new Error("ETIMEDOUT bij imap"), { name: "ImapError" });
    };
    const m = await rondBouncesAf(n.d, NU);
    expect(m.fout).toBe("postbus niet te lezen (ImapError)");
    expect(n.metingen()).toBe(1);
  });
});

// --- opslag per adres (gehasht), fail-open -----------------------------------------------------

const kv = vi.hoisted(() => ({ map: new Map<string, unknown>(), kapot: false }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (kv.kapot) throw new Error("kv weg");
    return kv.map.get(k) ?? null;
  },
  kvSet: async (k: string, v: unknown) => void kv.map.set(k, v),
  kvDelete: async (k: string) => void kv.map.delete(k),
  kvDeleteStale: async () => 0,
  kvListEntries: async (p: string) => [...kv.map].filter(([k]) => k.startsWith(p)).map(([key, value]) => ({ key, value })),
}));

describe("opslag van terugkaatsers", () => {
  it("de sleutel is een hash, nooit het adres; hoofdletters maken niet uit", async () => {
    const { bounceSleutel, zachtSleutel } = await import("@/lib/mail/bounce-opslag");
    expect(bounceSleutel("Klant@Bedrijf.test")).toBe(bounceSleutel("klant@bedrijf.test"));
    expect(bounceSleutel("klant@bedrijf.test")).toMatch(/^mail-bounce:[0-9a-f]{32}$/);
    expect(zachtSleutel("klant@bedrijf.test")).toMatch(/^mail-bounce-zacht:[0-9a-f]{32}$/);
  });

  it("hard markeren, terugvinden, en na de bewaartermijn niet meer", async () => {
    const { markeerHard, heeftHardeBounce } = await import("@/lib/mail/bounce-opslag");
    kv.map.clear();
    await markeerHard("weg@bedrijf.test", "5.1.1", NU);
    expect(await heeftHardeBounce("WEG@bedrijf.test", NU.getTime())).toBe(true);
    expect(await heeftHardeBounce("weg@bedrijf.test", NU.getTime() + 366 * 86_400_000)).toBe(false);
    expect(await heeftHardeBounce("ander@bedrijf.test", NU.getTime())).toBe(false);
  });

  it("drie zachte binnen 7 dagen = hard; daarbuiten begint de telling opnieuw", async () => {
    const { telZacht, heeftHardeBounce } = await import("@/lib/mail/bounce-opslag");
    kv.map.clear();
    const dag = (n: number) => new Date(NU.getTime() + n * 86_400_000);
    expect(await telZacht("vol@bedrijf.test", "4.2.2", dag(0))).toBe(false);
    expect(await telZacht("vol@bedrijf.test", "4.2.2", dag(9))).toBe(false); // buiten het venster: opnieuw 1
    expect(await telZacht("vol@bedrijf.test", "4.2.2", dag(10))).toBe(false);
    expect(await telZacht("vol@bedrijf.test", "4.2.2", dag(11))).toBe(true);
    expect(await heeftHardeBounce("vol@bedrijf.test", dag(11).getTime())).toBe(true);
  });

  it("een storing in de KV houdt geen mail tegen (fail-open)", async () => {
    const { heeftHardeBounce } = await import("@/lib/mail/bounce-opslag");
    kv.kapot = true;
    expect(await heeftHardeBounce("weg@bedrijf.test")).toBe(false);
    kv.kapot = false;
  });
});

// --- aanhakingen in de bestaande code -----------------------------------------------------------

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("aanhakingen", () => {
  it("sendMail houdt alleen de geblokkeerde soorten tegen, vóór de afmeldcontrole", () => {
    const s = bron("lib/mail/index.ts");
    expect(s).toContain("if (blokBijBounce(input.kind) && (await heeftHardeBounce(input.to))) {");
    expect(s).toContain("if (!suppressed && isOptionalCategory(category)) {");
  });

  it("de offerte-AI slaat terugkaatsers over met dezelfde herkenning", () => {
    expect(bron("lib/sales/offers.ts")).toContain("if (isBounceAfzender(env0.fromAddress, env0.subject)) continue;");
  });

  it("de ronde leest zonder op gelezen te zetten", () => {
    expect(bron("lib/mail/imap.ts")).toMatch(/export async function fetchRuwOngelezen[\s\S]{0,200}markSeen: false/);
    expect(bron("lib/mail/bounce-ronde-db.ts")).toContain("fetchRuwOngelezen(cfg, berichtUid)");
  });

  it("AVG: bij het wissen gaan de terugkaatsers van het oude adres mee", () => {
    expect(bron("lib/privacy/anonymize.ts")).toContain("[bounceSleutel(oldEmail), zachtSleutel(oldEmail)]");
  });

  it("vlag standaard uit, elk uur in de cron, met hartslag", async () => {
    const { FLAG_REGISTRY } = await import("@/lib/flags");
    expect(FLAG_REGISTRY.find((f) => f.key === "mail-bounce-verwerken")?.default).toBe(false);
    expect(bron("deploy/cron/entrypoint.sh")).toMatch(/^35 \* \* \* \* wget .*\/api\/internal\/mail\/bounces"$/m);
    expect(bron("lib/ops/heartbeat.ts")).toContain('{ job: "mail-bounces", label: "Terugkaatsers in de postbus nalezen", maxAgeHours: 3 }');
  });
});
