import type { Locale } from "@/lib/i18n/config";
import type { BerichtSoort, Weekdag } from "@/lib/telephony/lijn";

// ---------------------------------------------------------------------------
// Teksten van het beheer van een actieve lijn (components/app/TelefonieLijn.tsx) in de vijf talen van de werker-app
// (16 nov 2026). Puur bestand. De werkgever krijgt Nederlands (zoals lib/telephony/teksten.ts). Plaatshouders als
// {aantal} vult `vulIn`. Machine-assisted translations: native-speaker review recommended.
// ---------------------------------------------------------------------------

export interface LijnTeksten {
  berichten: string;
  instellingen: string;
  laden: string;
  geenBerichten: string;
  bewaard: string;
  soort: Record<BerichtSoort, string>;
  uitgaand: string;
  belTerug: string;
  smsTerug: string;
  smsPlaatshouder: string;
  versturen: string;
  verwijderen: string;
  naam: string;
  naamUitleg: string;
  doorschakelen: string;
  doorschakelenUitleg: string;
  doorschakelenTeam: string;
  nummerToevoegen: string;
  weg: string;
  belSeconden: string;
  seconden: string;
  openingstijden: string;
  openingstijdenUitleg: string;
  dagen: Record<Weekdag, string>;
  open: string;
  van: string;
  tot: string;
  menu: string;
  menuUitleg: string;
  toets: string;
  menuLabel: string;
  menuNaar: string;
  keuzeToevoegen: string;
  opnemen: string;
  opnemenUitleg: string;
  opslaan: string;
  bezig: string;
  opgeslagen: string;
  mislukt: string;
  alleenBeheerder: string;
  koppelen: string;
}

export const LIJN_NL: LijnTeksten = {
  berichten: "Berichten",
  instellingen: "Instellingen",
  laden: "Laden…",
  geenBerichten: "Nog geen berichten. Terugbelverzoeken, voicemails en sms'jes komen hier.",
  bewaard: "Berichten blijven 90 dagen bewaard.",
  soort: { terugbelverzoek: "Terugbelverzoek", voicemail: "Voicemail", opname: "Opgenomen gesprek", sms: "Sms", gemist: "Gemist gesprek" },
  uitgaand: "Verstuurd",
  belTerug: "Bel terug",
  smsTerug: "Sms terug",
  smsPlaatshouder: "Je bericht",
  versturen: "Versturen",
  verwijderen: "Verwijderen",
  naam: "Naam die de beller hoort",
  naamUitleg: "\"U belt met …\" en \"de digitale assistent van …\".",
  doorschakelen: "Doorschakelen naar",
  doorschakelenUitleg: "Binnen je openingstijden gaat deze telefoon over.",
  doorschakelenTeam: "Met je teamnummer gaan tot 5 telefoons tegelijk over; wie het eerst opneemt, heeft het gesprek.",
  nummerToevoegen: "Nummer toevoegen",
  weg: "Weg",
  belSeconden: "Zo lang laten overgaan",
  seconden: "{aantal} seconden",
  openingstijden: "Openingstijden",
  openingstijdenUitleg: "Daarbuiten, en als niemand opneemt, neemt de assistent of de voicemail het over.",
  dagen: { ma: "Maandag", di: "Dinsdag", wo: "Woensdag", do: "Donderdag", vr: "Vrijdag", za: "Zaterdag", zo: "Zondag" },
  open: "Open",
  van: "van",
  tot: "tot",
  menu: "Keuzemenu",
  menuUitleg: "\"Toets 1 voor planning.\" Elke keuze schakelt door naar een eigen nummer.",
  toets: "Toets",
  menuLabel: "voor (bijv. planning)",
  menuNaar: "naar nummer",
  keuzeToevoegen: "Keuze toevoegen",
  opnemen: "Gesprekken opnemen",
  opnemenUitleg: "De beller hoort vooraf dat het gesprek kan worden opgenomen. Je luistert het terug en leest het als tekst.",
  opslaan: "Opslaan",
  bezig: "Bezig…",
  opgeslagen: "Opgeslagen.",
  mislukt: "Dat lukte niet. Probeer het opnieuw.",
  alleenBeheerder: "Alleen de hoofdbeheerder van je bedrijf kan dit aanpassen.",
  koppelen: "Zet dit nummer op je website, visitekaartjes en facturen.",
};

