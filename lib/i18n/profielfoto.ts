// De teksten van het venster "Profielfoto wijzigen" op Account (21 nov 2026, eigenaar: "als je bij account op je profielfoto
// klikt doet het niks, dat moet opties geven, zie YoungOnes"). Vijf talen, zoals de werker-app. Puur bestand.

import type { BasisLocale } from "@/lib/i18n/config";

export interface ProfielFotoTeksten {
  /** knoplabel op de foto (voor schermlezers) */
  wijzig: string;
  titel: string;
  maken: string;
  kiezen: string;
  verwijderen: string;
  annuleren: string;
  bezig: string;
  fout: string;
}

export const PROFIELFOTO_TEKSTEN: Record<BasisLocale, ProfielFotoTeksten> = {
  nl: {
    wijzig: "Profielfoto wijzigen",
    titel: "Profielfoto wijzigen",
    maken: "Foto maken",
    kiezen: "Kiezen uit bibliotheek",
    verwijderen: "Foto verwijderen",
    annuleren: "Annuleren",
    bezig: "Bezig…",
    fout: "Dat lukte niet. Probeer het opnieuw.",
  },
  en: {
    wijzig: "Change profile photo",
    titel: "Change profile photo",
    maken: "Take photo",
    kiezen: "Choose from library",
    verwijderen: "Remove photo",
    annuleren: "Cancel",
    bezig: "Busy…",
    fout: "That didn't work. Please try again.",
  },
  pl: {
    wijzig: "Zmień zdjęcie profilowe",
    titel: "Zmień zdjęcie profilowe",
    maken: "Zrób zdjęcie",
    kiezen: "Wybierz z galerii",
    verwijderen: "Usuń zdjęcie",
    annuleren: "Anuluj",
    bezig: "Chwileczkę…",
    fout: "Nie udało się. Spróbuj ponownie.",
  },
  ro: {
    wijzig: "Schimbă fotografia de profil",
    titel: "Schimbă fotografia de profil",
    maken: "Fă o fotografie",
    kiezen: "Alege din galerie",
    verwijderen: "Șterge fotografia",
    annuleren: "Anulează",
    bezig: "Se încarcă…",
    fout: "Nu a mers. Încearcă din nou.",
  },
  uk: {
    wijzig: "Змінити фото профілю",
    titel: "Змінити фото профілю",
    maken: "Зробити фото",
    kiezen: "Вибрати з галереї",
    verwijderen: "Видалити фото",
    annuleren: "Скасувати",
    bezig: "Зачекай…",
    fout: "Не вдалося. Спробуй ще раз.",
  },
};
