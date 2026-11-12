// ---------------------------------------------------------------------------
// Bonnetjes per mail: de geplande taak (cron -> /api/internal/boekhouding/bonnen-mail). Staat standaard UIT (flag
// "boekhouding-bonnen-mail"). Begrensd: hooguit MAX_MAILS_PER_RUN mails en een harde tijdsgrens, zodat een trage
// IMAP-server niets anders raakt. Elke fout of time-out komt in het foutenlogboek (logger.error) in plaats van stil te
// falen. In het logboek staan nooit adressen of inhoud, alleen de soort fout. De afhankelijkheden zijn doorgegeven
// zodat dit zonder mailserver en database te testen is.
// ---------------------------------------------------------------------------

import { logger } from "@/lib/logger";
import type { ImapConfig } from "@/lib/mail/imap";
import type { PostvakUitkomst } from "./mail";

export const BONNEN_MAIL_FLAG = "boekhouding-bonnen-mail";
export const BONNEN_MAIL_JOB = "boekhouding-bonnen-mail";
export const MAX_MAILS_PER_RUN = 10;
export const TIJDSGRENS_MS = 60_000;
/** Zo lang wacht de IMAP-verbinding op een antwoord voor hij opgeeft (de harde grens hierboven geldt voor de hele run). */
export const IMAP_WACHT_MS = 20_000;

export type TaakUitkomst =
  | { status: "uit" }
  | { status: "niet-ingericht"; reden: "geen-mailbox" | "geen-administratie" }
  | { status: "gelukt"; ok: true; uitslag: PostvakUitkomst }
  | { status: "mislukt"; ok: false }
  | { status: "time-out"; ok: false };

export interface TaakAfhankelijkheden {
  flagAan: () => Promise<boolean>;
  imapConfig: () => ImapConfig | null;
  /** het id van de echte, actieve administratie waar bonnen in komen */
  administratieId: () => Promise<string | null>;
  lees: (cfg: ImapConfig, administratieId: string, opties: { limiet: number; vertrouwdeServer?: string }) => Promise<PostvakUitkomst>;
  vertrouwdeServer?: string | undefined;
  tijdsgrensMs?: number | undefined;
}

const TIMEOUT = Symbol("time-out");

export async function draaiBonnenMail(d: TaakAfhankelijkheden): Promise<TaakUitkomst> {
  if (!(await d.flagAan())) return { status: "uit" };

  const cfg = d.imapConfig();
  if (!cfg) {
    logger.error("bonnetjesmail: geen mailbox ingericht", { reden: "geen-mailbox" });
    return { status: "niet-ingericht", reden: "geen-mailbox" };
  }
  const administratieId = await d.administratieId();
  if (!administratieId) {
    logger.error("bonnetjesmail: geen echte administratie", { reden: "geen-administratie" });
    return { status: "niet-ingericht", reden: "geen-administratie" };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const wacht = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), d.tijdsgrensMs ?? TIJDSGRENS_MS);
    });
    const run = d.lees({ ...cfg, timeout: IMAP_WACHT_MS }, administratieId, {
      limiet: MAX_MAILS_PER_RUN,
      ...(d.vertrouwdeServer ? { vertrouwdeServer: d.vertrouwdeServer } : {}),
    });
    // een run die na de tijdsgrens alsnog faalt mag geen onafgehandelde fout geven
    run.catch(() => undefined);
    const uitkomst = await Promise.race([run, wacht]);
    if (uitkomst === TIMEOUT) {
      logger.error("bonnetjesmail: time-out bij het lezen van de Postvak", { reden: "time-out", grensMs: d.tijdsgrensMs ?? TIJDSGRENS_MS });
      return { status: "time-out", ok: false };
    }
    return { status: "gelukt", ok: true, uitslag: uitkomst };
  } catch (e) {
    logger.error("bonnetjesmail: lezen van de Postvak mislukt", { reden: "fout", soort: e instanceof Error ? e.name : "onbekend" });
    return { status: "mislukt", ok: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
