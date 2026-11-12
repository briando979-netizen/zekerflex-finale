import type { MailTaal } from "@/lib/mail/vorm";
import { vulIn } from "@/lib/i18n/vul-in";

// ---------------------------------------------------------------------------
// De mail met de bevestigingscode voor een nieuw rekeningnummer, in de app-taal van de werker. Puur bestand; de aanroeper is
// lib/fiscal/iban-bevestiging.ts. Toont alleen het gemaskeerde rekeningnummer ({iban}: de laatste vier tekens).
// Machine-assisted translations: native-speaker review recommended.
// ---------------------------------------------------------------------------

const TEKSTEN: Record<MailTaal, { onderwerp: string; tekst: string }> = {
  nl: {
    onderwerp: "Je bevestigingscode voor een nieuw rekeningnummer",
    tekst:
      "Hoi {naam},\n\nJe wilt je rekeningnummer voor uitbetalingen wijzigen naar {iban}. Vul deze code in om dat te bevestigen; hij is 15 minuten geldig:\n\n{code}\n\nHeb jij dit niet gedaan? Verander dan direct je wachtwoord en negeer deze mail: zonder de code verandert er niets aan je uitbetalingen.",
  },
  en: {
    onderwerp: "Your confirmation code for a new bank account number",
    tekst:
      "Hi {naam},\n\nYou want to change your bank account number for payouts to {iban}. Enter this code to confirm it; it is valid for 15 minutes:\n\n{code}\n\nWasn't you? Then change your password right away and ignore this email: without the code, nothing changes about your payouts.",
  },
  pl: {
    onderwerp: "Twój kod potwierdzający dla nowego numeru konta",
    tekst:
      "Cześć {naam},\n\nChcesz zmienić numer konta do wypłat na {iban}. Wpisz ten kod, aby to potwierdzić; jest ważny przez 15 minut:\n\n{code}\n\nTo nie Ty? Natychmiast zmień hasło i zignoruj tę wiadomość: bez kodu nic się nie zmieni w Twoich wypłatach.",
  },
  ro: {
    onderwerp: "Codul tău de confirmare pentru un număr de cont nou",
    tekst:
      "Salut {naam},\n\nVrei să schimbi numărul contului pentru plăți în {iban}. Introdu acest cod pentru a confirma; este valabil 15 minute:\n\n{code}\n\nNu ai fost tu? Schimbă imediat parola și ignoră acest e-mail: fără cod nu se schimbă nimic la plățile tale.",
  },
  uk: {
    onderwerp: "Твій код підтвердження для нового номера рахунку",
    tekst:
      "Привіт, {naam}!\n\nТи хочеш змінити номер рахунку для виплат на {iban}. Введи цей код, щоб підтвердити; він дійсний 15 хвилин:\n\n{code}\n\nЦе був не ти? Одразу зміни пароль та ігноруй цей лист: без коду нічого не зміниться у твоїх виплатах.",
  },
};

/** De mail met de code om een nieuw rekeningnummer te bevestigen. `iban` is al gemaskeerd. */
export function ibanCodeMailT(voornaam: string, iban: string, code: string, taal: MailTaal): { subject: string; text: string } {
  const t = TEKSTEN[taal];
  return { subject: t.onderwerp, text: vulIn(t.tekst, { naam: voornaam, iban, code }) };
}
