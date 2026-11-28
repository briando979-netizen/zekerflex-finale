// ---------------------------------------------------------------------------
// "Werken in Nederland" in vijf talen (28 nov 2026, eigenaar: "zichtbaarheid voor elk land en elke regio"). De openbare site
// was alleen Nederlands, terwijl de werkersapp ook Engels, Pools, Roemeens en Oekraïens spreekt: wie in Polen "praca w
// Holandii" zocht, vond ons nergens. Gemeten in het Caddy-log (21–28 nov, alleen bezoekers die het meetbaken van de pagina
// stuurden, zonder eigen adressen): 48% heeft de browser in het Engels, daarnaast Pools, Spaans, Arabisch, Russisch.
//
// Eén pagina per taal, met hreflang naar elkaar (x-default = Engels), elk met een eigen adres in die taal. Alleen wat echt zo
// werkt: alle diensten zijn in Nederland, ZekerFlex regelt geen woonruimte of reis en is geen uitzendbureau (lib/uitzend/
// model.ts), freelance met een KVK- of EU-btw-nummer (lib/matching/onderneming.ts), woonplaats buiten NL kan (lib/geo/
// thuisbasis.ts), vanaf 18. Puur bestand: de root-layout leest hier de taal van het adres voor <html lang>.
// ---------------------------------------------------------------------------

export const WIN_TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
export type WinTaal = (typeof WIN_TALEN)[number];

/** Het adres per taal, in die taal (zoekwoord in het adres). */
export const WIN_PADEN: Record<WinTaal, string> = {
  nl: "/werken-in-nederland",
  en: "/en/work-in-the-netherlands",
  pl: "/pl/praca-w-holandii",
  ro: "/ro/munca-in-olanda",
  uk: "/uk/robota-v-niderlandakh",
};

/** De taal die een zoekmachine krijgt als geen van de vijf past. */
export const WIN_STANDAARD: WinTaal = "en";

/** Open Graph-locale per taal. */
export const WIN_OG_LOCALE: Record<WinTaal, string> = { nl: "nl_NL", en: "en_GB", pl: "pl_PL", ro: "ro_RO", uk: "uk_UA" };

/** De taal van een van deze pagina's, of null voor elk ander adres. */
export function winTaalVanPad(pad: string | null | undefined): WinTaal | null {
  if (!pad) return null;
  const schoon = pad.length > 1 ? pad.replace(/\/+$/, "") : pad;
  return WIN_TALEN.find((t) => WIN_PADEN[t] === schoon) ?? null;
}

/** hreflang-tabel: elke taal plus x-default, met het volledige adres. */
export function winHreflang(basis: string): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const t of WIN_TALEN) uit[t] = `${basis}${WIN_PADEN[t]}`;
  uit["x-default"] = `${basis}${WIN_PADEN[WIN_STANDAARD]}`;
  return uit;
}

export interface WinTekst {
  /** de naam van de taal in die taal, voor de taalkeuze */
  taalNaam: string;
  title: string;
  description: string;
  kruimel: string;
  eyebrow: string;
  kop: string;
  intro: string;
  knopStart: string;
  knopApp: string;
  fotoAlt: string;
  kenmerken: { kop: string; tekst: string }[];
  stappenKop: string;
  stappen: { titel: string; tekst: string }[];
  nodigKop: string;
  nodig: string[];
  eerlijkKop: string;
  eerlijk: string[];
  faqKop: string;
  faq: { q: string; a: string }[];
  slotKop: string;
  slotTekst: string;
  andereTalen: string;
}

