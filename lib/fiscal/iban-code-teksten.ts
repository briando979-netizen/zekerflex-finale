// Pure hulpjes (geen prisma/kv) voor het codeveld bij een gewijzigd IBAN. De
// server stuurt een 423/429/503 met een eigen `code` (lib/fiscal/iban-bevestiging.ts);
// de werker-app toont de tekst in zijn eigen taal en valt terug op de
// Nederlandse servertekst voor een onbekende code.

export interface IbanCodeTexts {
  label: string;
  placeholder: string;
  /** Knop: een (nieuwe) code laten sturen en opnieuw opslaan. */
  resend: string;
  sent: string;
  need2fa: string;
  invalid: string;
  expired: string;
  tooMany: string;
  mailFailed: string;
}

/** Is dit een antwoord waarbij het codeveld moet verschijnen of de melding moet veranderen? */
export function isIbanCodeFout(status: number, code: unknown): code is string {
  return (status === 423 || status === 429 || status === 503) && typeof code === "string" && code.startsWith("IBAN_");
}

export function ibanCodeBericht(code: string, t: IbanCodeTexts, serverMessage?: string): string {
  switch (code) {
    case "IBAN_BEVESTIGING_NODIG":
      return t.sent;
    case "IBAN_2FA_NODIG":
      return t.need2fa;
    case "IBAN_CODE_ONGELDIG":
      return t.invalid;
    case "IBAN_CODE_VERLOPEN":
      return t.expired;
    case "IBAN_TE_VEEL_POGINGEN":
      return t.tooMany;
    case "IBAN_MAIL_MISLUKT":
      return t.mailFailed;
    default:
      return serverMessage ?? t.invalid;
  }
}
