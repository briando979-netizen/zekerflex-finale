// De teksten van het venster "Vraag uitzendcontract aan" bij een klus van een uitzendpartner (21 nov 2026, eigenaar: "bij
// reageren op een uitzendklus dezelfde weergave als YoungOnes, maar met onze constructie"). Vijf talen, zoals de werker-app.
// {klant} = de naam op de klus, {bureau} = het uitzendbureau. Puur bestand.

import type { BasisLocale } from "@/lib/i18n/config";

export interface UitzendAanvraagTeksten {
  titel: string;
  letOp: string;
  letOpTekst: string;
  zoKop: string;
  stappen: [string, string, string];
  dienst: string;
  uurloon: string;
  uurloonUitleg: string;
  bericht: string;
  berichtPlaats: string;
  bevestig: string;
  annuleren: string;
  verstuurdKop: string;
  verstuurdTekst: string;
}

export const UITZEND_AANVRAAG_TEKSTEN: Record<BasisLocale, UitzendAanvraagTeksten> = {
  nl: {
    titel: "Vraag uitzendcontract aan",
    letOp: "Let op!",
    letOpTekst: "Als het uitzendbureau je aanneemt, verwacht {klant} dat je komt werken.",
    zoKop: "Zo gaat het",
    stappen: [
      "Je aanvraag gaat naar {bureau}, met je naam, e-mailadres en telefoonnummer.",
      "Het bureau neemt binnen 2 werkdagen contact met je op over je uitzendcontract.",
      "Teken je contract, dan plant het bureau je in. Je ziet de klus dan bij Mijn klussen.",
    ],
    dienst: "Dienst",
    uurloon: "Uurloon",
    uurloonUitleg: "bruto per uur, vast volgens de cao van het bureau",
    bericht: "Wil je het bureau iets laten weten? (niet verplicht)",
    berichtPlaats: "Bijvoorbeeld je ervaring of wanneer je bereikbaar bent",
    bevestig: "Bevestig je aanvraag",
    annuleren: "Annuleren",
    verstuurdKop: "Aanvraag verstuurd",
    verstuurdTekst: "{bureau} neemt contact met je op over je uitzendcontract.",
  },
  en: {
    titel: "Request a temp contract",
    letOp: "Please note!",
    letOpTekst: "If the agency hires you, {klant} expects you to come and work.",
    zoKop: "How it works",
    stappen: [
      "Your request goes to {bureau}, with your name, email address and phone number.",
      "The agency contacts you within 2 working days about your temp contract.",
      "Sign your contract and the agency schedules you. You will then see the job under My jobs.",
    ],
    dienst: "Shift",
    uurloon: "Hourly wage",
    uurloonUitleg: "gross per hour, fixed under the agency's collective agreement",
    bericht: "Anything you want the agency to know? (optional)",
    berichtPlaats: "For example your experience or when you can be reached",
    bevestig: "Confirm your request",
    annuleren: "Cancel",
    verstuurdKop: "Request sent",
    verstuurdTekst: "{bureau} will contact you about your temp contract.",
  },
  pl: {
    titel: "Poproś o umowę z agencją",
    letOp: "Uwaga!",
    letOpTekst: "Jeśli agencja cię zatrudni, {klant} oczekuje, że przyjdziesz do pracy.",
    zoKop: "Jak to działa",
    stappen: [
      "Twoja prośba trafia do {bureau}, z imieniem i nazwiskiem, adresem e-mail i numerem telefonu.",
      "Agencja skontaktuje się z tobą w ciągu 2 dni roboczych w sprawie umowy.",
      "Podpisz umowę, a agencja wpisze cię do grafiku. Zlecenie zobaczysz w Moje zlecenia.",
    ],
    dienst: "Zmiana",
    uurloon: "Stawka godzinowa",
    uurloonUitleg: "brutto za godzinę, stała według układu zbiorowego agencji",
    bericht: "Chcesz coś przekazać agencji? (nieobowiązkowe)",
    berichtPlaats: "Na przykład twoje doświadczenie lub kiedy można się z tobą skontaktować",
    bevestig: "Potwierdź prośbę",
    annuleren: "Anuluj",
    verstuurdKop: "Prośba wysłana",
    verstuurdTekst: "{bureau} skontaktuje się z tobą w sprawie umowy.",
  },
  ro: {
    titel: "Cere un contract de muncă temporară",
    letOp: "Atenție!",
    letOpTekst: "Dacă agenția te angajează, {klant} se așteaptă să vii la muncă.",
    zoKop: "Cum funcționează",
    stappen: [
      "Cererea ta ajunge la {bureau}, cu numele, adresa de e-mail și numărul tău de telefon.",
      "Agenția te contactează în 2 zile lucrătoare despre contractul tău.",
      "Semnează contractul și agenția te programează. Vei vedea jobul la Joburile mele.",
    ],
    dienst: "Tură",
    uurloon: "Salariu pe oră",
    uurloonUitleg: "brut pe oră, fix conform contractului colectiv al agenției",
    bericht: "Vrei să transmiți ceva agenției? (opțional)",
    berichtPlaats: "De exemplu experiența ta sau când poți fi contactat",
    bevestig: "Confirmă cererea",
    annuleren: "Anulează",
    verstuurdKop: "Cerere trimisă",
    verstuurdTekst: "{bureau} te va contacta despre contractul tău.",
  },
  uk: {
    titel: "Запросити договір з агенцією",
    letOp: "Увага!",
    letOpTekst: "Якщо агенція тебе найме, {klant} очікує, що ти прийдеш працювати.",
    zoKop: "Як це працює",
    stappen: [
      "Твій запит надходить до {bureau} з твоїм ім'ям, e-mail і номером телефону.",
      "Агенція зв'яжеться з тобою протягом 2 робочих днів щодо договору.",
      "Підпиши договір, і агенція внесе тебе в графік. Роботу побачиш у Мої роботи.",
    ],
    dienst: "Зміна",
    uurloon: "Погодинна оплата",
    uurloonUitleg: "брутто за годину, фіксована за колективним договором агенції",
    bericht: "Хочеш щось передати агенції? (необов'язково)",
    berichtPlaats: "Наприклад, твій досвід або коли з тобою можна зв'язатися",
    bevestig: "Підтвердити запит",
    annuleren: "Скасувати",
    verstuurdKop: "Запит надіслано",
    verstuurdTekst: "{bureau} зв'яжеться з тобою щодо договору.",
  },
};

/**
 * Vult {klant} en {bureau} in. Met split/join in plaats van replaceAll (28 nov 2026): de klus-pagina van de werker laadt dit,
 * en replaceAll kent Safari pas sinds 13.1 (iOS 13.4); daarvoor viel de pagina om. Ook vult een "$&" in een naam zo niets in.
 */
export function vulUitzend(tekst: string, w: { klant: string; bureau: string }): string {
  return tekst.split("{klant}").join(w.klant).split("{bureau}").join(w.bureau);
}
