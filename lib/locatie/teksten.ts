import type { Locale } from "@/lib/i18n/config";
import { vulIn } from "@/lib/i18n/vul-in";

// ---------------------------------------------------------------------------
// Teksten van de Op locatie-schermen in de werker-app (/dashboard): Nederlands
// is de bron; EN, PL, RO en UK zijn vertalingen voor flexwerkers (laat ze door
// een moedertaalspreker nalezen vóór een campagne). Een eigen klein bestand in
// plaats van lib/i18n/freelancer.ts, zodat dit onderdeel geen 4000-regelbestand
// hoeft te raken; puur, dus bruikbaar in server- en clientcode.
// ---------------------------------------------------------------------------

const nl = {
  terug: "← Account",
  portofoon: {
    titel: "Portofoon",
    uitleg: "Houd de knop ingedrukt en praat; je team op de locatie hoort je direct.",
    geenKanalen: "Je hebt nu geen kanaal. Een kanaal gaat open vanaf twee uur vóór je dienst, bij bedrijven die de portofoon gebruiken.",
    kies: "Kies een kanaal",
    luisteren: "Luisteren",
    verbinden: "Verbinden…",
    houdIngedrukt: "Houd ingedrukt om te praten",
    praat: "Je praat",
    spreekt: "{naam} praat",
    stil: "Stil",
    niemand: "Je bent alleen in dit kanaal",
    aanwezig: { een: "1 persoon luistert", meer: "{n} personen luisteren" },
    verlaat: "Kanaal verlaten",
    bericht: "Spraakbericht inspreken",
    berichtUitleg: "Voor wie nu niet verbonden is: het bericht komt in het groepsgesprek en speelt af bij wie het kanaal opent.",
    stop: "Stoppen en versturen",
    microfoon: "Geen toegang tot je microfoon. Sta de microfoon toe in je browser en probeer opnieuw.",
    gedempt: "Geluid uit",
    geluidAan: "Geluid aan",
    openChat: "Groepsgesprek openen",
    verbonden: { een: "verbonden met 1 telefoon", meer: "verbonden met {n} telefoons" },
    uit: "Dit onderdeel staat op dit moment uit.",
  },
  kluis: {
    titel: "Toegangscodes",
    uitleg: "Codes en inloggegevens die je nodig hebt voor je dienst. Je ziet ze vanaf twee uur vóór de dienst tot het einde ervan.",
    leeg: "Nu niets om te tonen. Zodra een dienst dichterbij komt waarvoor de werkgever codes heeft klaargezet, verschijnen ze hier.",
    toon: "Toon",
    verberg: "Verberg",
    kopieer: "Kopiëren",
    gekopieerd: "Gekopieerd",
    gebruikersnaam: "Gebruikersnaam",
    gelogd: "Bekijken wordt vastgelegd voor de werkgever.",
    tot: "zichtbaar tot {tijd}",
    fout: "Dat lukte niet. Probeer het opnieuw.",
  },
  voertuig: {
    titel: "Mijn kenteken",
    uitleg: "Bij bedrijven met een slagboom met kentekenherkenning gaat die voor je open als je ingepland staat. Vul daarvoor je kenteken in.",
    label: "Kenteken",
    voorbeeld: "bijv. AB-123-C",
    opslaan: "Opslaan",
    weghalen: "Kenteken weghalen",
    opgeslagen: "Opgeslagen",
    geen: "Nog geen kenteken ingevuld.",
    privacy: "Alleen bedrijven waar jij ingepland staat zien je kenteken, en alleen op het moment dat je aankomt. Je kunt het altijd weer weghalen.",
    fout: "Dat lijkt geen kenteken.",
  },
  account: {
    portofoon: "Portofoon",
    kluis: "Toegangscodes",
    voertuig: "Mijn kenteken",
  },
};

export type LocatieTeksten = typeof nl;

