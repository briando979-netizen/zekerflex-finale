import type { Locale } from "@/lib/i18n/config";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { amsterdamClock, amsterdamParts } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Push texts to workers, in their own app language (lib/i18n/worker-locale.ts).
// Server-only (it reads FREELANCER_DICTS); never import into a client file.
// Amounts stay in Dutch euro notation ("€ 135,00"), the same as on the payslip.
// Machine-assisted translations: native-speaker review recommended.
// ---------------------------------------------------------------------------

export interface WorkerPushTexts {
  hours: string;
  approvedTitle: string;
  approvedPaid: (amount: string) => string;
  approvedSpeed: string;
  approvedPayroll: (week: string) => string;
  approvedAdvance: (amount: string, week: string) => string;
  timeChangedTitle: (title: string) => string;
  timeChangedBody: (when: string) => string;
  cancelledTitle: (title: string) => string;
  cancelledBody: (when: string) => string;
}

export const WORKER_PUSH: Record<Locale, WorkerPushTexts> = {
  nl: {
    hours: "uur",
    approvedTitle: "✅ Je uren zijn goedgekeurd",
    approvedPaid: (a) => `${a} is onderweg naar je rekening.`,
    approvedSpeed: "Je uitbetaling volgt volgens de snelheid die je koos.",
    approvedPayroll: (w) => `Je loon volgt met de verloning van ${w}.`,
    approvedAdvance: (a, w) => `Je voorschot van ${a} is onderweg; de rest volgt met de verloning van ${w}.`,
    timeChangedTitle: (t) => `Nieuwe tijd: ${t}`,
    timeChangedBody: (w) => `De opdrachtgever heeft je dienst verzet naar ${w}.`,
    cancelledTitle: (t) => `Geannuleerd: ${t}`,
    cancelledBody: (w) => `De opdrachtgever heeft je dienst van ${w} geannuleerd. Bekijk de klus voor de vergoeding.`,
  },
  en: {
    hours: "hours",
    approvedTitle: "✅ Your hours have been approved",
    approvedPaid: (a) => `${a} is on its way to your account.`,
    approvedSpeed: "Your payout follows the speed you chose.",
    approvedPayroll: (w) => `Your wage follows with the payroll of ${w}.`,
    approvedAdvance: (a, w) => `Your advance of ${a} is on its way; the rest follows with the payroll of ${w}.`,
    timeChangedTitle: (t) => `New time: ${t}`,
    timeChangedBody: (w) => `The client moved your shift to ${w}.`,
    cancelledTitle: (t) => `Cancelled: ${t}`,
    cancelledBody: (w) => `The client cancelled your shift on ${w}. Open the job to see your compensation.`,
  },
  pl: {
    hours: "godz.",
    approvedTitle: "✅ Twoje godziny zostały zatwierdzone",
    approvedPaid: (a) => `${a} jest w drodze na Twoje konto.`,
    approvedSpeed: "Wypłata nastąpi zgodnie z wybraną przez Ciebie szybkością.",
    approvedPayroll: (w) => `Wynagrodzenie otrzymasz z listą płac za ${w}.`,
    approvedAdvance: (a, w) => `Twoja zaliczka ${a} jest w drodze; reszta przyjdzie z listą płac za ${w}.`,
    timeChangedTitle: (t) => `Nowa godzina: ${t}`,
    timeChangedBody: (w) => `Zleceniodawca przesunął Twoją zmianę na ${w}.`,
    cancelledTitle: (t) => `Odwołano: ${t}`,
    cancelledBody: (w) => `Zleceniodawca odwołał Twoją zmianę ${w}. Otwórz zlecenie, aby zobaczyć rekompensatę.`,
  },
  ro: {
    hours: "ore",
    approvedTitle: "✅ Orele tale au fost aprobate",
    approvedPaid: (a) => `${a} este pe drum spre contul tău.`,
    approvedSpeed: "Plata urmează viteza pe care ai ales-o.",
    approvedPayroll: (w) => `Salariul vine cu statul de plată din ${w}.`,
    approvedAdvance: (a, w) => `Avansul tău de ${a} este pe drum; restul vine cu statul de plată din ${w}.`,
    timeChangedTitle: (t) => `Oră nouă: ${t}`,
    timeChangedBody: (w) => `Clientul ți-a mutat tura la ${w}.`,
    cancelledTitle: (t) => `Anulat: ${t}`,
    cancelledBody: (w) => `Clientul ți-a anulat tura din ${w}. Deschide jobul pentru compensație.`,
  },
  uk: {
    hours: "год",
    approvedTitle: "✅ Ваші години затверджено",
    approvedPaid: (a) => `${a} вже йде на ваш рахунок.`,
    approvedSpeed: "Виплата надійде з обраною вами швидкістю.",
    approvedPayroll: (w) => `Зарплата надійде з розрахунком за ${w}.`,
    approvedAdvance: (a, w) => `Ваш аванс ${a} вже в дорозі; решта надійде з розрахунком за ${w}.`,
    timeChangedTitle: (t) => `Новий час: ${t}`,
    timeChangedBody: (w) => `Замовник переніс вашу зміну на ${w}.`,
    cancelledTitle: (t) => `Скасовано: ${t}`,
    cancelledBody: (w) => `Замовник скасував вашу зміну ${w}. Відкрийте роботу, щоб побачити компенсацію.`,
  },
};

/** "do 5 nov 09:00–17:00" in the worker's language, Dutch time. */
export function pushWhen(locale: Locale, w: { startsAt: Date; endsAt: Date }): string {
  const d = FREELANCER_DICTS[locale].date;
  const p = amsterdamParts(w.startsAt);
  return `${d.wd[p.weekday] ?? ""} ${p.day} ${d.mon[p.month - 1] ?? ""} ${amsterdamClock(w.startsAt)}–${amsterdamClock(w.endsAt)}`;
}
