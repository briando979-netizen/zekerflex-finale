import { aanbiederVan, envelopDatum, isBounceAfzender, leesBounce, recordIdUitMessageId, type BounceRegel, type BounceSoort } from "@/lib/mail/bounce";
import type { BerichtMerk } from "@/lib/mail/bounce-opslag";

// ---------------------------------------------------------------------------
// De bounce-ronde (elk uur, deploy/cron/entrypoint.sh): de postbus (info@, zelfde IMAP als de offerte-AI) op
// terugkaatsers nalezen. Alles via `BounceAfhankelijkheden`, zodat de kern zonder postbus te testen is; de echte
// afhankelijkheden staan in lib/mail/bounce-ronde-db.ts.
//   vlag uit (standaard, "mail-bounce-verwerken"): alleen lezen, indelen en tellen; niets onderdrukt, niets gemarkeerd
//   vlag aan: hard → onderdrukken + lead op teruggekaatst + adres-merk (sendMail stopt outreach/nieuwsbrief/herinnering);
//             beleid → één melding aan de eigenaar per aanbieder; zacht → tellen (3× in 7 dagen = hard);
//             en het record in het mail-log (Beheer → Mail) krijgt de terugkaatser erbij
// Alleen terugkaatsers van de laatste 30 dagen; hooguit 25 nieuwe per ronde. Niets op gelezen (BODY.PEEK).
// In de stand en het logboek staan alleen aantallen, codes en het soort aanbieder, nooit een adres.
// ---------------------------------------------------------------------------

export const BOUNCE_VLAG = "mail-bounce-verwerken";
export const MAIL_BOUNCES_JOB = "mail-bounces";
export const KV_BOUNCE_METING = "meting:mail-bounces";
export const VENSTER_DAGEN = 30;
export const MAX_NIEUW_PER_RONDE = 25;
const DAG = 86_400_000;

export interface Envelop {
  berichtUid: number;
  date: string | null;
  fromAddress: string | null;
  subject: string | null;
}

export interface BounceMeting {
  at: string;
  droog: boolean;
  /** terugkaatsers die deze ronde voor het eerst gelezen zijn */
  nieuw: number;
  /** alle gelezen terugkaatsers in het venster van 30 dagen, per soort (een bericht kan meer ontvangers hebben) */
  venster: Record<BounceSoort, number>;
  codes: Record<string, number>;
  aanbieders: Record<string, number>;
  /** alleen met de vlag aan: wat er gedaan is */
  gedaan: { onderdrukt: number; leads: number; mailLog: number; meldingen: number; zachtNaarHard: number };
  /** postbus niet te lezen of geen postbus: de reden (zonder gegevens) */
  fout?: string;
}

export interface BounceAfhankelijkheden {
  aan(): Promise<boolean>;
  /** de nieuwste berichten in de INBOX (alleen de envelop) */
  lijst(): Promise<Envelop[]>;
  ruw(berichtUid: number): Promise<string | null>;
  merk(berichtUid: number): Promise<BerichtMerk | null>;
  zetMerk(berichtUid: number, merk: BerichtMerk): Promise<void>;
  merken(): Promise<BerichtMerk[]>;
  hard(regel: BounceRegel): Promise<{ onderdrukt: boolean; leads: number }>;
  /** geeft true als het adres daarmee als hard telt */
  zacht(regel: BounceRegel): Promise<boolean>;
  /** één melding aan de eigenaar per aanbieder (zelf ontdubbeld) */
  beleid(aanbieder: string, regels: BounceRegel[]): Promise<boolean>;
  mailLog(recordId: string, bounce: { soort: BounceSoort; code: string; at: string }): Promise<boolean>;
  bewaar(meting: BounceMeting): Promise<void>;
  ruimOp(): Promise<void>;
  /** de postbus netjes afsluiten (één sessie per ronde); altijd aangeroepen, ook na een fout */
  sluit?(): Promise<void>;
}

const leegVenster = (): Record<BounceSoort, number> => ({ hard: 0, beleid: 0, zacht: 0 });

export async function rondBouncesAf(d: BounceAfhankelijkheden, nu: Date = new Date()): Promise<BounceMeting> {
  try {
    return await ronde(d, nu);
  } finally {
    await d.sluit?.().catch(() => undefined);
  }
}