const en: LocatieTeksten = {
  terug: "← Account",
  portofoon: {
    titel: "Radio",
    uitleg: "Hold the button and talk; your team on site hears you right away.",
    geenKanalen: "You have no channel right now. A channel opens two hours before your shift, at companies that use the radio.",
    kies: "Choose a channel",
    luisteren: "Listening",
    verbinden: "Connecting…",
    houdIngedrukt: "Hold to talk",
    praat: "You are talking",
    spreekt: "{naam} is talking",
    stil: "Quiet",
    niemand: "You are alone in this channel",
    aanwezig: { een: "1 person listening", meer: "{n} people listening" },
    verlaat: "Leave channel",
    bericht: "Record a voice message",
    berichtUitleg: "For anyone not connected right now: the message goes to the group chat and plays when they open the channel.",
    stop: "Stop and send",
    microfoon: "No access to your microphone. Allow the microphone in your browser and try again.",
    gedempt: "Sound off",
    geluidAan: "Sound on",
    openChat: "Open group chat",
    verbonden: { een: "connected to 1 phone", meer: "connected to {n} phones" },
    uit: "This feature is currently switched off.",
  },
  kluis: {
    titel: "Access codes",
    uitleg: "Codes and logins you need for your shift. Visible from two hours before the shift until it ends.",
    leeg: "Nothing to show right now. Once a shift with codes prepared by the employer comes closer, they appear here.",
    toon: "Show",
    verberg: "Hide",
    kopieer: "Copy",
    gekopieerd: "Copied",
    gebruikersnaam: "Username",
    gelogd: "Viewing is logged for the employer.",
    tot: "visible until {tijd}",
    fout: "That didn't work. Please try again.",
  },
  voertuig: {
    titel: "My licence plate",
    uitleg: "At companies with a plate-reading barrier, it opens for you when you are scheduled. Enter your plate for that.",
    label: "Licence plate",
    voorbeeld: "e.g. AB-123-C",
    opslaan: "Save",
    weghalen: "Remove plate",
    opgeslagen: "Saved",
    geen: "No plate entered yet.",
    privacy: "Only companies where you are scheduled see your plate, and only when you arrive. You can remove it at any time.",
    fout: "That doesn't look like a licence plate.",
  },
  account: { portofoon: "Radio", kluis: "Access codes", voertuig: "My licence plate" },
};

const pl: LocatieTeksten = {
  terug: "← Konto",
  portofoon: {
    titel: "Krótkofalówka",
    uitleg: "Przytrzymaj przycisk i mów; twój zespół na miejscu słyszy cię od razu.",
    geenKanalen: "Nie masz teraz kanału. Kanał otwiera się dwie godziny przed zmianą, w firmach, które używają krótkofalówki.",
    kies: "Wybierz kanał",
    luisteren: "Słuchanie",
    verbinden: "Łączenie…",
    houdIngedrukt: "Przytrzymaj, aby mówić",
    praat: "Mówisz",
    spreekt: "{naam} mówi",
    stil: "Cisza",
    niemand: "Jesteś sam w tym kanale",
    aanwezig: { een: "1 osoba słucha", meer: "{n} osób słucha" },
    verlaat: "Opuść kanał",
    bericht: "Nagraj wiadomość głosową",
    berichtUitleg: "Dla tych, którzy nie są teraz połączeni: wiadomość trafia do czatu grupowego i odtwarza się, gdy otworzą kanał.",
    stop: "Zatrzymaj i wyślij",
    microfoon: "Brak dostępu do mikrofonu. Zezwól na mikrofon w przeglądarce i spróbuj ponownie.",
    gedempt: "Dźwięk wyłączony",
    geluidAan: "Dźwięk włączony",
    openChat: "Otwórz czat grupowy",
    verbonden: { een: "połączono z 1 telefonem", meer: "połączono z {n} telefonami" },
    uit: "Ta funkcja jest obecnie wyłączona.",
  },
  kluis: {
    titel: "Kody dostępu",
    uitleg: "Kody i dane logowania potrzebne na zmianie. Widoczne od dwóch godzin przed zmianą do jej końca.",
    leeg: "Teraz nic do pokazania. Gdy zbliży się zmiana, do której pracodawca przygotował kody, pojawią się tutaj.",
    toon: "Pokaż",
    verberg: "Ukryj",
    kopieer: "Kopiuj",
    gekopieerd: "Skopiowano",
    gebruikersnaam: "Nazwa użytkownika",
    gelogd: "Podgląd jest rejestrowany dla pracodawcy.",
    tot: "widoczne do {tijd}",
    fout: "Nie udało się. Spróbuj ponownie.",
  },
  voertuig: {
    titel: "Moja rejestracja",
    uitleg: "W firmach ze szlabanem rozpoznającym tablice szlaban otwiera się, gdy jesteś w grafiku. Wpisz w tym celu swój numer rejestracyjny.",
    label: "Numer rejestracyjny",
    voorbeeld: "np. AB-123-C",
    opslaan: "Zapisz",
    weghalen: "Usuń rejestrację",
    opgeslagen: "Zapisano",
    geen: "Nie podano jeszcze rejestracji.",
    privacy: "Tylko firmy, w których jesteś w grafiku, widzą twoją rejestrację, i tylko w momencie przyjazdu. Zawsze możesz ją usunąć.",
    fout: "To nie wygląda na numer rejestracyjny.",
  },
  account: { portofoon: "Krótkofalówka", kluis: "Kody dostępu", voertuig: "Moja rejestracja" },
};