export const WIN_TEKST: Record<WinTaal, WinTekst> = {
  nl: {
    taalNaam: "Nederlands",
    title: "Werken in Nederland: flexwerk en bijbaan",
    description:
      "Woon je in België of elders en wil je in Nederland werken? Vind freelance en uitzendklussen in horeca, schoonmaak en logistiek. Gratis voor werkers.",
    kruimel: "Werken in Nederland",
    eyebrow: "Werken in Nederland",
    kop: "Werken in Nederland, ook als je over de grens woont",
    intro:
      "ZekerFlex is een Nederlandse app voor flexwerk: diensten in de horeca, schoonmaak, logistiek, retail en evenementen. Je kiest zelf welke diensten je doet. De app werkt in het Nederlands, Engels, Pools, Roemeens en Oekraïens.",
    knopStart: "Maak een account",
    knopApp: "Download de app",
    fotoAlt: "Een medewerker duwt een steekkar met dozen door een magazijn",
    kenmerken: [
      { kop: "€ 0", tekst: "Gratis voor werkers. De opdrachtgever betaalt de platformkosten." },
      { kop: "5 talen", tekst: "Nederlands, Engels, Pools, Roemeens en Oekraïens. Je wisselt wanneer je wilt in de app." },
      { kop: "1 app", tekst: "Diensten, chat, uren en uitbetalingen op één plek." },
    ],
    stappenKop: "Zo werkt het",
    stappen: [
      { titel: "Maak je account", tekst: "Meld je aan met je e-mailadres en kies je taal. De app werkt ook op Android en iPhone." },
      { titel: "Check je ID", tekst: "Scan je paspoort of ID-kaart in de app. Zo weet de opdrachtgever wie er komt." },
      {
        titel: "Kies je soort werk",
        tekst:
          "Freelance klussen als je een eigen bedrijf hebt (een Nederlands KVK-nummer of een EU-btw-nummer). Uitzendklussen als je op contract werkt bij een uitzendbureau; dan heb je geen eigen bedrijf nodig.",
      },
      { titel: "Reageer en krijg je geld", tekst: "Reageer op een dienst bij jou in de buurt. Na afloop zet je je uren in de app. Je geld komt op je eigen bankrekening." },
    ],
    nodigKop: "Wat heb je nodig",
    nodig: [
      "Je bent 18 jaar of ouder.",
      "Je mag in Nederland werken: je hebt de nationaliteit van een EU/EER-land of Zwitserland, of een verblijfsvergunning waarmee je mag werken.",
      "Een paspoort of ID-kaart voor de ID-check.",
      "Een bankrekening met een IBAN voor je uitbetalingen.",
      "Voor freelance klussen: een eigen bedrijf met een Nederlands KVK-nummer of een EU-btw-nummer.",
      "Voor uitzendklussen: een BSN. Het uitzendbureau heeft dat nodig voor je loon. Woon je niet in Nederland? Dan krijg je een BSN als je je inschrijft als niet-ingezetene (RNI) bij een van de RNI-gemeenten.",
    ],
    eerlijkKop: "Goed om te weten",
    eerlijk: [
      "Alle diensten zijn in Nederland.",
      "ZekerFlex regelt geen woonruimte en geen vervoer. Je hebt zelf een plek nodig om te verblijven.",
      "ZekerFlex is geen uitzendbureau. Bij een uitzendklus is het uitzendbureau je werkgever; bij een freelance klus werk je voor jezelf.",
      "Nieuwe diensten komen erbij als opdrachtgevers ze plaatsen. De app laat het je weten als er een dienst voor je is.",
    ],
    faqKop: "Veelgestelde vragen",
    faq: [
      {
        q: "Moet ik Nederlands spreken?",
        a: "Niet om de app te gebruiken: die werkt ook in het Engels, Pools, Roemeens en Oekraïens. Sommige diensten vragen wel Nederlands of Engels; lees de beschrijving van de dienst voordat je reageert.",
      },
      { q: "Kost het mij iets?", a: "Nee. ZekerFlex is gratis voor werkers. De opdrachtgever betaalt de platformkosten." },
      {
        q: "Kan ik me aanmelden vanuit België of een ander land?",
        a: "Ja. Bij het aanmelden kies je je land en vul je je woonplaats in; die hoeft niet in Nederland te liggen. Het werk zelf is altijd in Nederland.",
      },
      {
        q: "Wie is mijn werkgever?",
        a: "Bij een uitzendklus het uitzendbureau: daar teken je je contract en dat bureau betaalt je loon, met een loonstrook. Bij een freelance klus werk je voor jezelf en maakt ZekerFlex je factuur.",
      },
      {
        q: "Wanneer krijg ik mijn geld?",
        a: "Bij een freelance klus: als de opdrachtgever betaalt, binnen 30 dagen. Bij een uitzendklus betaalt het uitzendbureau je loon op vaste momenten.",
      },
      { q: "Vanaf welke leeftijd kan ik werken?", a: "Vanaf 18 jaar." },
    ],
    slotKop: "Klaar om te beginnen?",
    slotTekst: "Maak je account in een paar minuten. Kies je taal, check je ID en kijk welke diensten er zijn.",
    andereTalen: "Deze pagina in een andere taal",
  },
  en: {
    taalNaam: "English",
    title: "Work in the Netherlands: shifts and side jobs",
    description:
      "Find freelance and agency shifts in the Netherlands in hospitality, cleaning and logistics. The ZekerFlex app works in English. Free for workers.",
    kruimel: "Work in the Netherlands",
    eyebrow: "Work in the Netherlands",
    kop: "Work in the Netherlands, in an app in your language",
    intro:
      "ZekerFlex is a Dutch app for flexible work: shifts in hospitality, cleaning, logistics, retail and events. You choose which shifts you take. The app works in English, Polish, Romanian, Ukrainian and Dutch.",
    knopStart: "Create an account",
    knopApp: "Download the app",
    fotoAlt: "A worker pushes a hand truck with boxes through a warehouse",
    kenmerken: [
      { kop: "€ 0", tekst: "Free for workers. The company pays the platform fee." },
      { kop: "5 languages", tekst: "English, Polish, Romanian, Ukrainian and Dutch. Switch any time in the app." },
      { kop: "1 app", tekst: "Shifts, chat, hours and payments in one place." },
    ],
    stappenKop: "How it works",
    stappen: [
      { titel: "Create your account", tekst: "Sign up with your email address and choose your language. The app also works on Android and iPhone." },
      { titel: "Check your ID", tekst: "Scan your passport or ID card in the app. That way the company knows who is coming." },
      {
        titel: "Choose your type of work",
        tekst:
          "Freelance shifts if you have your own business (a Dutch KVK number or an EU VAT number). Agency shifts if you work on a contract with an employment agency; then you don't need your own business.",
      },
      { titel: "Respond and get paid", tekst: "Respond to a shift near you. After the shift you enter your hours in the app. The money goes to your own bank account." },
    ],
    nodigKop: "What you need",
    nodig: [
      "You are 18 or older.",
      "You are allowed to work in the Netherlands: you are a citizen of an EU/EEA country or Switzerland, or you have a residence permit that allows work.",
      "A passport or ID card for the ID check.",
      "A bank account with an IBAN for your payments.",
      "For freelance shifts: your own business with a Dutch KVK number or an EU VAT number.",
      "For agency shifts: a BSN (Dutch citizen service number). The agency needs it for your wages. Don't live in the Netherlands? You get a BSN when you register as a non-resident (RNI) at one of the RNI municipalities.",
    ],
    eerlijkKop: "Good to know before you come",
    eerlijk: [
      "All shifts are in the Netherlands.",
      "ZekerFlex does not arrange housing or travel. You need your own place to stay.",
      "ZekerFlex is not an employment agency. For an agency shift the agency is your employer; for a freelance shift you work for yourself.",
      "New shifts appear when companies post them. The app lets you know when there is a shift for you.",
    ],
    faqKop: "Frequently asked questions",
    faq: [
      {
        q: "Do I need to speak Dutch?",
        a: "Not to use the app: it also works in English, Polish, Romanian and Ukrainian. Some shifts do ask for Dutch or English; read the shift description before you respond.",
      },
      { q: "Does it cost me anything?", a: "No. ZekerFlex is free for workers. The company pays the platform fee." },
      {
        q: "Can I sign up from another country?",
        a: "Yes. When you sign up you choose your country and enter your home town; it does not have to be in the Netherlands. The work itself is always in the Netherlands.",
      },
      {
        q: "Who is my employer?",
        a: "For an agency shift, the employment agency: you sign your contract with them and they pay your wages, with a payslip. For a freelance shift you work for yourself and ZekerFlex makes your invoice.",
      },
      {
        q: "When do I get paid?",
        a: "For a freelance shift: when the company pays, within 30 days. For an agency shift the agency pays your wages on fixed days.",
      },
      { q: "From what age can I work?", a: "From 18." },
    ],
    slotKop: "Ready to start?",
    slotTekst: "Create your account in a few minutes. Choose your language, check your ID and see which shifts there are.",
    andereTalen: "This page in another language",
  },
  pl: {
    taalNaam: "Polski",
    title: "Praca w Holandii: zmiany i praca dorywcza",
    description:
      "Znajdź zlecenia freelance i pracę przez agencję w Holandii: gastronomia, sprzątanie, logistyka. Aplikacja ZekerFlex po polsku. Za darmo dla pracowników.",
    kruimel: "Praca w Holandii",
    eyebrow: "Praca w Holandii",
    kop: "Praca w Holandii w aplikacji po polsku",
    intro:
      "ZekerFlex to holenderska aplikacja do pracy elastycznej: zmiany w gastronomii, sprzątaniu, logistyce, handlu i na eventach. Sam wybierasz, które zmiany bierzesz. Aplikacja działa po polsku, angielsku, rumuńsku, ukraińsku i niderlandzku.",
    knopStart: "Załóż konto",
    knopApp: "Pobierz aplikację",
    fotoAlt: "Pracownik pcha wózek z kartonami przez magazyn",
    kenmerken: [
      { kop: "0 €", tekst: "Za darmo dla pracowników. Opłatę za platformę płaci firma." },
      { kop: "5 języków", tekst: "Polski, angielski, rumuński, ukraiński i niderlandzki. Język zmienisz w każdej chwili w aplikacji." },
      { kop: "1 aplikacja", tekst: "Zmiany, czat, godziny i wypłaty w jednym miejscu." },
    ],
    stappenKop: "Jak to działa",
    stappen: [
      { titel: "Załóż konto", tekst: "Zarejestruj się adresem e-mail i wybierz język. Aplikacja działa też na Androidzie i iPhonie." },
      { titel: "Potwierdź tożsamość", tekst: "Zeskanuj w aplikacji paszport lub dowód osobisty. Dzięki temu firma wie, kto przyjdzie." },
      {
        titel: "Wybierz rodzaj pracy",
        tekst:
          "Zlecenia freelance, jeśli masz własną firmę (holenderski numer KVK lub unijny numer VAT). Zmiany przez agencję pracy, jeśli pracujesz na umowie z agencją; wtedy nie potrzebujesz własnej firmy.",
      },
      { titel: "Zgłoś się i odbierz pieniądze", tekst: "Zgłoś się na zmianę w pobliżu. Po pracy wpisujesz godziny w aplikacji. Pieniądze trafiają na Twoje własne konto bankowe." },
    ],
    nodigKop: "Czego potrzebujesz",
    nodig: [
      "Masz co najmniej 18 lat.",
      "Możesz legalnie pracować w Holandii: masz obywatelstwo kraju UE/EOG lub Szwajcarii albo dokument pobytowy, który pozwala na pracę.",
      "Paszport lub dowód osobisty do weryfikacji tożsamości.",
      "Konto bankowe z numerem IBAN do wypłat.",
      "Do zleceń freelance: własna firma z holenderskim numerem KVK lub unijnym numerem VAT.",
      "Do zmian przez agencję: numer BSN (holenderski numer identyfikacyjny). Agencja potrzebuje go do wypłaty wynagrodzenia. Nie mieszkasz w Holandii? BSN dostaniesz po rejestracji jako nierezydent (RNI) w jednej z gmin RNI.",
    ],
    eerlijkKop: "Dobrze wiedzieć przed przyjazdem",
    eerlijk: [
      "Wszystkie zmiany są w Holandii.",
      "ZekerFlex nie zapewnia mieszkania ani dojazdu. Potrzebujesz własnego miejsca do spania.",
      "ZekerFlex nie jest agencją pracy. Przy zmianie przez agencję Twoim pracodawcą jest agencja; przy zleceniu freelance pracujesz na własny rachunek.",
      "Nowe zmiany pojawiają się, gdy firmy je dodają. Aplikacja da Ci znać, gdy pojawi się zmiana dla Ciebie.",
    ],
    faqKop: "Najczęstsze pytania",
    faq: [
      {
        q: "Czy muszę mówić po niderlandzku?",
        a: "Nie, żeby korzystać z aplikacji: działa też po polsku, angielsku, rumuńsku i ukraińsku. Niektóre zmiany wymagają niderlandzkiego lub angielskiego; przeczytaj opis zmiany, zanim się zgłosisz.",
      },
      { q: "Czy to coś kosztuje?", a: "Nie. ZekerFlex jest za darmo dla pracowników. Opłatę za platformę płaci firma." },
      {
        q: "Czy mogę się zarejestrować z Polski?",
        a: "Tak. Przy rejestracji wybierasz kraj i podajesz swoją miejscowość; nie musi być w Holandii. Sama praca jest zawsze w Holandii.",
      },
      {
        q: "Kto jest moim pracodawcą?",
        a: "Przy zmianie przez agencję: agencja pracy. Z nią podpisujesz umowę i ona wypłaca wynagrodzenie z odcinkiem płacowym. Przy zleceniu freelance pracujesz na własny rachunek, a ZekerFlex przygotowuje Twoją fakturę.",
      },
      {
        q: "Kiedy dostanę pieniądze?",
        a: "Przy zleceniu freelance: gdy firma zapłaci, w ciągu 30 dni. Przy zmianie przez agencję agencja wypłaca wynagrodzenie w stałych terminach.",
      },
      { q: "Od ilu lat mogę pracować?", a: "Od 18 lat." },
    ],
    slotKop: "Zaczynamy?",
    slotTekst: "Załóż konto w kilka minut. Wybierz język, potwierdź tożsamość i zobacz, jakie są zmiany.",
    andereTalen: "Ta strona w innym języku",
  },
  ro: {
    taalNaam: "Română",
    title: "Muncă în Olanda: ture și joburi flexibile",
    description:
      "Găsește ture freelance și prin agenție în Olanda: horeca, curățenie, logistică. Aplicația ZekerFlex în limba română. Gratuit pentru lucrători.",
    kruimel: "Muncă în Olanda",
    eyebrow: "Muncă în Olanda",
    kop: "Muncă în Olanda, într-o aplicație în limba română",
    intro:
      "ZekerFlex este o aplicație olandeză pentru muncă flexibilă: ture în horeca, curățenie, logistică, comerț și evenimente. Tu alegi ce ture iei. Aplicația funcționează în română, engleză, poloneză, ucraineană și neerlandeză.",
    knopStart: "Creează un cont",
    knopApp: "Descarcă aplicația",
    fotoAlt: "Un lucrător împinge un cărucior cu cutii printr-un depozit",
    kenmerken: [
      { kop: "0 €", tekst: "Gratuit pentru lucrători. Firma plătește taxa platformei." },
      { kop: "5 limbi", tekst: "Română, engleză, poloneză, ucraineană și neerlandeză. Schimbi limba oricând în aplicație." },
      { kop: "1 aplicație", tekst: "Ture, chat, ore și plăți într-un singur loc." },
    ],
    stappenKop: "Cum funcționează",
    stappen: [
      { titel: "Creează-ți contul", tekst: "Înregistrează-te cu adresa de e-mail și alege limba. Aplicația merge și pe Android și iPhone." },
      { titel: "Verifică-ți identitatea", tekst: "Scanează pașaportul sau cartea de identitate în aplicație. Așa firma știe cine vine." },
      {
        titel: "Alege tipul de muncă",
        tekst:
          "Ture freelance, dacă ai propria firmă (număr KVK olandez sau cod de TVA din UE). Ture prin agenție, dacă lucrezi cu contract la o agenție de muncă; atunci nu ai nevoie de firmă proprie.",
      },
      { titel: "Aplică și primește banii", tekst: "Aplică la o tură din apropiere. După tură îți introduci orele în aplicație. Banii ajung în contul tău bancar." },
    ],
    nodigKop: "Ce îți trebuie",
    nodig: [
      "Ai cel puțin 18 ani.",
      "Ai dreptul să lucrezi în Olanda: ești cetățean al unei țări din UE/SEE sau al Elveției, ori ai un permis de ședere care îți permite să lucrezi.",
      "Un pașaport sau o carte de identitate pentru verificare.",
      "Un cont bancar cu IBAN pentru plăți.",
      "Pentru ture freelance: firmă proprie cu număr KVK olandez sau cod de TVA din UE.",
      "Pentru ture prin agenție: un BSN (numărul de identificare olandez). Agenția are nevoie de el pentru salariu. Nu locuiești în Olanda? Primești un BSN când te înregistrezi ca nerezident (RNI) la una dintre primăriile RNI.",
    ],
    eerlijkKop: "Bine de știut înainte să vii",
    eerlijk: [
      "Toate turele sunt în Olanda.",
      "ZekerFlex nu oferă cazare și nici transport. Ai nevoie de propria locuință.",
      "ZekerFlex nu este o agenție de muncă. La o tură prin agenție, angajatorul tău este agenția; la o tură freelance lucrezi pe cont propriu.",
      "Ture noi apar când firmele le publică. Aplicația te anunță când apare o tură potrivită pentru tine.",
    ],
    faqKop: "Întrebări frecvente",
    faq: [
      {
        q: "Trebuie să vorbesc neerlandeză?",
        a: "Nu ca să folosești aplicația: merge și în română, engleză, poloneză și ucraineană. Unele ture cer neerlandeză sau engleză; citește descrierea turei înainte să aplici.",
      },
      { q: "Mă costă ceva?", a: "Nu. ZekerFlex este gratuit pentru lucrători. Firma plătește taxa platformei." },
      {
        q: "Mă pot înregistra din România?",
        a: "Da. La înregistrare alegi țara și localitatea ta; nu trebuie să fie în Olanda. Munca este însă mereu în Olanda.",
      },
      {
        q: "Cine este angajatorul meu?",
        a: "La o tură prin agenție: agenția de muncă. Cu ea semnezi contractul și ea îți plătește salariul, cu fluturaș de salariu. La o tură freelance lucrezi pe cont propriu, iar ZekerFlex îți face factura.",
      },
      {
        q: "Când primesc banii?",
        a: "La o tură freelance: când plătește firma, în cel mult 30 de zile. La o tură prin agenție, agenția îți plătește salariul la date fixe.",
      },
      { q: "De la ce vârstă pot lucra?", a: "De la 18 ani." },
    ],
    slotKop: "Gata să începi?",
    slotTekst: "Creează-ți contul în câteva minute. Alege limba, verifică-ți identitatea și vezi ce ture sunt.",
    andereTalen: "Această pagină în altă limbă",
  },
  uk: {
    taalNaam: "Українська",
    title: "Робота в Нідерландах: зміни та підробіток",
    description:
      "Знайдіть зміни як фрилансер або через агентство в Нідерландах: ресторани, прибирання, логістика. Застосунок ZekerFlex українською. Безкоштовно для працівників.",
    kruimel: "Робота в Нідерландах",
    eyebrow: "Робота в Нідерландах",
    kop: "Робота в Нідерландах у застосунку українською",
    intro:
      "ZekerFlex — нідерландський застосунок для гнучкої роботи: зміни в ресторанах і готелях, прибиранні, логістиці, торгівлі та на заходах. Ви самі обираєте, які зміни брати. Застосунок працює українською, англійською, польською, румунською та нідерландською.",
    knopStart: "Створити акаунт",
    knopApp: "Завантажити застосунок",
    fotoAlt: "Працівник везе візок із коробками складом",
    kenmerken: [
      { kop: "0 €", tekst: "Безкоштовно для працівників. Плату за платформу сплачує компанія." },
      { kop: "5 мов", tekst: "Українська, англійська, польська, румунська та нідерландська. Мову можна змінити будь-коли в застосунку." },
      { kop: "1 застосунок", tekst: "Зміни, чат, години та виплати в одному місці." },
    ],
    stappenKop: "Як це працює",
    stappen: [
      { titel: "Створіть акаунт", tekst: "Зареєструйтеся за адресою електронної пошти й оберіть мову. Застосунок працює також на Android та iPhone." },
      { titel: "Підтвердіть особу", tekst: "Відскануйте паспорт або ID-картку в застосунку. Так компанія знає, хто прийде." },
      {
        titel: "Оберіть тип роботи",
        tekst:
          "Зміни як фрилансер, якщо у вас є власна компанія (нідерландський номер KVK або номер платника ПДВ у ЄС). Зміни через агентство, якщо ви працюєте за договором з агентством праці; тоді власна компанія не потрібна.",
      },
      { titel: "Відгукніться й отримайте гроші", tekst: "Відгукніться на зміну поруч із вами. Після зміни внесіть години в застосунку. Гроші надходять на ваш власний банківський рахунок." },
    ],
    nodigKop: "Що вам потрібно",
    nodig: [
      "Вам щонайменше 18 років.",
      "Ви маєте право працювати в Нідерландах: громадянство країни ЄС/ЄЕЗ чи Швейцарії, дозвіл на проживання, який дозволяє працювати, або тимчасовий захист у Нідерландах.",
      "Паспорт або ID-картка для перевірки особи.",
      "Банківський рахунок з IBAN для виплат.",
      "Для змін як фрилансер: власна компанія з нідерландським номером KVK або номером платника ПДВ у ЄС.",
      "Для змін через агентство: BSN (нідерландський персональний номер). Агентству він потрібен для зарплати. Живете в Нідерландах — BSN ви отримуєте під час реєстрації в муніципалітеті; не живете — після реєстрації як нерезидент (RNI).",
    ],
    eerlijkKop: "Варто знати заздалегідь",
    eerlijk: [
      "Усі зміни — у Нідерландах.",
      "ZekerFlex не надає житло й не організовує дорогу. Вам потрібне власне місце, де жити.",
      "ZekerFlex не є агентством праці. На зміні через агентство ваш роботодавець — агентство; як фрилансер ви працюєте на себе.",
      "Нові зміни з'являються, коли компанії їх публікують. Застосунок повідомить вас, коли з'явиться зміна для вас.",
    ],
    faqKop: "Часті запитання",
    faq: [
      {
        q: "Чи потрібно знати нідерландську?",
        a: "Для користування застосунком — ні: він працює також українською, англійською, польською та румунською. Деякі зміни вимагають нідерландської або англійської; прочитайте опис зміни, перш ніж відгукнутися.",
      },
      { q: "Чи це щось коштує?", a: "Ні. ZekerFlex безкоштовний для працівників. Плату за платформу сплачує компанія." },
      {
        q: "Я з України. Чи можу я працювати?",
        a: "Так, якщо у вас є тимчасовий захист у Нідерландах або інший дозвіл на проживання, який дозволяє працювати. Для перевірки особи в застосунку підійде ваш паспорт.",
      },
      {
        q: "Хто мій роботодавець?",
        a: "На зміні через агентство — агентство праці: з ним ви підписуєте договір, і воно виплачує зарплату з розрахунковим листком. На зміні як фрилансер ви працюєте на себе, а ZekerFlex складає ваш рахунок.",
      },
      {
        q: "Коли я отримаю гроші?",
        a: "На зміні як фрилансер — коли компанія заплатить, протягом 30 днів. На зміні через агентство агентство виплачує зарплату у визначені дні.",
      },
      { q: "З якого віку можна працювати?", a: "З 18 років." },
    ],
    slotKop: "Готові почати?",
    slotTekst: "Створіть акаунт за кілька хвилин. Оберіть мову, підтвердьте особу й подивіться, які є зміни.",
    andereTalen: "Ця сторінка іншою мовою",
  },
};