async function ronde(d: BounceAfhankelijkheden, nu: Date): Promise<BounceMeting> {
  const aan = await d.aan();
  const gedaan = { onderdrukt: 0, leads: 0, mailLog: 0, meldingen: 0, zachtNaarHard: 0 };
  const basis = (extra: Partial<BounceMeting> = {}): BounceMeting => ({ at: nu.toISOString(), droog: !aan, nieuw: 0, venster: leegVenster(), codes: {}, aanbieders: {}, gedaan, ...extra });

  let lijst: Envelop[];
  try {
    lijst = await d.lijst();
  } catch (err) {
    const meting = basis({ fout: `postbus niet te lezen (${(err as Error).name})` });
    await d.bewaar(meting).catch(() => undefined);
    return meting;
  }

  const grens = nu.getTime() - VENSTER_DAGEN * DAG;
  const kandidaten = lijst.filter((e) => isBounceAfzender(e.fromAddress, e.subject) && (envelopDatum(e.date) ?? nu.getTime()) >= grens);
  let nieuw = 0;
  const beleidPerAanbieder = new Map<string, BounceRegel[]>();

  for (const e of kandidaten) {
    if (nieuw >= MAX_NIEUW_PER_RONDE) break;
    // een fout bij één bericht (postbus, KV) houdt de rest niet tegen; dat bericht komt de volgende ronde terug
    try {
    const merk = await d.merk(e.berichtUid);
    // gelezen en verwerkt, of gelezen met de vlag uit en die staat nog steeds uit: niet opnieuw ophalen
    if (merk && (merk.verwerkt || !aan)) continue;
    const ruw = await d.ruw(e.berichtUid).catch(() => null);
    if (!ruw) continue;
    const bericht = leesBounce(ruw);
    nieuw += 1;
    if (!bericht) {
      // toch geen terugkaatser (bijv. een gewone mail met "undeliverable" in het onderwerp): onthouden, niets doen
      await d.zetMerk(e.berichtUid, { at: nu.toISOString(), soorten: [], verwerkt: true });
      continue;
    }
    if (aan) {
      for (const r of bericht.regels) {
        if (r.soort === "hard") {
          const uit = await d.hard(r).catch(() => ({ onderdrukt: false, leads: 0 }));
          if (uit.onderdrukt) gedaan.onderdrukt += 1;
          gedaan.leads += uit.leads;
        } else if (r.soort === "zacht") {
          if (await d.zacht(r).catch(() => false)) {
            gedaan.zachtNaarHard += 1;
            const uit = await d.hard(r).catch(() => ({ onderdrukt: false, leads: 0 }));
            if (uit.onderdrukt) gedaan.onderdrukt += 1;
            gedaan.leads += uit.leads;
          }
        } else {
          const a = aanbiederVan(r.ontvanger);
          beleidPerAanbieder.set(a, [...(beleidPerAanbieder.get(a) ?? []), r]);
        }
      }
      const recordId = recordIdUitMessageId(bericht.origineelMessageId);
      const zwaarste = bericht.regels.find((r) => r.soort === "hard") ?? bericht.regels.find((r) => r.soort === "beleid") ?? bericht.regels[0];
      if (recordId && zwaarste && (await d.mailLog(recordId, { soort: zwaarste.soort, code: zwaarste.code, at: nu.toISOString() }).catch(() => false))) gedaan.mailLog += 1;
    }
    await d.zetMerk(e.berichtUid, { at: nu.toISOString(), soorten: bericht.regels.map((r) => ({ soort: r.soort, code: r.code, aanbieder: aanbiederVan(r.ontvanger) })), verwerkt: aan });
    } catch {
      continue;
    }
  }

  for (const [aanbieder, regels] of beleidPerAanbieder) {
    if (await d.beleid(aanbieder, regels).catch(() => false)) gedaan.meldingen += 1;
  }

  // de stand: alles wat in het venster gelezen is (ook van eerdere rondes), alleen aantallen
  const venster = leegVenster();
  const codes: Record<string, number> = {};
  const aanbieders: Record<string, number> = {};
  for (const m of await d.merken().catch(() => [])) {
    if (Date.parse(m.at) < grens) continue;
    for (const s of m.soorten) {
      venster[s.soort] += 1;
      codes[s.code] = (codes[s.code] ?? 0) + 1;
      aanbieders[s.aanbieder] = (aanbieders[s.aanbieder] ?? 0) + 1;
    }
  }
  const meting = basis({ nieuw, venster, codes, aanbieders });
  await d.bewaar(meting).catch(() => undefined);
  await d.ruimOp().catch(() => undefined);
  return meting;
}