const EN: LijnTeksten = {
  berichten: "Messages",
  instellingen: "Settings",
  laden: "Loading…",
  geenBerichten: "No messages yet. Call-back requests, voicemails and texts appear here.",
  bewaard: "Messages are kept for 90 days.",
  soort: { terugbelverzoek: "Call-back request", voicemail: "Voicemail", opname: "Recorded call", sms: "Text", gemist: "Missed call" },
  uitgaand: "Sent",
  belTerug: "Call back",
  smsTerug: "Text back",
  smsPlaatshouder: "Your message",
  versturen: "Send",
  verwijderen: "Delete",
  naam: "Name the caller hears",
  naamUitleg: "\"You are calling …\" and \"the digital assistant of …\".",
  doorschakelen: "Forward to",
  doorschakelenUitleg: "Within your opening hours this phone rings.",
  doorschakelenTeam: "With your team number up to 5 phones ring at once; whoever answers first takes the call.",
  nummerToevoegen: "Add number",
  weg: "Remove",
  belSeconden: "Let it ring for",
  seconden: "{aantal} seconds",
  openingstijden: "Opening hours",
  openingstijdenUitleg: "Outside these hours, and when nobody answers, the assistant or voicemail takes over.",
  dagen: { ma: "Monday", di: "Tuesday", wo: "Wednesday", do: "Thursday", vr: "Friday", za: "Saturday", zo: "Sunday" },
  open: "Open",
  van: "from",
  tot: "to",
  menu: "Phone menu",
  menuUitleg: "\"Press 1 for planning.\" Each choice forwards to its own number.",
  toets: "Key",
  menuLabel: "for (e.g. planning)",
  menuNaar: "to number",
  keuzeToevoegen: "Add choice",
  opnemen: "Record calls",
  opnemenUitleg: "The caller hears beforehand that the call may be recorded. You can listen back and read it as text.",
  opslaan: "Save",
  bezig: "Working…",
  opgeslagen: "Saved.",
  mislukt: "That didn't work. Please try again.",
  alleenBeheerder: "Only your company's main administrator can change this.",
  koppelen: "Put this number on your website, business cards and invoices.",
};

const PL: LijnTeksten = {
  berichten: "Wiadomości",
  instellingen: "Ustawienia",
  laden: "Ładowanie…",
  geenBerichten: "Brak wiadomości. Prośby o oddzwonienie, poczta głosowa i SMS-y pojawią się tutaj.",
  bewaard: "Wiadomości są przechowywane przez 90 dni.",
  soort: { terugbelverzoek: "Prośba o oddzwonienie", voicemail: "Poczta głosowa", opname: "Nagrana rozmowa", sms: "SMS", gemist: "Nieodebrane połączenie" },
  uitgaand: "Wysłano",
  belTerug: "Oddzwoń",
  smsTerug: "Odpisz SMS-em",
  smsPlaatshouder: "Twoja wiadomość",
  versturen: "Wyślij",
  verwijderen: "Usuń",
  naam: "Nazwa, którą słyszy dzwoniący",
  naamUitleg: "„Dzwonisz do …” i „cyfrowy asystent …”.",
  doorschakelen: "Przekieruj na",
  doorschakelenUitleg: "W godzinach otwarcia dzwoni ten telefon.",
  doorschakelenTeam: "Z numerem zespołowym dzwoni do 5 telefonów naraz; kto pierwszy odbierze, prowadzi rozmowę.",
  nummerToevoegen: "Dodaj numer",
  weg: "Usuń",
  belSeconden: "Niech dzwoni przez",
  seconden: "{aantal} sekund",
  openingstijden: "Godziny otwarcia",
  openingstijdenUitleg: "Poza tymi godzinami, i gdy nikt nie odbiera, przejmuje asystent lub poczta głosowa.",
  dagen: { ma: "Poniedziałek", di: "Wtorek", wo: "Środa", do: "Czwartek", vr: "Piątek", za: "Sobota", zo: "Niedziela" },
  open: "Otwarte",
  van: "od",
  tot: "do",
  menu: "Menu telefoniczne",
  menuUitleg: "„Naciśnij 1, aby połączyć się z planowaniem.” Każdy wybór przekierowuje na własny numer.",
  toets: "Klawisz",
  menuLabel: "dla (np. planowanie)",
  menuNaar: "na numer",
  keuzeToevoegen: "Dodaj wybór",
  opnemen: "Nagrywaj rozmowy",
  opnemenUitleg: "Dzwoniący słyszy wcześniej, że rozmowa może być nagrywana. Możesz ją odsłuchać i przeczytać jako tekst.",
  opslaan: "Zapisz",
  bezig: "Chwileczkę…",
  opgeslagen: "Zapisano.",
  mislukt: "Nie udało się. Spróbuj ponownie.",
  alleenBeheerder: "Tylko główny administrator firmy może to zmienić.",
  koppelen: "Umieść ten numer na swojej stronie, wizytówkach i fakturach.",
};

