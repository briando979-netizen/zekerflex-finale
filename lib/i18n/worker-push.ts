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
  perHour: string;
  standbyTitle: (title: string) => string;
  standbyBody: (details: string) => string;
  replacementTitle: (title: string) => string;
  replacementBody: (name: string, when: string, branch: string) => string;
  claimApprovedTitle: string;
  claimApprovedBody: (title: string, amount: string) => string;
  claimRejectedTitle: string;
  employerClaimTitle: string;
  employerClaimBody: (title: string, amount: string) => string;
  employerWaivedTitle: string;
  employerWaivedBody: (title: string) => string;
  correctionTitle: string;
  correctionBody: (title: string, from: string, to: string) => string;
  noShowTitle: (title: string) => string;
  noShowBody: (title: string, branch: string) => string;
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
    perHour: "/u",
    standbyTitle: (t) => `⚡ Spoeddienst: ${t}`,
    standbyBody: (d) => `${d}. Je staat op standby: wie het eerst aanneemt, heeft hem.`,
    replacementTitle: (t) => `Jij neemt de klus over: ${t}`,
    replacementBody: (n, w, b) => `${n} heeft jou gekozen als vervanger: ${w} bij ${b}. Bevestig je komst in de app.`,
    claimApprovedTitle: "Je annuleringsclaim is goedgekeurd",
    claimApprovedBody: (t, a) => `${t}: je ontvangt ${a} bij je eerstvolgende uitbetaling.`,
    claimRejectedTitle: "Je annuleringsclaim is afgewezen",
    employerClaimTitle: "De opdrachtgever claimt een vergoeding",
    employerClaimBody: (t, a) => `${t}: ${a} wegens te laat afzeggen of niet opdagen. Je krijgt hierover een factuur per mail.`,
    employerWaivedTitle: "Geen vergoeding geclaimd",
    employerWaivedBody: (t) => `De opdrachtgever ziet af van een vergoeding voor ${t}.`,
    correctionTitle: "Correctie op je uren voorgesteld",
    correctionBody: (t, f, to) => `${t}: ${f} → ${to} uur. Bekijk het en reageer in de app.`,
    noShowTitle: (t) => `Niet ingecheckt: ${t}`,
    noShowBody: (t, b) => `Je staat als niet opgekomen voor ${t} bij ${b}. Was je er wel? Stuur de opdrachtgever direct een bericht in de app.`,
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
    perHour: "/h",
    standbyTitle: (t) => `⚡ Urgent shift: ${t}`,
    standbyBody: (d) => `${d}. You're on standby: first to accept gets it.`,
    replacementTitle: (t) => `You're taking over: ${t}`,
    replacementBody: (n, w, b) => `${n} picked you as replacement: ${w} at ${b}. Confirm you're coming in the app.`,
    claimApprovedTitle: "Your cancellation claim was approved",
    claimApprovedBody: (t, a) => `${t}: you'll receive ${a} with your next payout.`,
    claimRejectedTitle: "Your cancellation claim was rejected",
    employerClaimTitle: "The client is claiming compensation",
    employerClaimBody: (t, a) => `${t}: ${a} for cancelling late or not showing up. You'll get an invoice by email.`,
    employerWaivedTitle: "No compensation claimed",
    employerWaivedBody: (t) => `The client waives compensation for ${t}.`,
    correctionTitle: "Correction to your hours proposed",
    correctionBody: (t, f, to) => `${t}: ${f} → ${to} hours. Review it and respond in the app.`,
    noShowTitle: (t) => `Not checked in: ${t}`,
    noShowBody: (t, b) => `You're marked as a no-show for ${t} at ${b}. Were you there? Message the client right away in the app.`,
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
    perHour: "/godz.",
    standbyTitle: (t) => `⚡ Pilna zmiana: ${t}`,
    standbyBody: (d) => `${d}. Jesteś w trybie gotowości: kto pierwszy przyjmie, ten dostaje.`,
    replacementTitle: (t) => `Przejmujesz zlecenie: ${t}`,
    replacementBody: (n, w, b) => `${n} wybrał(a) Cię na zastępstwo: ${w} w ${b}. Potwierdź przyjście w aplikacji.`,
    claimApprovedTitle: "Twoje roszczenie za odwołanie zostało zatwierdzone",
    claimApprovedBody: (t, a) => `${t}: otrzymasz ${a} przy najbliższej wypłacie.`,
    claimRejectedTitle: "Twoje roszczenie za odwołanie zostało odrzucone",
    employerClaimTitle: "Zleceniodawca żąda rekompensaty",
    employerClaimBody: (t, a) => `${t}: ${a} za zbyt późne odwołanie lub nieobecność. Fakturę otrzymasz e-mailem.`,
    employerWaivedTitle: "Bez żądania rekompensaty",
    employerWaivedBody: (t) => `Zleceniodawca rezygnuje z rekompensaty za ${t}.`,
    correctionTitle: "Zaproponowano korektę Twoich godzin",
    correctionBody: (t, f, to) => `${t}: ${f} → ${to} godz. Sprawdź i odpowiedz w aplikacji.`,
    noShowTitle: (t) => `Brak zameldowania: ${t}`,
    noShowBody: (t, b) => `Masz status nieobecności na ${t} w ${b}. Byłeś(-aś) na miejscu? Napisz od razu do zleceniodawcy w aplikacji.`,
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
    perHour: "/oră",
    standbyTitle: (t) => `⚡ Tură urgentă: ${t}`,
    standbyBody: (d) => `${d}. Ești în standby: primul care acceptă o primește.`,
    replacementTitle: (t) => `Preiei jobul: ${t}`,
    replacementBody: (n, w, b) => `${n} te-a ales ca înlocuitor: ${w} la ${b}. Confirmă prezența în aplicație.`,
    claimApprovedTitle: "Cererea ta de compensație a fost aprobată",
    claimApprovedBody: (t, a) => `${t}: primești ${a} la următoarea plată.`,
    claimRejectedTitle: "Cererea ta de compensație a fost respinsă",
    employerClaimTitle: "Clientul cere o compensație",
    employerClaimBody: (t, a) => `${t}: ${a} pentru anulare târzie sau neprezentare. Vei primi o factură pe e-mail.`,
    employerWaivedTitle: "Nicio compensație cerută",
    employerWaivedBody: (t) => `Clientul renunță la compensație pentru ${t}.`,
    correctionTitle: "Corectură propusă pentru orele tale",
    correctionBody: (t, f, to) => `${t}: ${f} → ${to} ore. Verifică și răspunde în aplicație.`,
    noShowTitle: (t) => `Fără check-in: ${t}`,
    noShowBody: (t, b) => `Ești marcat ca absent la ${t} la ${b}. Ai fost acolo? Scrie-i imediat clientului în aplicație.`,
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
    perHour: "/год",
    standbyTitle: (t) => `⚡ Термінова зміна: ${t}`,
    standbyBody: (d) => `${d}. Ви в режимі очікування: хто перший прийме, той отримає.`,
    replacementTitle: (t) => `Ви берете роботу: ${t}`,
    replacementBody: (n, w, b) => `${n} обрав(ла) вас на заміну: ${w} у ${b}. Підтвердьте прихід у застосунку.`,
    claimApprovedTitle: "Вашу вимогу за скасування затверджено",
    claimApprovedBody: (t, a) => `${t}: ви отримаєте ${a} з наступною виплатою.`,
    claimRejectedTitle: "Вашу вимогу за скасування відхилено",
    employerClaimTitle: "Замовник вимагає компенсацію",
    employerClaimBody: (t, a) => `${t}: ${a} за пізнє скасування або неявку. Рахунок надійде електронною поштою.`,
    employerWaivedTitle: "Компенсацію не вимагають",
    employerWaivedBody: (t) => `Замовник відмовляється від компенсації за ${t}.`,
    correctionTitle: "Запропоновано виправлення ваших годин",
    correctionBody: (t, f, to) => `${t}: ${f} → ${to} год. Перегляньте та дайте відповідь у застосунку.`,
    noShowTitle: (t) => `Без відмітки: ${t}`,
    noShowBody: (t, b) => `Вас позначено як відсутнього на ${t} у ${b}. Ви були там? Одразу напишіть замовнику в застосунку.`,
  },
};

/** "do 5/11 19:00" in the worker's language, Dutch time (short, for offers). */
export function pushDay(locale: Locale, d: Date): string {
  const p = amsterdamParts(d);
  return `${FREELANCER_DICTS[locale].date.wd[p.weekday] ?? ""} ${p.day}/${p.month} ${amsterdamClock(d)}`;
}

/** "€ 19,00/u" with the worker's own per-hour unit. */
export function pushRate(t: WorkerPushTexts, cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace(".", ",")}${t.perHour}`;
}

/** "do 5 nov 09:00–17:00" in the worker's language, Dutch time. */
export function pushWhen(locale: Locale, w: { startsAt: Date; endsAt: Date }): string {
  const d = FREELANCER_DICTS[locale].date;
  const p = amsterdamParts(w.startsAt);
  return `${d.wd[p.weekday] ?? ""} ${p.day} ${d.mon[p.month - 1] ?? ""} ${amsterdamClock(w.startsAt)}–${amsterdamClock(w.endsAt)}`;
}
