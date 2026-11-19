import { sendMail } from "@/lib/mail";
import { gesprekken } from "@/lib/sitechat/gesprek";
import { kvDelete, kvListKeys, kvSetIfAbsent } from "@/lib/storage/kv";
import { SUBDOMEIN_HOST } from "@/lib/voorstel/smileyapp-account-regels";
import { alleAanvragen } from "@/lib/voorstel/smileyapp-aanvragen";
import { beheerderAdressen } from "@/lib/voorstel/smileyapp-accounts";
import { SMILEYAPP_KANAAL } from "@/lib/voorstel/smileyapp-chat";
import { smileyappCijfers } from "@/lib/voorstel/smileyapp-cijfers";
import { smileyappInstellingen } from "@/lib/voorstel/smileyapp-instellingen";
import { weekMail } from "@/lib/voorstel/smileyapp-mail";
import { WEEKMAIL_PREFIX, isVerzendMoment, telWeek, weekPeriode, weekmailSleutel, type WeekCijfers } from "@/lib/voorstel/smileyapp-week-regels";

// ---------------------------------------------------------------------------
// De wekelijkse mail aan de beheerders van SmileyApp (deel 6a). De cron
// (deploy/cron/entrypoint.sh) roept /api/internal/smileyapp/weekmail elke
// ochtend een paar keer aan (UTC); alleen op maandag vanaf 07:00 Nederlandse tijd
// gaat de mail weg, en per week precies één keer: het merk
// voorstel-smileyapp:weekmail:<maandag> wordt eerst geclaimd (kvSetIfAbsent).
// Geen beheerder met een account, of de schakelaar uit: er gaat niets weg.
// De mail bevat alleen aantallen (lib/voorstel/smileyapp-week-regels.ts).
// ---------------------------------------------------------------------------

export const SMILEYAPP_WEEKMAIL_JOB = "smileyapp-weekmail";

/** Het beheer op het eigen subdomein: de cron komt binnen op het interne adres en heeft dus geen host om van af te leiden. */
export const WEEKMAIL_BEHEER = `https://${SUBDOMEIN_HOST}/beheer`;

/** De tellingen van de zeven dagen vóór vandaag. Een teller die niet te lezen is (Redis of de chat) wordt null, geen nul. */
export async function weekCijfers(nu = new Date()): Promise<WeekCijfers> {
  const periode = weekPeriode(nu);
  const [aanvragen, bezoeken, chatStarts] = await Promise.all([
    alleAanvragen(nu),
    // de zeven dagen tot en met gisteren: een tel vlak vóór middernacht
    smileyappCijfers(7, new Date(periode.tot.getTime() - 1))
      .then((c) => c.weergaven)
      .catch(() => null),
    gesprekken(SMILEYAPP_KANAAL)
      .then((lijst) => lijst.map((g) => g.gestart))
      .catch(() => null),
  ]);
  return telWeek({ periode, nu, aanvragen, chatStarts, bezoeken });
}

export type WeekmailUitslag = { verstuurd: number; reden?: "te-vroeg" | "uit" | "geen-beheerder" | "al-verstuurd" };

/** De maandagronde. Mag vaker aangeroepen worden: buiten het moment, zonder ontvanger of na de eerste keer doet hij niets. */
export async function stuurWeekmail(nu = new Date(), beheer = WEEKMAIL_BEHEER): Promise<WeekmailUitslag> {
  if (!isVerzendMoment(nu)) return { verstuurd: 0, reden: "te-vroeg" };
  if (!(await smileyappInstellingen()).weekmail) return { verstuurd: 0, reden: "uit" };
  const ontvangers = await beheerderAdressen();
  if (ontvangers.length === 0) return { verstuurd: 0, reden: "geen-beheerder" };
  const merk = weekmailSleutel(weekPeriode(nu));
  if (!(await kvSetIfAbsent(merk, { op: nu.toISOString() }))) return { verstuurd: 0, reden: "al-verstuurd" };
  try {
    const week = await weekCijfers(nu);
    const uitslag = await Promise.all(ontvangers.map((to) => sendMail(weekMail({ to, week, beheer }))));
    // oude merken opruimen: alleen dat van deze week hoeft te blijven
    const oud = (await kvListKeys(WEEKMAIL_PREFIX, 200).catch(() => [])).filter((k) => k !== merk);
    await Promise.all(oud.map((k) => kvDelete(k).catch(() => undefined)));
    const verstuurd = uitslag.filter((u) => u.delivered).length;
    // sendMail gooit niet: kwam er bij niemand iets aan (storing bij de mailserver), dan mag de volgende ronde het opnieuw proberen
    if (verstuurd === 0) await kvDelete(merk).catch(() => undefined);
    return { verstuurd };
  } catch (e) {
    // tellen lukte niet: het merk weer weg, dan probeert de volgende ronde van de cron het opnieuw
    await kvDelete(merk).catch(() => undefined);
    throw e;
  }
}

/** "Stuur mij nu een voorbeeld": dezelfde mail met de cijfers van nu, alleen naar het eigen adres van wie erom vraagt. */
export async function stuurVoorbeeld(to: string, beheer: string, nu = new Date()): Promise<boolean> {
  return (await sendMail(weekMail({ to, week: await weekCijfers(nu), beheer, voorbeeld: true }))).delivered;
}
