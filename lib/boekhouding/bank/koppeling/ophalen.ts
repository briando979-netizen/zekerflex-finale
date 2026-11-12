// ---------------------------------------------------------------------------
// Bank-koppeling: de transacties automatisch ophalen. `haalBankOp()` is de ene functie die een nachtelijke ronde (of de
// knop "Nu ophalen") aanroept; ze is bewust NIET aan een cron gekoppeld. Per bankrekening met toestemming:
//   1. de vlag "boekhouding-bankkoppeling" (standaard UIT) moet aan staan;
//   2. is de toestemming verlopen, dan wordt er niet gebeld maar een duidelijke melding gemaakt (foutenlogboek via
//      logger.error + de taak "Bank: opnieuw toestemming geven" bij Admin, Te doen): nooit stil stoppen;
//   3. de transacties worden als csv in de algemene indeling aan de bestaande import gegeven (importeerAfschrift): zo
//      blijven bewaren, het controleren van de rekening, de unieke sleutel per transactie en het koppelen aan facturen
//      en bonnen precies hetzelfde als bij een geÃ¼pload bestand. Twee keer ophalen geeft nooit dubbele regels.
// In logs en uitkomst alleen id's, aantallen en foutcodes: nooit IBAN's, namen, omschrijvingen of antwoorden van de bank.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { importeerAfschrift } from "../import";
import type { ImportUitkomst } from "../types";
import {
  BankKoppelingFout,
  bepaalSinds,
  dagenTotVerlopen,
  regelsNaarCsv,
  toestemmingStand,
  type BankKoppeling,
  type BankKoppelingFoutCode,
  type KoppelingStaat,
  type ToestemmingStand,
} from "./kern";

export const BANKKOPPELING_FLAG = "boekhouding-bankkoppeling";
/** De naam waaronder een automatische ophaling in het afschrift (geuploadDoor) staat. */
export const BANKKOPPELING_DOOR = "bankkoppeling";

export type OphaalStatus = "ok" | "verlopen" | "fout" | "overgeslagen";

export interface OphaalRekening {
  bankRekeningId: string;
  status: OphaalStatus;
  /** nieuwe transacties die erbij kwamen */
  nieuw: number;
  alBekend: number;
  toestemming: ToestemmingStand;
  dagenTotVerlopen: number;
  /** een Nederlandse regel voor de eigenaar; leeg bij "ok" zonder bijzonderheden */
  melding: string | null;
}

export interface OphaalUitkomst {
  /** "uit" = de vlag staat uit en er is niets gedaan */
  status: "uit" | "klaar";
  rekeningen: OphaalRekening[];
}

export interface OphaalDeps {
  flagAan: () => Promise<boolean>;
  staten: () => Promise<{ bankRekeningId: string; staat: KoppelingStaat }[]>;
  bewaarStaat: (bankRekeningId: string, staat: KoppelingStaat) => Promise<void>;
  rekening: (bankRekeningId: string) => Promise<{ iban: string; actief: boolean } | null>;
  nieuwsteBoekdag: (bankRekeningId: string) => Promise<string | null>;
  maakKoppeling: (staat: KoppelingStaat) => BankKoppeling;
  importeer: (o: { bankRekeningId: string; bytes: Buffer; door: string }) => Promise<ImportUitkomst>;
  nu: () => Date;
}

