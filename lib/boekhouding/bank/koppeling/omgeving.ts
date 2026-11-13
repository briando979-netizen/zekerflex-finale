// ---------------------------------------------------------------------------
// Bank-koppeling: de sleutels uit de omgeving (.env.production, alleen namen hier; nooit de waarden loggen). Zonder
// beide sleutels is de koppeling "niet ingesteld": een duidelijke fout, geen stille stop.
// ---------------------------------------------------------------------------

import { env } from "@/lib/env";
import { BankKoppelingFout } from "./kern";
import { EnableBanking } from "./enable-banking";

export function enableBankingUitOmgeving(): EnableBanking {
  const appId = env.ENABLE_BANKING_APP_ID?.trim();
  const privateKey = env.ENABLE_BANKING_PRIVATE_KEY?.trim();
  if (!appId || !privateKey) {
    throw new BankKoppelingFout("niet-ingesteld", "De bankkoppeling is nog niet ingesteld: de sleutels (ENABLE_BANKING_APP_ID en ENABLE_BANKING_PRIVATE_KEY) ontbreken. Zie Admin, Te doen.");
  }
  return new EnableBanking({ appId, privateKey });
}

/** Alleen de vraag of de sleutels er zijn (voor het scherm en Te doen); nooit de waarde. */
export function bankkoppelingSleutelsAanwezig(): boolean {
  return Boolean(env.ENABLE_BANKING_APP_ID?.trim() && env.ENABLE_BANKING_PRIVATE_KEY?.trim());
}
