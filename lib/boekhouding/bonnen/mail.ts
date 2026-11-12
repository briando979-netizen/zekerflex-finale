// ---------------------------------------------------------------------------
// Bonnen per mail. bonnetjes@zekerflex.com is een alias van info@: alles komt in dezelfde Postvak in (lib/mail/imap.ts,
// dezelfde IMAP-gegevens als Admin → Mailbox en de offerte-AI; geen tweede verbinding-instelling). Gewone mail raken we
// niet aan: we lezen eerst alleen de kopregels en laten de mail ongelezen. Alleen als hij oorspronkelijk aan het alias
// gericht was, halen we de bijlagen op.
//  - verwerkBonnetjesMail: één mail (kop + bijlagen) verwerken. Idempotent op het Message-ID.
//  - leesPostvakVoorBonnetjes: de nieuwe mail in de Postvak langslopen en per bonnetje verwerkBonnetjesMail aanroepen.
// NIETS roept dit vanzelf aan: er is geen cron of route voor geregistreerd. De aanroep hoort bij de bestaande mailcron
// (app/api/internal/sales/offers-sweep/route.ts is de plek waar nu info@ wordt gelezen).
// Alleen de bijlage en de nodige kopvelden (afzender, datum, onderwerp) worden bewaard, nooit de mail zelf; geen
// adressen of inhoud in logs.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { decodeMimeWords, fetchBijlagen, fetchInboxList, fetchKop, type ImapConfig, type MailBijlage } from "@/lib/mail/imap";
import { leesEigenAfzenders } from "./afzenders";
import { herkenBonType } from "./bestand";
import { bewaarMailZonderBijlage, leesGezienMail, markeerMailGezien, type BonKop } from "./bonkop";
import { ontvangBon, type BonUitkomst } from "./bonnen";
import { afzenderAdres, BONNETJES_ADRES, isBonnetjesMail, isEigenAfzender, mailSleutel, parseAuthenticationResults, parseKop, spfDkimGeslaagd } from "./mail-kern";
import type { Uitlezer } from "./uitlezen";

/** Hooguit zoveel bijlagen per mail (een handtekeningplaatje meer of minder: de rest gaat naar "even kijken"). */
export const MAX_BIJLAGEN_PER_MAIL = 5;
/** Kleinere bestanden zijn logo's en trackingpixels, geen bon. */
export const MIN_BIJLAGE_BYTES = 1500;

export interface BonnetjesMailInvoer {
  administratieId: string;
  /** de kopregels van de mail (ruw) */
  kop: string;
  bijlagen: readonly MailBijlage[];
  /** had de mail een html-deel (alleen om te melden dat een html-mail zonder bijlage geen bon is) */
  heeftHtml: boolean;
  /** het authserv-id van onze eigen mailserver (de eerste term van Authentication-Results); zonder telt de bovenste regel */
  vertrouwdeServer?: string | undefined;
  alias?: string | undefined;
  /** voor tests; standaard de lijst uit KV */
  eigenAfzenders?: readonly string[] | undefined;
  now?: Date | undefined;
  uitlezer?: Uitlezer | undefined;
}

export type BonnetjesMailUitkomst =
  | { soort: "geen-bonnetje" }
  | { soort: "al-verwerkt" }
  | { soort: "zonder-bijlage" }
  | { soort: "verwerkt"; bonnen: BonUitkomst[]; overgeslagen: number };

/**
 * Verwerkt één mail. Geen bonnetje (niet aan het alias gericht) = niets gebeurt. Een mail wordt nooit twee keer
 * verwerkt (Message-ID). Bonnen van een eigen, geverifieerde afzender kunnen vanzelf worden geboekt; al het andere komt
 * bij "even kijken" met de afzender erbij (in de bon, niet in de boeking).
 */