const ro: LocatieTeksten = {
  terug: "← Cont",
  portofoon: {
    titel: "Stație radio",
    uitleg: "Ține apăsat butonul și vorbește; echipa de la locație te aude imediat.",
    geenKanalen: "Nu ai niciun canal acum. Un canal se deschide două ore înainte de tură, la firmele care folosesc stația.",
    kies: "Alege un canal",
    luisteren: "Ascultare",
    verbinden: "Se conectează…",
    houdIngedrukt: "Ține apăsat pentru a vorbi",
    praat: "Vorbești",
    spreekt: "{naam} vorbește",
    stil: "Liniște",
    niemand: "Ești singur pe acest canal",
    aanwezig: { een: "1 persoană ascultă", meer: "{n} persoane ascultă" },
    verlaat: "Părăsește canalul",
    bericht: "Înregistrează un mesaj vocal",
    berichtUitleg: "Pentru cei care nu sunt conectați acum: mesajul ajunge în chatul de grup și se redă când deschid canalul.",
    stop: "Oprește și trimite",
    microfoon: "Fără acces la microfon. Permite microfonul în browser și încearcă din nou.",
    gedempt: "Sunet oprit",
    geluidAan: "Sunet pornit",
    openChat: "Deschide chatul de grup",
    verbonden: { een: "conectat la 1 telefon", meer: "conectat la {n} telefoane" },
    uit: "Această funcție este momentan oprită.",
  },
  kluis: {
    titel: "Coduri de acces",
    uitleg: "Coduri și date de autentificare necesare în tură. Vizibile de la două ore înainte de tură până la sfârșitul ei.",
    leeg: "Nimic de afișat acum. Când se apropie o tură pentru care angajatorul a pregătit coduri, apar aici.",
    toon: "Arată",
    verberg: "Ascunde",
    kopieer: "Copiază",
    gekopieerd: "Copiat",
    gebruikersnaam: "Utilizator",
    gelogd: "Vizualizarea este înregistrată pentru angajator.",
    tot: "vizibil până la {tijd}",
    fout: "Nu a mers. Încearcă din nou.",
  },
  voertuig: {
    titel: "Numărul meu de înmatriculare",
    uitleg: "La firmele cu barieră cu recunoașterea numărului, bariera se deschide când ești programat. Introdu numărul pentru asta.",
    label: "Număr de înmatriculare",
    voorbeeld: "de ex. AB-123-C",
    opslaan: "Salvează",
    weghalen: "Șterge numărul",
    opgeslagen: "Salvat",
    geen: "Niciun număr introdus încă.",
    privacy: "Doar firmele unde ești programat văd numărul, și doar în momentul sosirii. Îl poți șterge oricând.",
    fout: "Nu pare un număr de înmatriculare.",
  },
  account: { portofoon: "Stație radio", kluis: "Coduri de acces", voertuig: "Numărul meu de înmatriculare" },
};

