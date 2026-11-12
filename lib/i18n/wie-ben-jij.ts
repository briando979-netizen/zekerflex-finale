import type { Locale } from "@/lib/i18n/config";

// ---------------------------------------------------------------------------
// Teksten van het stappenscherm "Hey! Wie ben jij?" op /dashboard/verificatie
// (components/app/WieBenJij*.tsx), in de vijf talen van de werker-app.
// Gekoppeld aan lib/i18n/freelancer.ts als `wie`, dus in de browser via useFT().wie.
// ---------------------------------------------------------------------------

export interface WieTeksten {
  terug: string;
  sluiten: string;
  stapVan: string;
  persoon: {
    kop: string; uitleg: string; voornaam: string; achternaam: string; geboortedatum: string; kiesDatum: string;
    land: string; landAria: string; telefoon: string; opleiding: string; opleidingKies: string; opslaan: string; bezig: string; naamVast: string;
    fout: { voornaam: string; achternaam: string; datum: string; onder18: string; telefoon: string; algemeen: string; offline: string; fix: string };
  };
  datum: { titel: string; dag: string; maand: string; jaar: string; bevestigen: string; annuleren: string; wielHint: string; maanden: string[] };
  opl: { niveauTitel: string; wis: string; richtingTitel: string; zoek: string; geenResultaat: string; annuleren: string; gekozen: string };
  woon: { kop: string; kopBedrijf: string; verder: string; opslaanKlaar: string };
  id: {
    kop: string; tipKop: string; tip1: string; tip2: string; tip3: string;
    nlEtiket: string; nlTitel: string; nlUitleg: string; nlPunt: string; nlKnop: string;
    euEtiket: string; euTitel: string; euUitleg: string; euPunt: string; euKnop: string;
    hulp: string; anders: string;
    /** twee keuzes (12 nov 2026): automatisch met de camera, of zelf foto's maken */
    autoEtiket: string; autoTitel: string; autoUitleg: string; zelfEtiket: string; zelfTitel: string; zelfUitleg: string; zelfKnop: string;
  };
}