const RO: LijnTeksten = {
  berichten: "Mesaje",
  instellingen: "Setări",
  laden: "Se încarcă…",
  geenBerichten: "Încă nu ai mesaje. Cererile de apel înapoi, mesajele vocale și SMS-urile apar aici.",
  bewaard: "Mesajele se păstrează 90 de zile.",
  soort: { terugbelverzoek: "Cerere de apel înapoi", voicemail: "Mesaj vocal", opname: "Convorbire înregistrată", sms: "SMS", gemist: "Apel pierdut" },
  uitgaand: "Trimis",
  belTerug: "Sună înapoi",
  smsTerug: "Răspunde prin SMS",
  smsPlaatshouder: "Mesajul tău",
  versturen: "Trimite",
  verwijderen: "Șterge",
  naam: "Numele pe care îl aude apelantul",
  naamUitleg: "„Ați sunat la …” și „asistentul digital al …”.",
  doorschakelen: "Redirecționează către",
  doorschakelenUitleg: "În programul de lucru sună acest telefon.",
  doorschakelenTeam: "Cu numărul de echipă sună până la 5 telefoane deodată; cine răspunde primul preia apelul.",
  nummerToevoegen: "Adaugă număr",
  weg: "Elimină",
  belSeconden: "Să sune timp de",
  seconden: "{aantal} secunde",
  openingstijden: "Program",
  openingstijdenUitleg: "În afara programului, și când nu răspunde nimeni, preia asistentul sau mesageria vocală.",
  dagen: { ma: "Luni", di: "Marți", wo: "Miercuri", do: "Joi", vr: "Vineri", za: "Sâmbătă", zo: "Duminică" },
  open: "Deschis",
  van: "de la",
  tot: "până la",
  menu: "Meniu telefonic",
  menuUitleg: "„Apăsați 1 pentru planificare.” Fiecare alegere redirecționează către propriul număr.",
  toets: "Tasta",
  menuLabel: "pentru (de ex. planificare)",
  menuNaar: "către numărul",
  keuzeToevoegen: "Adaugă opțiune",
  opnemen: "Înregistrează convorbirile",
  opnemenUitleg: "Apelantul aude dinainte că apelul poate fi înregistrat. Îl poți asculta din nou și citi ca text.",
  opslaan: "Salvează",
  bezig: "Se lucrează…",
  opgeslagen: "Salvat.",
  mislukt: "Nu a reușit. Încearcă din nou.",
  alleenBeheerder: "Doar administratorul principal al firmei poate modifica asta.",
  koppelen: "Pune acest număr pe site, pe cărțile de vizită și pe facturi.",
};

const UK: LijnTeksten = {
  berichten: "Повідомлення",
  instellingen: "Налаштування",
  laden: "Завантаження…",
  geenBerichten: "Повідомлень ще немає. Запити на зворотний дзвінок, голосова пошта й SMS з'являться тут.",
  bewaard: "Повідомлення зберігаються 90 днів.",
  soort: { terugbelverzoek: "Запит на зворотний дзвінок", voicemail: "Голосове повідомлення", opname: "Записана розмова", sms: "SMS", gemist: "Пропущений дзвінок" },
  uitgaand: "Надіслано",
  belTerug: "Передзвонити",
  smsTerug: "Відповісти SMS",
  smsPlaatshouder: "Твоє повідомлення",
  versturen: "Надіслати",
  verwijderen: "Видалити",
  naam: "Назва, яку чує абонент",
  naamUitleg: "«Ви телефонуєте до …» і «цифровий асистент …».",
  doorschakelen: "Переадресовувати на",
  doorschakelenUitleg: "У робочі години дзвонить цей телефон.",
  doorschakelenTeam: "З командним номером одночасно дзвонять до 5 телефонів; хто перший відповість, той і веде розмову.",
  nummerToevoegen: "Додати номер",
  weg: "Прибрати",
  belSeconden: "Дзвонити протягом",
  seconden: "{aantal} секунд",
  openingstijden: "Робочі години",
  openingstijdenUitleg: "Поза цими годинами, і коли ніхто не відповідає, дзвінок приймає асистент або голосова пошта.",
  dagen: { ma: "Понеділок", di: "Вівторок", wo: "Середа", do: "Четвер", vr: "П'ятниця", za: "Субота", zo: "Неділя" },
  open: "Відкрито",
  van: "з",
  tot: "до",
  menu: "Голосове меню",
  menuUitleg: "«Натисніть 1 для планування.» Кожен вибір переадресовує на свій номер.",
  toets: "Клавіша",
  menuLabel: "для (напр. планування)",
  menuNaar: "на номер",
  keuzeToevoegen: "Додати вибір",
  opnemen: "Записувати розмови",
  opnemenUitleg: "Абонент заздалегідь чує, що розмову може бути записано. Ти можеш прослухати її й прочитати як текст.",
  opslaan: "Зберегти",
  bezig: "Зачекай…",
  opgeslagen: "Збережено.",
  mislukt: "Не вдалося. Спробуй ще раз.",
  alleenBeheerder: "Змінити це може лише головний адміністратор твоєї компанії.",
  koppelen: "Розмісти цей номер на сайті, візитівках і рахунках.",
};

export const LIJN_TEKSTEN: Record<Locale, LijnTeksten> = { nl: LIJN_NL, en: EN, pl: PL, ro: RO, uk: UK };
