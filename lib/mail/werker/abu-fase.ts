import { vulIn } from "@/lib/i18n/vul-in";
import type { MailTaal } from "@/lib/mail/vorm";
import type { MailInput } from "@/lib/mail";

// ---------------------------------------------------------------------------
// De mail aan een uitzendkracht wiens ABU-fase overgaat (lib/payroll/abu-phase-sweep.ts), in de app-taal van de werker. Platte tekst,
// zoals die altijd was; in het Nederlands ongewijzigd. De mail aan het beheer blijft Nederlands en staat in de sweep zelf.
// Machine-assisted translations: native-speaker review recommended.
// ---------------------------------------------------------------------------

interface Tekst {
  subject: string;
  tekst: string;
}

const TEKST: Record<MailTaal, Tekst> = {
  nl: {
    subject: "Je ABU-fase is overgegaan naar fase {naar}",
    tekst:
      "Hoi {naam},\n\n" +
      "Je bent overgegaan van ABU-fase {van} naar fase {naar} " +
      "({weken} gewerkte weken). Dit kan gevolgen hebben voor je contractvorm, " +
      "opzegtermijn en pensioenopbouw (StiPP).\n\n" +
      "Bekijk je actuele status op /dashboard/verloning.\n\nZekerFlex",
  },
  en: {
    subject: "Your ABU phase has moved to phase {naar}",
    tekst:
      "Hi {naam},\n\n" +
      "You have moved from ABU phase {van} to phase {naar} " +
      "({weken} weeks worked). This can affect your type of contract, " +
      "notice period and pension accrual (StiPP).\n\n" +
      "Check your current status at /dashboard/verloning.\n\nZekerFlex",
  },
  pl: {
    subject: "Twoja faza ABU zmieniła się na fazę {naar}",
    tekst:
      "Cześć {naam},\n\n" +
      "Przeszedłeś/przeszłaś z fazy ABU {van} do fazy {naar} " +
      "({weken} przepracowanych tygodni). Może to wpłynąć na rodzaj umowy, " +
      "okres wypowiedzenia i narastanie emerytury (StiPP).\n\n" +
      "Aktualny status zobaczysz na /dashboard/verloning.\n\nZekerFlex",
  },
  ro: {
    subject: "Faza ta ABU a trecut la faza {naar}",
    tekst:
      "Salut {naam},\n\n" +
      "Ai trecut de la faza ABU {van} la faza {naar} " +
      "({weken} săptămâni lucrate). Acest lucru poate influența tipul de contract, " +
      "perioada de preaviz și acumularea pensiei (StiPP).\n\n" +
      "Vezi statusul actual la /dashboard/verloning.\n\nZekerFlex",
  },
  uk: {
    subject: "Твоя фаза ABU змінилася на фазу {naar}",
    tekst:
      "Привіт, {naam}!\n\n" +
      "Ти перейшов/перейшла з фази ABU {van} на фазу {naar} " +
      "({weken} відпрацьованих тижнів). Це може вплинути на вид договору, " +
      "строк попередження про звільнення та накопичення пенсії (StiPP).\n\n" +
      "Актуальний статус дивись на /dashboard/verloning.\n\nZekerFlex",
  },
};

export function abuFaseEmailT(input: { fullName: string; van: string; naar: string; weken: number }, taal: MailTaal): MailInput {
  const t = TEKST[taal];
  const w = { naam: input.fullName, van: input.van, naar: input.naar, weken: input.weken };
  return { to: "", subject: vulIn(t.subject, w), kind: "abu-fase-overgang", text: vulIn(t.tekst, w) };
}
