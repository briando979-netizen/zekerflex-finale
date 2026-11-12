import type { Locale } from "@/lib/i18n/config";

// De kaart "Nog 1 stap: je ID" bovenaan Verificatie (12 nov 2026). Meting: van de 6 nieuwe werkers die na de gegevens stilstonden, hadden er 5
// de ID-scan niet eens gestart ('Laten we beginnen' geklikt: 0 van 5, bij wie wel instuurde 7 van 9). De kaart zegt wat er nog moet en springt
// naar de bestaande ID-stap (#id-stap in OnboardingForm); er is geen tweede startpad naast IdScan. Puur bestand, de server-pagina kiest de taal.
// Machine-assisted translations: native-speaker review recommended.

export interface IdKaartTeksten {
  kop: string;
  tekst: string;
  knop: string;
}

export const ID_KAART: Record<Locale, IdKaartTeksten> = {
  nl: { kop: "Nog 1 stap: je ID (2 minuten)", tekst: "Maak een foto van je identiteitsbewijs en een selfie. Zo weten opdrachtgevers dat jij het echt bent.", knop: "ID-scan starten" },
  en: { kop: "1 step left: your ID (2 minutes)", tekst: "Take a photo of your ID and a selfie. That way clients know it is really you.", knop: "Start the ID scan" },
  pl: { kop: "Jeszcze 1 krok: Twój dokument (2 minuty)", tekst: "Zrób zdjęcie dokumentu tożsamości i selfie. Dzięki temu zleceniodawcy wiedzą, że to naprawdę Ty.", knop: "Rozpocznij skan dokumentu" },
  ro: { kop: "Încă 1 pas: actul tău de identitate (2 minute)", tekst: "Fă o fotografie actului de identitate și un selfie. Așa știu clienții că ești chiar tu.", knop: "Începe scanarea actului" },
  uk: { kop: "Ще 1 крок: твій документ (2 хвилини)", tekst: "Сфотографуй документ, що посвідчує особу, і зроби селфі. Так замовники знають, що це справді ти.", knop: "Почати сканування документа" },
};

/** De tekst van de hoofdknop van het introscherm van de ID-scan (lib/i18n/scan-extra.ts `beginnen`): voorheen "Laten we beginnen". */
export const ID_BEGINNEN: Record<Locale, string> = {
  nl: "ID-scan starten (2 minuten)",
  en: "Start ID scan (2 minutes)",
  pl: "Rozpocznij skan dokumentu (2 minuty)",
  ro: "Începe scanarea actului (2 minute)",
  uk: "Почати сканування документа (2 хвилини)",
};