export async function verwerkBonnetjesMail(m: BonnetjesMailInvoer): Promise<BonnetjesMailUitkomst> {
  const kop = parseKop(m.kop);
  if (!isBonnetjesMail(kop, m.alias ?? BONNETJES_ADRES)) return { soort: "geen-bonnetje" };

  const sleutel = mailSleutel(kop);
  if (await leesGezienMail(sleutel)) return { soort: "al-verwerkt" };

  const afzender = afzenderAdres(kop);
  const lijst = m.eigenAfzenders ?? (await leesEigenAfzenders());
  const auth = parseAuthenticationResults(kop, m.vertrouwdeServer);
  const afzenderOpLijst = isEigenAfzender(afzender, lijst);
  const geslaagd = spfDkimGeslaagd(auth, afzender);
  const bonKop: BonKop = {
    afzender,
    datum: kop.get("date")?.[0] ?? null,
    onderwerp: kop.get("subject")?.[0] ? decodeMimeWords(kop.get("subject")![0]!) : null,
  };

  const bruikbaar = m.bijlagen.filter((b) => b.bytes.length >= MIN_BIJLAGE_BYTES && herkenBonType(b.bytes) !== null);
  const teVerwerken = bruikbaar.slice(0, MAX_BIJLAGEN_PER_MAIL);
  if (teVerwerken.length === 0) {
    const reden = m.heeftHtml && m.bijlagen.length === 0 ? "Een html-mail zonder bijlage: er is geen bestand om als bon te bewaren." : "Geen bijlage die een bon kan zijn (pdf, jpg, png of heic).";
    await bewaarMailZonderBijlage(sleutel, bonKop, reden);
    await markeerMailGezien(sleutel, { op: (m.now ?? new Date()).toISOString(), bonIds: [], soort: "geen-bijlage" });
    return { soort: "zonder-bijlage" };
  }

  const bonnen: BonUitkomst[] = [];
  let overgeslagen = m.bijlagen.length - teVerwerken.length;
  for (const b of teVerwerken) {
    try {
      bonnen.push(
        await ontvangBon({
          administratieId: m.administratieId,
          bytes: b.bytes,
          geuploadDoor: "mail",
          herkomst: { bron: "mail", afzenderOpLijst, spfDkimGeslaagd: geslaagd },
          kop: bonKop,
          now: m.now,
          uitlezer: m.uitlezer,
        }),
      );
    } catch (e) {
      // een ongeldig bestand slaan we over; een storing (database) laten we gooien: de mail is dan nog niet "gezien"
      if (e instanceof AppError && e.status === 422) overgeslagen += 1;
      else throw e;
    }
  }
  await markeerMailGezien(sleutel, { op: (m.now ?? new Date()).toISOString(), bonIds: bonnen.map((b) => b.bonId), soort: "bonnen" });
  logger.info("bonnetjesmail verwerkt", { bonnen: bonnen.length, overgeslagen });
  return { soort: "verwerkt", bonnen, overgeslagen };
}

const LAATSTE_UID_SLEUTEL = "boekhouding:bonmail:laatste-uid";

export interface PostvakUitkomst {
  bekeken: number;
  bonnetjes: number;
  bonnen: number;
}

/**
 * Loopt de nieuwe mail in de Postvak in langs (hooguit `limiet` per keer, op uid) en verwerkt elk bonnetje. Gewone mail
 * blijft onaangeroerd en ongelezen; alleen de kopregels worden opgehaald. Gooit niet bij één kapotte mail: stopt dan en
 * onthoudt waar hij was, zodat de volgende keer daar verdergaat.
 */
export async function leesPostvakVoorBonnetjes(
  cfg: ImapConfig,
  administratieId: string,
  opties: { limiet?: number; vertrouwdeServer?: string; now?: Date } = {},
): Promise<PostvakUitkomst> {
  const limiet = Math.min(Math.max(Math.trunc(opties.limiet ?? 10), 1), 30);
  const uit: PostvakUitkomst = { bekeken: 0, bonnetjes: 0, bonnen: 0 };
  const lijst = await fetchInboxList(cfg, 30);
  const staat = await kvGet<{ uid: number }>(LAATSTE_UID_SLEUTEL);
  const vers = lijst.filter((x) => x.uid > (staat?.uid ?? 0)).sort((a, b) => a.uid - b.uid).slice(0, limiet);
  let laatste = staat?.uid ?? 0;
  try {
    for (const x of vers) {
      uit.bekeken += 1;
      const kop = await fetchKop(cfg, x.uid);
      if (kop && isBonnetjesMail(parseKop(kop))) {
        const data = await fetchBijlagen(cfg, x.uid);
        if (data) {
          const r = await verwerkBonnetjesMail({
            administratieId,
            kop: data.kop,
            bijlagen: data.bijlagen,
            heeftHtml: data.heeftHtml,
            vertrouwdeServer: opties.vertrouwdeServer,
            now: opties.now,
          });
          if (r.soort !== "geen-bonnetje") uit.bonnetjes += 1;
          if (r.soort === "verwerkt") uit.bonnen += r.bonnen.length;
        }
      }
      laatste = x.uid;
    }
  } catch (e) {
    logger.warn("bonnetjes-postvak gestopt", { fout: e instanceof Error ? e.name : "onbekend" });
  } finally {
    if (laatste > (staat?.uid ?? 0)) await kvSet(LAATSTE_UID_SLEUTEL, { uid: laatste }).catch(() => undefined);
  }
  return uit;
}