export const WIE_TEKSTEN: Record<Locale, WieTeksten> = {
  "nl": {
    "terug": "Terug",
    "sluiten": "Sluiten",
    "stapVan": "Stap {n} van {totaal}",
    "persoon": {
      "kop": "Hey! Wie ben jij?",
      "uitleg": "Vul je gegevens in zoals ze op je identiteitsbewijs staan.",
      "voornaam": "Voornaam",
      "achternaam": "Achternaam",
      "geboortedatum": "Geboortedatum",
      "kiesDatum": "Kies je geboortedatum",
      "land": "Land",
      "landAria": "Landnummer",
      "telefoon": "Telefoon",
      "opleiding": "Opleiding",
      "opleidingKies": "Kies je opleiding (niet verplicht)",
      "opslaan": "Opslaan",
      "bezig": "Even opslaan…",
      "naamVast": "Je naam is bevestigd met je identiteitsbewijs en staat vast.",
      "fout": {
        "voornaam": "Vul je voornaam in.",
        "achternaam": "Vul je achternaam in.",
        "datum": "Kies een bestaande geboortedatum.",
        "onder18": "Je moet minimaal 18 jaar zijn om via ZekerFlex te werken.",
        "telefoon": "Vul een geldig telefoonnummer in, bijvoorbeeld 06 12345678.",
        "algemeen": "Opslaan lukte niet. Probeer het opnieuw.",
        "offline": "Geen verbinding. Probeer het opnieuw.",
        "fix": "Controleer de gemarkeerde velden."
      }
    },
    "datum": {
      "titel": "Wat is je geboortedatum?",
      "dag": "Dag",
      "maand": "Maand",
      "jaar": "Jaar",
      "bevestigen": "Bevestigen",
      "annuleren": "Annuleren",
      "wielHint": "Kies met de pijltjes omhoog en omlaag.",
      "maanden": [
        "januari",
        "februari",
        "maart",
        "april",
        "mei",
        "juni",
        "juli",
        "augustus",
        "september",
        "oktober",
        "november",
        "december"
      ]
    },
    "opl": {
      "niveauTitel": "Selecteer je opleidingsniveau",
      "wis": "Keuze wissen",
      "richtingTitel": "Selecteer je studierichting",
      "zoek": "Zoek een studierichting",
      "geenResultaat": "Geen studierichting gevonden.",
      "annuleren": "Annuleren",
      "gekozen": "gekozen"
    },
    "woon": {
      "kop": "Waar woon je?",
      "kopBedrijf": "Je werk en waar je woont",
      "verder": "Verder",
      "opslaanKlaar": "Opslaan"
    },
    "id": {
      "kop": "ID-check",
      "tipKop": "Zo maak je de juiste foto",
      "tip1": "Leg je identiteitsdocument op een lege, effen ondergrond.",
      "tip2": "Zorg dat alleen het document in beeld is, zonder lichaamsdelen of andere spullen.",
      "tip3": "Let op: wij zien de hele foto, ook wat buiten het kader valt.",
      "nlEtiket": "Nederlandse identiteit",
      "nlTitel": "Nederlands paspoort, ID-kaart of verblijfsvergunning",
      "nlUitleg": "Heb je een geldig Nederlands paspoort, identiteitskaart of verblijfsvergunning? Gebruik deze optie voor verificatie.",
      "nlPunt": "Rijbewijs is niet toegestaan.",
      "nlKnop": "Start met Nederlands ID",
      "euEtiket": "EU/EER identiteit",
      "euTitel": "Buitenlands paspoort of ID-kaart",
      "euUitleg": "Heb je een geldig identiteitsbewijs uit een EU/EER-land of Zwitserland? Gebruik deze optie voor internationale verificatie.",
      "euPunt": "Inclusief Zwitserland.",
      "euKnop": "Start met buitenlands ID",
      "autoEtiket": "Automatisch · aanbevolen",
      "autoTitel": "Scan je ID met je camera",
      "autoUitleg": "De camera leest je paspoort, ID-kaart of verblijfsvergunning en helpt je bij de selfies. Klopt alles, dan ben je meteen geverifieerd.",
      "zelfEtiket": "Zelf foto's maken",
      "zelfTitel": "Maak zelf de foto's",
      "zelfUitleg": "Maak met je camera een foto van je document, een selfie en een selfie met je hoofd een klein stukje opzij. Ook dan controleren we het automatisch.",
      "zelfKnop": "Zelf foto's maken",
      "hulp": "Hulp nodig?",
      "anders": "Andere manier om te verifiëren"
    }
  },
  "en": {
    "terug": "Back",
    "sluiten": "Close",
    "stapVan": "Step {n} of {totaal}",
    "persoon": {
      "kop": "Hey! Who are you?",
      "uitleg": "Fill in your details as they appear on your identity document.",
      "voornaam": "First name",
      "achternaam": "Last name",
      "geboortedatum": "Date of birth",
      "kiesDatum": "Choose your date of birth",
      "land": "Country",
      "landAria": "Country code",
      "telefoon": "Phone",
      "opleiding": "Education",
      "opleidingKies": "Choose your education (optional)",
      "opslaan": "Save",
      "bezig": "Saving…",
      "naamVast": "Your name was confirmed with your identity document and is fixed.",
      "fout": {
        "voornaam": "Enter your first name.",
        "achternaam": "Enter your last name.",
        "datum": "Choose a date of birth that exists.",
        "onder18": "You must be at least 18 to work through ZekerFlex.",
        "telefoon": "Enter a valid phone number, for example 06 12345678.",
        "algemeen": "Saving failed. Please try again.",
        "offline": "No connection. Please try again.",
        "fix": "Check the marked fields."
      }
    },
    "datum": {
      "titel": "What is your date of birth?",
      "dag": "Day",
      "maand": "Month",
      "jaar": "Year",
      "bevestigen": "Confirm",
      "annuleren": "Cancel",
      "wielHint": "Choose with the up and down arrow keys.",
      "maanden": [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
      ]
    },
    "opl": {
      "niveauTitel": "Select your education level",
      "wis": "Clear choice",
      "richtingTitel": "Select your field of study",
      "zoek": "Search for a field of study",
      "geenResultaat": "No field of study found.",
      "annuleren": "Cancel",
      "gekozen": "selected"
    },
    "woon": {
      "kop": "Where do you live?",
      "kopBedrijf": "Your work and where you live",
      "verder": "Continue",
      "opslaanKlaar": "Save"
    },
    "id": {
      "kop": "ID check",
      "tipKop": "How to take the right photo",
      "tip1": "Put your identity document on an empty, plain surface.",
      "tip2": "Make sure only the document is in the picture, without body parts or other items.",
      "tip3": "Note: we see the whole photo, including what falls outside the frame.",
      "nlEtiket": "Dutch identity",
      "nlTitel": "Dutch passport, ID card or residence permit",
      "nlUitleg": "Do you have a valid Dutch passport, identity card or residence permit? Use this option for verification.",
      "nlPunt": "Driving licences are not accepted.",
      "nlKnop": "Start with Dutch ID",
      "euEtiket": "EU/EEA identity",
      "euTitel": "Foreign passport or ID card",
      "euUitleg": "Do you have a valid identity document from an EU/EEA country or Switzerland? Use this option for international verification.",
      "euPunt": "Including Switzerland.",
      "euKnop": "Start with foreign ID",
      "autoEtiket": "Automatic · recommended",
      "autoTitel": "Scan your ID with your camera",
      "autoUitleg": "The camera reads your passport, ID card or residence permit and helps you with the selfies. If everything matches, you're verified right away.",
      "zelfEtiket": "Take your own photos",
      "zelfTitel": "Take the photos yourself",
      "zelfUitleg": "Use your camera to take a photo of your document, a selfie and a selfie with your head turned slightly to the side. We check those automatically too.",
      "zelfKnop": "Take photos myself",
      "hulp": "Need help?",
      "anders": "Another way to verify"
    }
  },
  "pl": {
    "terug": "Wstecz",
    "sluiten": "Zamknij",
    "stapVan": "Krok {n} z {totaal}",
    "persoon": {
      "kop": "Hej! Kim jesteś?",
      "uitleg": "Wpisz dane tak, jak są na Twoim dokumencie tożsamości.",
      "voornaam": "Imię",
      "achternaam": "Nazwisko",
      "geboortedatum": "Data urodzenia",
      "kiesDatum": "Wybierz datę urodzenia",
      "land": "Kraj",
      "landAria": "Numer kierunkowy kraju",
      "telefoon": "Telefon",
      "opleiding": "Wykształcenie",
      "opleidingKies": "Wybierz wykształcenie (nieobowiązkowe)",
      "opslaan": "Zapisz",
      "bezig": "Zapisywanie…",
      "naamVast": "Twoje imię i nazwisko zostało potwierdzone dokumentem tożsamości i nie można go zmienić.",
      "fout": {
        "voornaam": "Wpisz imię.",
        "achternaam": "Wpisz nazwisko.",
        "datum": "Wybierz istniejącą datę urodzenia.",
        "onder18": "Aby pracować przez ZekerFlex, musisz mieć co najmniej 18 lat.",
        "telefoon": "Wpisz prawidłowy numer telefonu, np. 06 12345678.",
        "algemeen": "Nie udało się zapisać. Spróbuj ponownie.",
        "offline": "Brak połączenia. Spróbuj ponownie.",
        "fix": "Sprawdź zaznaczone pola."
      }
    },
    "datum": {
      "titel": "Jaka jest Twoja data urodzenia?",
      "dag": "Dzień",
      "maand": "Miesiąc",
      "jaar": "Rok",
      "bevestigen": "Potwierdź",
      "annuleren": "Anuluj",
      "wielHint": "Wybierz strzałkami w górę i w dół.",
      "maanden": [
        "styczeń",
        "luty",
        "marzec",
        "kwiecień",
        "maj",
        "czerwiec",
        "lipiec",
        "sierpień",
        "wrzesień",
        "październik",
        "listopad",
        "grudzień"
      ]
    },
    "opl": {
      "niveauTitel": "Wybierz poziom wykształcenia",
      "wis": "Wyczyść wybór",
      "richtingTitel": "Wybierz kierunek studiów",
      "zoek": "Szukaj kierunku",
      "geenResultaat": "Nie znaleziono kierunku.",
      "annuleren": "Anuluj",
      "gekozen": "wybrano"
    },
    "woon": {
      "kop": "Gdzie mieszkasz?",
      "kopBedrijf": "Twoja praca i miejsce zamieszkania",
      "verder": "Dalej",
      "opslaanKlaar": "Zapisz"
    },
    "id": {
      "kop": "Weryfikacja ID",
      "tipKop": "Jak zrobić dobre zdjęcie",
      "tip1": "Połóż dokument tożsamości na pustej, jednolitej powierzchni.",
      "tip2": "Zadbaj, by w kadrze był tylko dokument, bez części ciała ani innych przedmiotów.",
      "tip3": "Uwaga: widzimy całe zdjęcie, także to, co jest poza ramką.",
      "nlEtiket": "Tożsamość holenderska",
      "nlTitel": "Holenderski paszport, dowód osobisty lub karta pobytu",
      "nlUitleg": "Masz ważny holenderski paszport, dowód osobisty lub kartę pobytu? Użyj tej opcji do weryfikacji.",
      "nlPunt": "Prawo jazdy nie jest akceptowane.",
      "nlKnop": "Zacznij z holenderskim ID",
      "euEtiket": "Tożsamość UE/EOG",
      "euTitel": "Zagraniczny paszport lub dowód osobisty",
      "euUitleg": "Masz ważny dokument tożsamości z kraju UE/EOG lub ze Szwajcarii? Użyj tej opcji do weryfikacji międzynarodowej.",
      "euPunt": "W tym Szwajcaria.",
      "euKnop": "Zacznij z zagranicznym ID",
      "autoEtiket": "Automatycznie · polecane",
      "autoTitel": "Zeskanuj dokument aparatem",
      "autoUitleg": "Aparat odczyta Twój paszport, dowód osobisty lub dokument pobytowy i pomoże Ci przy selfie. Jeśli wszystko się zgadza, od razu jesteś zweryfikowany.",
      "zelfEtiket": "Własne zdjęcia",
      "zelfTitel": "Zrób zdjęcia samodzielnie",
      "zelfUitleg": "Zrób aparatem zdjęcie dokumentu, selfie i selfie z głową lekko obróconą w bok. Je też sprawdzamy automatycznie.",
      "zelfKnop": "Zrobię zdjęcia sam",
      "hulp": "Potrzebujesz pomocy?",
      "anders": "Inny sposób weryfikacji"
    }
  },
  "ro": {
    "terug": "Înapoi",
    "sluiten": "Închide",
    "stapVan": "Pasul {n} din {totaal}",
    "persoon": {
      "kop": "Hei! Cine ești?",
      "uitleg": "Completează datele așa cum apar pe actul tău de identitate.",
      "voornaam": "Prenume",
      "achternaam": "Nume de familie",
      "geboortedatum": "Data nașterii",
      "kiesDatum": "Alege data nașterii",
      "land": "Țara",
      "landAria": "Prefix de țară",
      "telefoon": "Telefon",
      "opleiding": "Studii",
      "opleidingKies": "Alege studiile (opțional)",
      "opslaan": "Salvează",
      "bezig": "Se salvează…",
      "naamVast": "Numele tău a fost confirmat cu actul de identitate și nu se mai poate schimba.",
      "fout": {
        "voornaam": "Completează prenumele.",
        "achternaam": "Completează numele de familie.",
        "datum": "Alege o dată de naștere care există.",
        "onder18": "Trebuie să ai cel puțin 18 ani ca să lucrezi prin ZekerFlex.",
        "telefoon": "Introdu un număr de telefon valid, de exemplu 06 12345678.",
        "algemeen": "Salvarea nu a reușit. Încearcă din nou.",
        "offline": "Fără conexiune. Încearcă din nou.",
        "fix": "Verifică câmpurile marcate."
      }
    },
    "datum": {
      "titel": "Care este data nașterii tale?",
      "dag": "Ziua",
      "maand": "Luna",
      "jaar": "Anul",
      "bevestigen": "Confirmă",
      "annuleren": "Anulează",
      "wielHint": "Alege cu săgețile sus și jos.",
      "maanden": [
        "ianuarie",
        "februarie",
        "martie",
        "aprilie",
        "mai",
        "iunie",
        "iulie",
        "august",
        "septembrie",
        "octombrie",
        "noiembrie",
        "decembrie"
      ]
    },
    "opl": {
      "niveauTitel": "Selectează nivelul de studii",
      "wis": "Șterge alegerea",
      "richtingTitel": "Selectează domeniul de studiu",
      "zoek": "Caută un domeniu de studiu",
      "geenResultaat": "Nu s-a găsit niciun domeniu.",
      "annuleren": "Anulează",
      "gekozen": "selectat"
    },
    "woon": {
      "kop": "Unde locuiești?",
      "kopBedrijf": "Munca ta și unde locuiești",
      "verder": "Continuă",
      "opslaanKlaar": "Salvează"
    },
    "id": {
      "kop": "Verificare ID",
      "tipKop": "Cum faci fotografia corectă",
      "tip1": "Pune actul de identitate pe o suprafață goală și uniformă.",
      "tip2": "Asigură-te că în imagine se vede doar documentul, fără părți ale corpului sau alte obiecte.",
      "tip3": "Atenție: vedem toată fotografia, inclusiv ce rămâne în afara cadrului.",
      "nlEtiket": "Identitate olandeză",
      "nlTitel": "Pașaport olandez, carte de identitate sau permis de ședere",
      "nlUitleg": "Ai un pașaport olandez, o carte de identitate sau un permis de ședere valabil? Folosește această opțiune pentru verificare.",
      "nlPunt": "Permisul de conducere nu este acceptat.",
      "nlKnop": "Începe cu ID olandez",
      "euEtiket": "Identitate UE/SEE",
      "euTitel": "Pașaport sau carte de identitate din străinătate",
      "euUitleg": "Ai un act de identitate valabil dintr-o țară UE/SEE sau din Elveția? Folosește această opțiune pentru verificare internațională.",
      "euPunt": "Inclusiv Elveția.",
      "euKnop": "Începe cu ID din străinătate",
      "autoEtiket": "Automat · recomandat",
      "autoTitel": "Scanează actul cu camera",
      "autoUitleg": "Camera citește pașaportul, cartea de identitate sau permisul de ședere și te ajută la selfie-uri. Dacă totul se potrivește, ești verificat imediat.",
      "zelfEtiket": "Poze făcute de tine",
      "zelfTitel": "Fă singur pozele",
      "zelfUitleg": "Fă cu camera o poză a documentului, un selfie și un selfie cu capul întors puțin într-o parte. Le verificăm tot automat.",
      "zelfKnop": "Fac eu pozele",
      "hulp": "Ai nevoie de ajutor?",
      "anders": "Alt mod de verificare"
    }
  },
  "uk": {
    "terug": "Назад",
    "sluiten": "Закрити",
    "stapVan": "Крок {n} з {totaal}",
    "persoon": {
      "kop": "Привіт! Хто ви?",
      "uitleg": "Введіть дані так, як вони вказані у вашому документі, що посвідчує особу.",
      "voornaam": "Ім'я",
      "achternaam": "Прізвище",
      "geboortedatum": "Дата народження",
      "kiesDatum": "Виберіть дату народження",
      "land": "Країна",
      "landAria": "Код країни",
      "telefoon": "Телефон",
      "opleiding": "Освіта",
      "opleidingKies": "Виберіть освіту (необов'язково)",
      "opslaan": "Зберегти",
      "bezig": "Збереження…",
      "naamVast": "Ваше ім'я підтверджено документом і не змінюється.",
      "fout": {
        "voornaam": "Введіть ім'я.",
        "achternaam": "Введіть прізвище.",
        "datum": "Виберіть існуючу дату народження.",
        "onder18": "Щоб працювати через ZekerFlex, вам має бути щонайменше 18 років.",
        "telefoon": "Введіть дійсний номер телефону, наприклад 06 12345678.",
        "algemeen": "Не вдалося зберегти. Спробуйте ще раз.",
        "offline": "Немає зв'язку. Спробуйте ще раз.",
        "fix": "Перевірте позначені поля."
      }
    },
    "datum": {
      "titel": "Яка ваша дата народження?",
      "dag": "День",
      "maand": "Місяць",
      "jaar": "Рік",
      "bevestigen": "Підтвердити",
      "annuleren": "Скасувати",
      "wielHint": "Вибирайте стрілками вгору та вниз.",
      "maanden": [
        "січень",
        "лютий",
        "березень",
        "квітень",
        "травень",
        "червень",
        "липень",
        "серпень",
        "вересень",
        "жовтень",
        "листопад",
        "грудень"
      ]
    },
    "opl": {
      "niveauTitel": "Виберіть рівень освіти",
      "wis": "Скинути вибір",
      "richtingTitel": "Виберіть напрям навчання",
      "zoek": "Шукати напрям навчання",
      "geenResultaat": "Напрям не знайдено.",
      "annuleren": "Скасувати",
      "gekozen": "вибрано"
    },
    "woon": {
      "kop": "Де ви живете?",
      "kopBedrijf": "Ваша робота та місце проживання",
      "verder": "Далі",
      "opslaanKlaar": "Зберегти"
    },
    "id": {
      "kop": "Перевірка ID",
      "tipKop": "Як зробити правильне фото",
      "tip1": "Покладіть документ, що посвідчує особу, на порожню однотонну поверхню.",
      "tip2": "Стежте, щоб у кадрі був лише документ, без частин тіла чи інших предметів.",
      "tip3": "Зверніть увагу: ми бачимо все фото, також те, що поза рамкою.",
      "nlEtiket": "Нідерландська ідентичність",
      "nlTitel": "Нідерландський паспорт, ID-картка або посвідка на проживання",
      "nlUitleg": "У вас є дійсний нідерландський паспорт, ID-картка або посвідка на проживання? Скористайтеся цим варіантом для верифікації.",
      "nlPunt": "Водійське посвідчення не приймається.",
      "nlKnop": "Почати з нідерландським ID",
      "euEtiket": "Ідентичність ЄС/ЄЕЗ",
      "euTitel": "Іноземний паспорт або ID-картка",
      "euUitleg": "У вас є дійсний документ з країни ЄС/ЄЕЗ або зі Швейцарії? Скористайтеся цим варіантом для міжнародної верифікації.",
      "euPunt": "Включно зі Швейцарією.",
      "euKnop": "Почати з іноземним ID",
      "autoEtiket": "Автоматично · рекомендовано",
      "autoTitel": "Скануйте документ камерою",
      "autoUitleg": "Камера зчитає ваш паспорт, ID-картку або посвідку на проживання й допоможе із селфі. Якщо все збігається, вас одразу верифіковано.",
      "zelfEtiket": "Власні фото",
      "zelfTitel": "Зробіть фото самостійно",
      "zelfUitleg": "Зробіть камерою фото документа, селфі та селфі з головою, трохи поверненою вбік. Їх ми теж перевіряємо автоматично.",
      "zelfKnop": "Зроблю фото сам",
      "hulp": "Потрібна допомога?",
      "anders": "Інший спосіб верифікації"
    }
  }
};
