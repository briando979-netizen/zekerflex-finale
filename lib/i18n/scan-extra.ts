import type { Locale } from "@/lib/i18n/config";

// ---------------------------------------------------------------------------
// Extra teksten van de ID-scan (components/app/IdScan.tsx) voor de twee routes
// "Nederlands ID" en "buitenlands ID" en de tips op het startscherm. Staan hier
// los zodat lib/i18n/auth.ts niet nog groter wordt; auth.ts hangt ze aan
// onb.scan.extra, dus de scan leest ze via t.scan.extra.
// ---------------------------------------------------------------------------

export interface ScanExtra {
  introTitel: string;
  introTekst: string;
  beginnen: string;
  tipsKop: string;
  tips: [string, string, string];
  privacyRegel: string;
  toestemmingTitel: string;
  toestemmingUitleg: string;
  toestemmingKnop: string;
  toestemmingBezig: string;
  toestemmingGeweigerd: string;
  docsKop: string;
  docsNl: string;
  docsEu: string;
  ovaal: string;
  draaiOm: string;
  procKop: string;
  procGelezen: string;
  procHandmatig: string;
  procVersturen: string;
  procKlaar: string;
  bedankTitel: string;
  bedankTekst: string;
  bijnaTitel: string;
  bijnaTekst: string;
  bijnaKnop: string;
  euIntroTitel: string;
  euIntroTekst: string;
  euIntroLabel: string;
  euStart: string;
  euBewaard: string;
  tmKop: string;
  tmLabel: string;
  tmUitleg: string;
  tmLijst: [string, string, string];
  tmVink: string;
  tmKnop: string;
  tipsSheetKop: string;
  tipsCamera: string;
  tipsKnop: string;
  fotosKop: string;
  fotosTekst: string;
  tikStart: string;
  handmatigKop: string;
  handmatigTekst: string;
  doorgaan: string;
  vastleggen: string;
  kiesCamera: string;
  cameraNr: string;
  camGeen: string;
  /** live begeleiding van de camera (lib/kyc/camera-live.ts): aanwijzingen bij het document en de selfie */
  docLicht: string;
  docGlans: string;
  docStil: string;
  docDichterbij: string;
  docVerder: string;
  docCode: string;
  docZoeken: string;
  docGoed: string;
  /** het kaartje dat omdraait tussen voor- en achterkant */
  omdraaiId: string;
  omdraaiRijbewijs: string;
  selfieVerder: string;
  selfieStil: string;
  /** onder de camera: de foto gaat vanzelf, de knop blijft als uitweg */
  vanzelf: string;
  /** automatisch en na ±20 s nog geen foto (13 nov 2026): omschakelen naar zelf */
  zelfWissel: string;
  zelfWisselKnop: string;
  /** automatisch kan hier niet (bijv. de server meet niet): meteen de wissel */
  autoKanNiet: string;
  /** de stand "zelf": onder het beeld */
  zelfModus: string;
}