const uk: LocatieTeksten = {
  terug: "← Обліковий запис",
  portofoon: {
    titel: "Рація",
    uitleg: "Утримуйте кнопку та говоріть; ваша команда на місці чує вас одразу.",
    geenKanalen: "Зараз у вас немає каналу. Канал відкривається за дві години до зміни в компаніях, які користуються рацією.",
    kies: "Оберіть канал",
    luisteren: "Слухаю",
    verbinden: "З’єднання…",
    houdIngedrukt: "Утримуйте, щоб говорити",
    praat: "Ви говорите",
    spreekt: "{naam} говорить",
    stil: "Тихо",
    niemand: "Ви самі в цьому каналі",
    aanwezig: { een: "1 людина слухає", meer: "{n} людей слухають" },
    verlaat: "Вийти з каналу",
    bericht: "Записати голосове повідомлення",
    berichtUitleg: "Для тих, хто зараз не на зв’язку: повідомлення потрапляє в груповий чат і відтворюється, коли вони відкриють канал.",
    stop: "Зупинити й надіслати",
    microfoon: "Немає доступу до мікрофона. Дозвольте мікрофон у браузері та спробуйте ще раз.",
    gedempt: "Звук вимкнено",
    geluidAan: "Звук увімкнено",
    openChat: "Відкрити груповий чат",
    verbonden: { een: "з’єднано з 1 телефоном", meer: "з’єднано з {n} телефонами" },
    uit: "Ця функція зараз вимкнена.",
  },
  kluis: {
    titel: "Коди доступу",
    uitleg: "Коди та дані для входу, потрібні на зміні. Видно за дві години до зміни й до її кінця.",
    leeg: "Поки нічого показувати. Коли наблизиться зміна, для якої роботодавець підготував коди, вони з’являться тут.",
    toon: "Показати",
    verberg: "Сховати",
    kopieer: "Копіювати",
    gekopieerd: "Скопійовано",
    gebruikersnaam: "Ім’я користувача",
    gelogd: "Перегляд фіксується для роботодавця.",
    tot: "видно до {tijd}",
    fout: "Не вдалося. Спробуйте ще раз.",
  },
  voertuig: {
    titel: "Мій номерний знак",
    uitleg: "У компаніях зі шлагбаумом, що розпізнає номери, він відкривається для вас, коли ви в графіку. Для цього введіть свій номер.",
    label: "Номерний знак",
    voorbeeld: "напр. AB-123-C",
    opslaan: "Зберегти",
    weghalen: "Видалити номер",
    opgeslagen: "Збережено",
    geen: "Номер ще не вказано.",
    privacy: "Ваш номер бачать лише компанії, де ви в графіку, і лише в момент приїзду. Ви можете будь-коли видалити його.",
    fout: "Це не схоже на номерний знак.",
  },
  account: { portofoon: "Рація", kluis: "Коди доступу", voertuig: "Мій номерний знак" },
};

export const LOCATIE_TEKSTEN: Record<Locale, LocatieTeksten> = { nl, en, pl, ro, uk };

export const locatieTeksten = (locale: Locale): LocatieTeksten => LOCATIE_TEKSTEN[locale] ?? nl;

// --- tekst met een plaatshouder -------------------------------------------
// De teksten hierboven zijn gewone tekst met {naam}, {n} of {tijd} erin, nooit
// een functie: een servercomponent mag geen functie aan een clientcomponent
// doorgeven ("Functions cannot be passed directly to Client Components" — dan
// valt de hele pagina om). Invullen doet de client met deze twee hulpjes.

/** "{naam} praat" + {naam: "Sam"} → "Sam praat" (staat in lib/i18n/vul-in.ts, zodat een client-bestand er geen teksten bij krijgt). */
export { vulIn };

export interface Aantalstekst {
  een: string;
  meer: string;
}

/** Eén of meer: "1 persoon luistert" of "3 personen luisteren". */
export function vulAantal(tekst: Aantalstekst, n: number): string {
  return n === 1 ? tekst.een : vulIn(tekst.meer, { n });
}