export async function haalBankOpMet(d: OphaalDeps): Promise<OphaalUitkomst> {
  if (!(await d.flagAan())) return { status: "uit", rekeningen: [] };
  const uit: OphaalRekening[] = [];
  for (const { bankRekeningId, staat } of await d.staten()) {
    const nu = d.nu();
    const stand = toestemmingStand(staat.geldigTot, nu);
    const dagen = dagenTotVerlopen(staat.geldigTot, nu);
    const basis = { bankRekeningId, nieuw: 0, alBekend: 0, toestemming: stand, dagenTotVerlopen: dagen };
    const bewaarFout = async (code: BankKoppelingFoutCode): Promise<void> => d.bewaarStaat(bankRekeningId, { ...staat, laatsteFout: { code, op: nu.toISOString() } });

    if (stand === "verlopen") {
      const melding = "De toestemming bij de bank is verlopen. Geef opnieuw toestemming (Beheer, Boekhouding, Bank); tot die tijd komen er geen transacties meer binnen.";
      logger.error("bankkoppeling: toestemming verlopen", { reden: "toestemming-verlopen", bankRekeningId });
      await bewaarFout("toestemming-verlopen");
      uit.push({ ...basis, status: "verlopen", melding });
      continue;
    }
    if (stand === "bijna-verlopen") logger.warn("bankkoppeling: toestemming loopt bijna af", { bankRekeningId, dagen });

    try {
      const rekening = await d.rekening(bankRekeningId);
      if (!rekening || !rekening.actief) {
        uit.push({ ...basis, status: "overgeslagen", melding: "Deze bankrekening bestaat niet meer of is niet actief." });
        continue;
      }
      const vandaag = amsterdamDayKey(nu);
      const sinds = bepaalSinds({
        vandaag,
        laatsteSuccesDag: staat.laatsteSucces ? amsterdamDayKey(new Date(staat.laatsteSucces)) : null,
        nieuwsteBestaandeBoekdag: await d.nieuwsteBoekdag(bankRekeningId),
      });
      const regels = await d.maakKoppeling(staat).haalTransacties(sinds);
      let nieuw = 0;
      let alBekend = 0;
      let waarschuwing: string | null = null;
      if (regels.length > 0) {
        const r = await d.importeer({ bankRekeningId, bytes: Buffer.from(regelsNaarCsv(rekening.iban, regels), "utf8"), door: BANKKOPPELING_DOOR });
        nieuw = r.nieuw;
        alBekend = r.alBekend;
        waarschuwing = r.waarschuwingen[0] ?? null;
      }
      await d.bewaarStaat(bankRekeningId, { ...staat, laatsteSucces: nu.toISOString(), laatsteFout: null });
      logger.info("bankkoppeling: transacties opgehaald", { bankRekeningId, nieuw, alBekend });
      const melding = stand === "bijna-verlopen" ? `De toestemming bij de bank loopt over ${Math.max(dagen, 0)} dagen af: geef opnieuw toestemming (Beheer, Boekhouding, Bank).` : waarschuwing;
      uit.push({ ...basis, status: "ok", nieuw, alBekend, melding });
    } catch (e) {
      if (e instanceof BankKoppelingFout) {
        const verlopen = e.code === "toestemming-verlopen";
        logger[verlopen ? "error" : "warn"]("bankkoppeling: ophalen mislukt", { reden: e.code, bankRekeningId });
        await bewaarFout(e.code).catch(() => undefined);
        uit.push({ ...basis, status: verlopen ? "verlopen" : "fout", melding: e.message });
      } else {
        // een fout van de import (bv. andere munt) of een onverwachte fout: alleen de soort loggen
        logger.error("bankkoppeling: verwerken mislukt", { reden: "fout", soort: e instanceof Error ? e.name : "onbekend", bankRekeningId });
        uit.push({ ...basis, status: "fout", melding: e instanceof AppError ? e.message : "Het verwerken van de opgehaalde transacties is mislukt. Zie het foutenlogboek." });
      }
    }
  }
  return { status: "klaar", rekeningen: uit };
}

/** Haalt de transacties van alle gekoppelde bankrekeningen op en geeft ze aan de import. Zie het kopje bovenaan. */
export async function haalBankOp(): Promise<OphaalUitkomst> {
  const [{ featureEnabled }, { prisma }, opslag, { enableBankingUitOmgeving }] = await Promise.all([
    import("@/lib/flags"),
    import("@/lib/prisma"),
    import("./opslag"),
    import("./omgeving"),
  ]);
  return haalBankOpMet({
    flagAan: () => featureEnabled(BANKKOPPELING_FLAG),
    staten: opslag.alleKoppelingStaten,
    bewaarStaat: opslag.bewaarKoppelingStaat,
    rekening: async (id) => {
      const r = await prisma.boekBankRekening.findUnique({ where: { id }, select: { iban: true, actief: true, administratie: { select: { actief: true } } } });
      return r ? { iban: r.iban, actief: r.actief && r.administratie.actief } : null;
    },
    nieuwsteBoekdag: async (id) => {
      const t = await prisma.boekBankTransactie.findFirst({ where: { bankRekeningId: id }, orderBy: { boekdatum: "desc" }, select: { boekdatum: true } });
      return t ? t.boekdatum.toISOString().slice(0, 10) : null;
    },
    maakKoppeling: (staat) => enableBankingUitOmgeving().voorRekening(staat.rekeningUid),
    importeer: importeerAfschrift,
    nu: () => new Date(),
  });
}