export const SCAN_EXTRA: Record<Locale, ScanExtra> = {
  nl: {
    introTitel: "Bevestig je identiteit",
    introTekst: "We vragen je je identiteitsdocument te scannen en een selfie te maken.",
    beginnen: "ID-scan starten (2 minuten)",
    tipsKop: "Tips voor een goede foto",
    tips: [
      "Leg je document op een donkere, effen ondergrond.",
      "Zorg voor genoeg licht, bij voorkeur daglicht, zonder schaduw of weerspiegeling.",
      "Alle persoonsgegevens op het document moeten goed zichtbaar en leesbaar zijn.",
    ],
    privacyRegel: "Je foto's gebruiken we alleen voor deze verificatie.",
    toestemmingTitel: "We hebben je camera nodig",
    toestemmingUitleg: "Straks vraagt je toestel of ZekerFlex de camera mag gebruiken. Kies “Toestaan”. We gebruiken de camera alleen voor een foto van je document en een selfie.",
    toestemmingKnop: "Camera toestaan",
    toestemmingBezig: "Even wachten…",
    toestemmingGeweigerd: "De camera is geweigerd. Zet de camera aan in de instellingen van je browser of app en probeer het opnieuw, of gebruik de camera-app van je toestel.",
    docsKop: "Geaccepteerde documenten:",
    docsNl: "Nederlands paspoort, ID-kaart of verblijfsvergunning",
    docsEu: "Paspoort of ID-kaart uit een EU/EER-land of Zwitserland",
    ovaal: "Positioneer je gezicht in het ovaal en beweeg niet",
    draaiOm: "Draai je ID-kaart om en maak een foto van de andere zijde",
    procKop: "We verwerken je gegevens",
    procGelezen: "Document gelezen",
    procHandmatig: "Documentgegevens ingevuld",
    procVersturen: "Foto's versturen en gegevens controleren",
    procKlaar: "Foto's verstuurd en gegevens gecontroleerd",
    bedankTitel: "Dank je!",
    bedankTekst: "Je verificatiegegevens zijn verzonden.",
    bijnaTitel: "Bijna klaar!",
    bijnaTekst: "Je ID-check is verwerkt. Check de status in de app en ga verder!",
    bijnaKnop: "Verder naar de klussen",
    euIntroTitel: "Online identificatie",
    euIntroTekst: "Met ZekerFlex deel je veilig je gegevens met het bedrijf waarmee je werkt.",
    euIntroLabel: "Reken op een paar minuten",
    euStart: "Start identificatie",
    euBewaard: "Je gegevens worden versleuteld bewaard.",
    tmKop: "Toestemming nodig",
    tmLabel: "Je gegevens worden versleuteld verzonden",
    tmUitleg: "We vragen je toestemming om de volgende gegevens te verzamelen en te verwerken voor de controle van je identiteit. Lees ons privacybeleid voor de details.",
    tmLijst: ["Persoonlijke identificatiegegevens","Biometrische gegevens (een selfie van je gezicht)","Informatie over identiteitsdocumenten"],
    tmVink: "Ik heb het privacybeleid gelezen en ga akkoord met de verwerking van mijn gegevens",
    tmKnop: "Akkoord en verder",
    tipsSheetKop: "Tips en tricks",
    tipsCamera: "Je browser vraagt toegang tot de camera. Sta dit toe zodat we foto's van je document kunnen maken. Er wordt niets opgenomen voordat je start.",
    tipsKnop: "Ik begrijp het",
    fotosKop: "Maak foto's van je ID-document",
    fotosTekst: "Maak foto's van de voor- en achterkant van een ID-kaart, of van de fotopagina van een paspoort. Zorg dat het hele document zichtbaar is.",
    tikStart: "Tik om te starten",
    handmatigKop: "Handmatige opnamemodus",
    handmatigTekst: "Druk op Vastleggen wanneer je klaar bent.",
    doorgaan: "Doorgaan",
    vastleggen: "Vastleggen",
    kiesCamera: "Kies de achtercamera",
    cameraNr: "Camera {n}",
    camGeen: "Er is geen camera beschikbaar. Gebruik de camera-app van je toestel.",
    docLicht: "Meer licht nodig",
    docGlans: "Minder glans: kantel je document een klein beetje",
    docStil: "Houd hem stil",
    docDichterbij: "Kom iets dichterbij",
    docVerder: "Houd de camera iets verder weg",
    docCode: "Zorg dat de code onderaan scherp in beeld is",
    docZoeken: "Houd je document in het kader",
    docGoed: "Goed zo, de foto wordt gemaakt",
    omdraaiId: "Draai je ID-kaart om",
    omdraaiRijbewijs: "Draai je rijbewijs om",
    selfieVerder: "Houd de camera iets verder weg",
    selfieStil: "Goed zo, even stilhouden",
    vanzelf: "De foto wordt vanzelf gemaakt zodra alles goed is.",
    zelfWissel: "Lukt het niet vanzelf?",
    zelfWisselKnop: "Zelf de foto maken",
    autoKanNiet: "Hier maakt de camera de foto niet vanzelf.",
    zelfModus: "Zet alles goed in beeld en druk op de knop.",
  },
  en: {
    introTitel: "Confirm your identity",
    introTekst: "We ask you to scan your identity document and take a selfie.",
    beginnen: "Start ID scan (2 minutes)",
    tipsKop: "Tips for a good photo",
    tips: [
      "Put your document on a dark, plain surface.",
      "Make sure there is enough light, preferably daylight, without shadow or reflection.",
      "All personal details on the document must be clearly visible and readable.",
    ],
    privacyRegel: "We only use your photos for this verification.",
    toestemmingTitel: "We need your camera",
    toestemmingUitleg: "Your device will ask whether ZekerFlex may use the camera. Choose “Allow”. We only use the camera for a photo of your document and a selfie.",
    toestemmingKnop: "Allow camera",
    toestemmingBezig: "One moment…",
    toestemmingGeweigerd: "The camera was refused. Turn the camera on in the settings of your browser or app and try again, or use the camera app of your device.",
    docsKop: "Accepted documents:",
    docsNl: "Dutch passport, ID card or residence permit",
    docsEu: "Passport or ID card from an EU/EEA country or Switzerland",
    ovaal: "Position your face in the oval and hold still",
    draaiOm: "Turn your ID card over and take a photo of the other side",
    procKop: "We are processing your details",
    procGelezen: "Document read",
    procHandmatig: "Document details entered",
    procVersturen: "Sending photos and checking details",
    procKlaar: "Photos sent and details checked",
    bedankTitel: "Thank you!",
    bedankTekst: "Your verification details have been sent.",
    bijnaTitel: "Almost done!",
    bijnaTekst: "Your ID check has been processed. Check the status in the app and carry on!",
    bijnaKnop: "Continue to the jobs",
    euIntroTitel: "Online identification",
    euIntroTekst: "With ZekerFlex you safely share your details with the company you work with.",
    euIntroLabel: "Expect a few minutes",
    euStart: "Start identification",
    euBewaard: "Your details are stored encrypted.",
    tmKop: "Consent needed",
    tmLabel: "Your details are sent encrypted",
    tmUitleg: "We ask your consent to collect and process the following data to check your identity. Read our privacy policy for the details.",
    tmLijst: ["Personal identification data","Biometric data (a selfie of your face)","Information about identity documents"],
    tmVink: "I have read the privacy policy and agree to the processing of my data",
    tmKnop: "Agree and continue",
    tipsSheetKop: "Tips and tricks",
    tipsCamera: "Your browser asks for access to the camera. Allow it so we can take photos of your document. Nothing is recorded before you start.",
    tipsKnop: "I understand",
    fotosKop: "Take photos of your ID document",
    fotosTekst: "Take photos of the front and back of an ID card, or of the photo page of a passport. Make sure the whole document is visible.",
    tikStart: "Tap to start",
    handmatigKop: "Manual capture mode",
    handmatigTekst: "Press Capture when you are ready.",
    doorgaan: "Continue",
    vastleggen: "Capture",
    kiesCamera: "Choose the rear camera",
    cameraNr: "Camera {n}",
    camGeen: "No camera is available. Use the camera app of your device.",
    docLicht: "More light needed",
    docGlans: "Less glare: tilt your document a little",
    docStil: "Hold it still",
    docDichterbij: "Move a little closer",
    docVerder: "Hold the camera a little further away",
    docCode: "Make sure the code at the bottom is sharp and in view",
    docZoeken: "Keep your document inside the frame",
    docGoed: "Good, taking the photo",
    omdraaiId: "Turn your ID card over",
    omdraaiRijbewijs: "Turn your driving licence over",
    selfieVerder: "Hold the camera a little further away",
    selfieStil: "Good, hold still",
    vanzelf: "The photo is taken automatically once everything is right.",
    zelfWissel: "Not working automatically?",
    zelfWisselKnop: "Take the photo myself",
    autoKanNiet: "The camera can't take this photo automatically.",
    zelfModus: "Get everything in view and press the button.",
  },
  pl: {
    introTitel: "Potwierdź swoją tożsamość",
    introTekst: "Poprosimy Cię o zeskanowanie dokumentu tożsamości i zrobienie selfie.",
    beginnen: "Rozpocznij skan dokumentu (2 minuty)",
    tipsKop: "Wskazówki do dobrego zdjęcia",
    tips: [
      "Połóż dokument na ciemnym, jednolitym podłożu.",
      "Zadbaj o dość światła, najlepiej dziennego, bez cienia i odbłysków.",
      "Wszystkie dane osobowe na dokumencie muszą być dobrze widoczne i czytelne.",
    ],
    privacyRegel: "Twoich zdjęć używamy tylko do tej weryfikacji.",
    toestemmingTitel: "Potrzebujemy Twojej kamery",
    toestemmingUitleg: "Za chwilę urządzenie zapyta, czy ZekerFlex może używać kamery. Wybierz „Zezwól”. Kamery używamy tylko do zdjęcia dokumentu i selfie.",
    toestemmingKnop: "Zezwól na kamerę",
    toestemmingBezig: "Chwileczkę…",
    toestemmingGeweigerd: "Dostęp do kamery został odrzucony. Włącz kamerę w ustawieniach przeglądarki lub aplikacji i spróbuj ponownie albo użyj aplikacji aparatu w urządzeniu.",
    docsKop: "Akceptowane dokumenty:",
    docsNl: "Holenderski paszport, dowód osobisty lub karta pobytu",
    docsEu: "Paszport lub dowód osobisty z kraju UE/EOG albo ze Szwajcarii",
    ovaal: "Ustaw twarz w owalu i nie ruszaj się",
    draaiOm: "Odwróć dowód osobisty i zrób zdjęcie drugiej strony",
    procKop: "Przetwarzamy Twoje dane",
    procGelezen: "Dokument odczytany",
    procHandmatig: "Dane dokumentu wpisane",
    procVersturen: "Wysyłanie zdjęć i sprawdzanie danych",
    procKlaar: "Zdjęcia wysłane, dane sprawdzone",
    bedankTitel: "Dziękujemy!",
    bedankTekst: "Twoje dane weryfikacyjne zostały wysłane.",
    bijnaTitel: "Prawie gotowe!",
    bijnaTekst: "Twoja weryfikacja ID została przetworzona. Sprawdź status w aplikacji i idź dalej!",
    bijnaKnop: "Dalej do zleceń",
    euIntroTitel: "Identyfikacja online",
    euIntroTekst: "Dzięki ZekerFlex bezpiecznie udostępniasz swoje dane firmie, z którą pracujesz.",
    euIntroLabel: "Zajmie to kilka minut",
    euStart: "Rozpocznij identyfikację",
    euBewaard: "Twoje dane są przechowywane w formie zaszyfrowanej.",
    tmKop: "Wymagana zgoda",
    tmLabel: "Twoje dane są wysyłane w formie zaszyfrowanej",
    tmUitleg: "Prosimy o zgodę na zbieranie i przetwarzanie poniższych danych w celu sprawdzenia Twojej tożsamości. Szczegóły znajdziesz w polityce prywatności.",
    tmLijst: ["Dane identyfikacyjne osoby","Dane biometryczne (selfie Twojej twarzy)","Informacje o dokumentach tożsamości"],
    tmVink: "Przeczytałem(-am) politykę prywatności i zgadzam się na przetwarzanie moich danych",
    tmKnop: "Zgadzam się i dalej",
    tipsSheetKop: "Wskazówki",
    tipsCamera: "Przeglądarka poprosi o dostęp do kamery. Zezwól na to, abyśmy mogli zrobić zdjęcia dokumentu. Nic nie jest nagrywane, zanim zaczniesz.",
    tipsKnop: "Rozumiem",
    fotosKop: "Zrób zdjęcia dokumentu tożsamości",
    fotosTekst: "Zrób zdjęcia przodu i tyłu dowodu osobistego lub strony ze zdjęciem w paszporcie. Cały dokument musi być widoczny.",
    tikStart: "Dotknij, aby zacząć",
    handmatigKop: "Tryb ręcznego robienia zdjęć",
    handmatigTekst: "Naciśnij Zrób zdjęcie, gdy będziesz gotowy.",
    doorgaan: "Dalej",
    vastleggen: "Zrób zdjęcie",
    kiesCamera: "Wybierz tylną kamerę",
    cameraNr: "Kamera {n}",
    camGeen: "Brak dostępnej kamery. Użyj aplikacji aparatu w urządzeniu.",
    docLicht: "Potrzeba więcej światła",
    docGlans: "Mniej odblasków: lekko przechyl dokument",
    docStil: "Trzymaj nieruchomo",
    docDichterbij: "Podejdź trochę bliżej",
    docVerder: "Odsuń aparat trochę dalej",
    docCode: "Kod na dole musi być ostry i widoczny",
    docZoeken: "Trzymaj dokument w ramce",
    docGoed: "Dobrze, robimy zdjęcie",
    omdraaiId: "Odwróć dowód osobisty",
    omdraaiRijbewijs: "Odwróć prawo jazdy",
    selfieVerder: "Odsuń aparat trochę dalej",
    selfieStil: "Dobrze, nie ruszaj się",
    vanzelf: "Zdjęcie zostanie zrobione automatycznie, gdy wszystko będzie dobrze.",
    zelfWissel: "Nie udaje się automatycznie?",
    zelfWisselKnop: "Zrób zdjęcie samodzielnie",
    autoKanNiet: "Tutaj aparat nie zrobi zdjęcia automatycznie.",
    zelfModus: "Ustaw wszystko w kadrze i naciśnij przycisk.",
  },
  ro: {
    introTitel: "Confirmă-ți identitatea",
    introTekst: "Te rugăm să scanezi actul de identitate și să faci un selfie.",
    beginnen: "Începe scanarea actului (2 minute)",
    tipsKop: "Sfaturi pentru o fotografie bună",
    tips: [
      "Așază documentul pe o suprafață închisă la culoare și uniformă.",
      "Asigură-te că ai destulă lumină, de preferat lumina zilei, fără umbră sau reflexii.",
      "Toate datele personale de pe document trebuie să fie bine vizibile și lizibile.",
    ],
    privacyRegel: "Folosim fotografiile tale doar pentru această verificare.",
    toestemmingTitel: "Avem nevoie de camera ta",
    toestemmingUitleg: "În scurt timp dispozitivul te va întreba dacă ZekerFlex poate folosi camera. Alege „Permite”. Folosim camera doar pentru o fotografie a documentului și un selfie.",
    toestemmingKnop: "Permite camera",
    toestemmingBezig: "Un moment…",
    toestemmingGeweigerd: "Camera a fost refuzată. Pornește camera din setările browserului sau ale aplicației și încearcă din nou, sau folosește aplicația de cameră a dispozitivului.",
    docsKop: "Documente acceptate:",
    docsNl: "Pașaport olandez, carte de identitate sau permis de ședere",
    docsEu: "Pașaport sau carte de identitate dintr-o țară UE/SEE sau din Elveția",
    ovaal: "Poziționează fața în oval și nu te mișca",
    draaiOm: "Întoarce cartea de identitate și fotografiază cealaltă parte",
    procKop: "Îți procesăm datele",
    procGelezen: "Document citit",
    procHandmatig: "Datele documentului introduse",
    procVersturen: "Se trimit fotografiile și se verifică datele",
    procKlaar: "Fotografii trimise, date verificate",
    bedankTitel: "Mulțumim!",
    bedankTekst: "Datele tale de verificare au fost trimise.",
    bijnaTitel: "Aproape gata!",
    bijnaTekst: "Verificarea ID a fost procesată. Vezi starea în aplicație și mergi mai departe!",
    bijnaKnop: "Mai departe la joburi",
    euIntroTitel: "Identificare online",
    euIntroTekst: "Cu ZekerFlex îți împarți în siguranță datele cu firma cu care lucrezi.",
    euIntroLabel: "Durează câteva minute",
    euStart: "Începe identificarea",
    euBewaard: "Datele tale sunt păstrate criptat.",
    tmKop: "Este nevoie de acord",
    tmLabel: "Datele tale sunt trimise criptat",
    tmUitleg: "Îți cerem acordul pentru a colecta și prelucra următoarele date în vederea verificării identității. Detaliile sunt în politica de confidențialitate.",
    tmLijst: ["Date personale de identificare","Date biometrice (un selfie al feței tale)","Informații despre documentele de identitate"],
    tmVink: "Am citit politica de confidențialitate și sunt de acord cu prelucrarea datelor mele",
    tmKnop: "De acord, continuă",
    tipsSheetKop: "Sfaturi",
    tipsCamera: "Browserul îți cere acces la cameră. Permite-l ca să putem fotografia documentul. Nu se înregistrează nimic înainte să începi.",
    tipsKnop: "Am înțeles",
    fotosKop: "Fotografiază documentul de identitate",
    fotosTekst: "Fotografiază fața și verso-ul unei cărți de identitate sau pagina cu fotografie a unui pașaport. Documentul trebuie să fie vizibil în întregime.",
    tikStart: "Atinge pentru a începe",
    handmatigKop: "Mod de captare manual",
    handmatigTekst: "Apasă Capturează când ești gata.",
    doorgaan: "Continuă",
    vastleggen: "Capturează",
    kiesCamera: "Alege camera din spate",
    cameraNr: "Camera {n}",
    camGeen: "Nu este disponibilă nicio cameră. Folosește aplicația de cameră a dispozitivului.",
    docLicht: "Este nevoie de mai multă lumină",
    docGlans: "Mai puține reflexii: înclină puțin documentul",
    docStil: "Ține-l nemișcat",
    docDichterbij: "Apropie-te puțin",
    docVerder: "Ține camera puțin mai departe",
    docCode: "Codul de jos trebuie să fie clar și vizibil",
    docZoeken: "Ține documentul în cadru",
    docGoed: "Bine, se face fotografia",
    omdraaiId: "Întoarce cartea de identitate",
    omdraaiRijbewijs: "Întoarce permisul de conducere",
    selfieVerder: "Ține camera puțin mai departe",
    selfieStil: "Bine, nu te mișca",
    vanzelf: "Fotografia se face automat când totul este în regulă.",
    zelfWissel: "Nu merge automat?",
    zelfWisselKnop: "Fac eu fotografia",
    autoKanNiet: "Aici camera nu poate face fotografia automat.",
    zelfModus: "Încadrează totul bine și apasă butonul.",
  },
  uk: {
    introTitel: "Підтвердьте свою особу",
    introTekst: "Ми просимо вас відсканувати документ, що посвідчує особу, і зробити селфі.",
    beginnen: "Почати сканування документа (2 хвилини)",
    tipsKop: "Поради для гарного фото",
    tips: [
      "Покладіть документ на темну однотонну поверхню.",
      "Подбайте про достатнє освітлення, краще денне, без тіней і відблисків.",
      "Усі особисті дані в документі мають бути добре видимі та читабельні.",
    ],
    privacyRegel: "Ваші фото ми використовуємо лише для цієї перевірки.",
    toestemmingTitel: "Нам потрібна ваша камера",
    toestemmingUitleg: "Зараз пристрій запитає, чи може ZekerFlex використовувати камеру. Виберіть «Дозволити». Камеру ми використовуємо лише для фото документа та селфі.",
    toestemmingKnop: "Дозволити камеру",
    toestemmingBezig: "Зачекайте…",
    toestemmingGeweigerd: "Доступ до камери відхилено. Увімкніть камеру в налаштуваннях браузера чи застосунку й спробуйте ще раз або скористайтеся застосунком камери на пристрої.",
    docsKop: "Прийнятні документи:",
    docsNl: "Нідерландський паспорт, ID-картка або посвідка на проживання",
    docsEu: "Паспорт або ID-картка з країни ЄС/ЄЕЗ чи зі Швейцарії",
    ovaal: "Розмістіть обличчя в овалі та не рухайтеся",
    draaiOm: "Переверніть ID-картку та сфотографуйте іншу сторону",
    procKop: "Ми обробляємо ваші дані",
    procGelezen: "Документ прочитано",
    procHandmatig: "Дані документа введено",
    procVersturen: "Надсилання фото та перевірка даних",
    procKlaar: "Фото надіслано, дані перевірено",
    bedankTitel: "Дякуємо!",
    bedankTekst: "Ваші дані для верифікації надіслано.",
    bijnaTitel: "Майже готово!",
    bijnaTekst: "Вашу перевірку ID оброблено. Перевірте статус у застосунку та рухайтеся далі!",
    bijnaKnop: "Далі до робіт",
    euIntroTitel: "Онлайн-ідентифікація",
    euIntroTekst: "За допомогою ZekerFlex ви безпечно передаєте свої дані компанії, з якою працюєте.",
    euIntroLabel: "Це займе кілька хвилин",
    euStart: "Почати ідентифікацію",
    euBewaard: "Ваші дані зберігаються в зашифрованому вигляді.",
    tmKop: "Потрібна згода",
    tmLabel: "Ваші дані надсилаються в зашифрованому вигляді",
    tmUitleg: "Ми просимо вашої згоди на збір і обробку наведених нижче даних для перевірки вашої особи. Подробиці — у політиці конфіденційності.",
    tmLijst: ["Особисті ідентифікаційні дані","Біометричні дані (селфі вашого обличчя)","Інформація про документи, що посвідчують особу"],
    tmVink: "Я прочитав(-ла) політику конфіденційності та погоджуюся на обробку моїх даних",
    tmKnop: "Погоджуюся, далі",
    tipsSheetKop: "Поради",
    tipsCamera: "Браузер запитає доступ до камери. Дозвольте його, щоб ми могли сфотографувати документ. Нічого не записується, доки ви не почнете.",
    tipsKnop: "Зрозуміло",
    fotosKop: "Сфотографуйте документ, що посвідчує особу",
    fotosTekst: "Сфотографуйте лицьову й зворотну сторону ID-картки або сторінку з фото в паспорті. Документ має бути видно повністю.",
    tikStart: "Торкніться, щоб почати",
    handmatigKop: "Ручний режим зйомки",
    handmatigTekst: "Натисніть «Зробити фото», коли будете готові.",
    doorgaan: "Далі",
    vastleggen: "Зробити фото",
    kiesCamera: "Виберіть задню камеру",
    cameraNr: "Камера {n}",
    camGeen: "Камера недоступна. Скористайтеся застосунком камери на пристрої.",
    docLicht: "Потрібно більше світла",
    docGlans: "Менше відблисків: трохи нахиліть документ",
    docStil: "Тримайте нерухомо",
    docDichterbij: "Підійдіть трохи ближче",
    docVerder: "Тримайте камеру трохи далі",
    docCode: "Код унизу має бути чітким і в кадрі",
    docZoeken: "Тримайте документ у рамці",
    docGoed: "Добре, робимо фото",
    omdraaiId: "Переверніть ID-картку",
    omdraaiRijbewijs: "Переверніть посвідчення водія",
    selfieVerder: "Тримайте камеру трохи далі",
    selfieStil: "Добре, не рухайтеся",
    vanzelf: "Фото буде зроблено автоматично, щойно все буде правильно.",
    zelfWissel: "Не виходить автоматично?",
    zelfWisselKnop: "Зробити фото самостійно",
    autoKanNiet: "Тут камера не зробить фото автоматично.",
    zelfModus: "Наведіть усе в кадр і натисніть кнопку.",
  },
};
