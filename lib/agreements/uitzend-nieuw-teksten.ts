import type { Locale } from "@/lib/i18n/config";

// De melding "je uitzendovereenkomst is bijgewerkt" in de taal van de werker (12 nov 2026): op het scherm (boven de overeenkomst op
// Verificatie, via GET /api/me/uitzend/contract) en als push (lib/agreements/uitzend-melding.ts). Puur bestand.
// Machine-assisted translations: native-speaker review recommended.

export interface UitzendNieuwTeksten {
  titel: string;
  tekst: string;
  pushTitel: string;
  pushBody: string;
}

export const UITZEND_NIEUW: Record<Locale, UitzendNieuwTeksten> = {
  nl: {
    titel: "Je uitzendovereenkomst is bijgewerkt",
    tekst: "De tekst en de gegevens van de werkgever zijn aangepast. Lees de nieuwe versie en teken opnieuw, anders kun je niet op klussen reageren.",
    pushTitel: "Je uitzendovereenkomst is bijgewerkt",
    pushBody: "Lees de nieuwe versie en teken opnieuw om op klussen te kunnen reageren.",
  },
  en: {
    titel: "Your temporary-work agreement has been updated",
    tekst: "The text and the employer's details have changed. Read the new version and sign again, otherwise you cannot apply for jobs.",
    pushTitel: "Your temporary-work agreement has been updated",
    pushBody: "Read the new version and sign again to be able to apply for jobs.",
  },
  pl: {
    titel: "Twoja umowa o pracę tymczasową została zaktualizowana",
    tekst: "Zmienił się tekst i dane pracodawcy. Przeczytaj nową wersję i podpisz ponownie, w przeciwnym razie nie możesz odpowiadać na zlecenia.",
    pushTitel: "Twoja umowa o pracę tymczasową została zaktualizowana",
    pushBody: "Przeczytaj nową wersję i podpisz ponownie, aby móc odpowiadać na zlecenia.",
  },
  ro: {
    titel: "Contractul tău de muncă temporară a fost actualizat",
    tekst: "Textul și datele angajatorului s-au schimbat. Citește noua versiune și semnează din nou, altfel nu poți aplica la lucrări.",
    pushTitel: "Contractul tău de muncă temporară a fost actualizat",
    pushBody: "Citește noua versiune și semnează din nou ca să poți aplica la lucrări.",
  },
  uk: {
    titel: "Твій договір тимчасової роботи оновлено",
    tekst: "Текст і дані роботодавця змінилися. Прочитай нову версію і підпиши ще раз, інакше ти не зможеш відгукуватися на роботи.",
    pushTitel: "Твій договір тимчасової роботи оновлено",
    pushBody: "Прочитай нову версію і підпиши ще раз, щоб відгукуватися на роботи.",
  },
};
