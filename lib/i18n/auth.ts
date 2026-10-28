import type { Locale } from "@/lib/i18n/config";

// ---------------------------------------------------------------------------
// Sign-up, log-in, e-mail confirmation and the verification form in all five
// freelancer languages — so a Polish, Romanian or Ukrainian worker can get in
// and verified without Dutch. Placeholders: {email}, {list}.
// ---------------------------------------------------------------------------

export interface AuthDict {
  lang: string;
  shell: { points: [string, string, string]; tagline: string; or: string };
  login: {
    title: string;
    subtitle: string;
    noAccount: string;
    create: string;
    email: string;
    password: string;
    showPw: string;
    hidePw: string;
    remember: string;
    forgot: string;
    submit: string;
    busy: string;
    google: string;
    trouble: string;
    contact: string;
    resetDone: string;
    failed: string;
    twoFaTitle: string;
    twoFaBody: string;
    code: string;
    back: string;
  };
  register: {
    title: string;
    subtitle: string;
    haveAccount: string;
    login: string;
    seekWork: string;
    seekPeople: string;
    google: string;
    workForm: string;
    kinds: { zzp: [string, string]; flexwerker: [string, string]; uitzendkracht: [string, string] };
    yourName: string;
    fullName: string;
    email: string;
    checking: string;
    emailFree: string;
    emailTaken: string;
    emailInvalid: string;
    emailCheckUnavailable: string;
    phone: string;
    optional: string;
    password: string;
    passwordCheckUnavailable: string;
    generate: string;
    show: string;
    hide: string;
    strength: string;
    breached: string;
    repeat: string;
    match: string;
    noMatch: string;
    submitWorker: string;
    submitCompany: string;
    busy: string;
    agree1: string;
    terms: string;
    and: string;
    privacy: string;
    afterWorker: string;
  };
  verify: {
    title: string;
    subtitle: string;
    backToLogin: string;
    badLink: string;
    badLinkBody: string;
    codeLabel: string;
    confirm: string;
    confirming: string;
    resend: string;
    busy: string;
    local: string;
  };
  page: {
    back: string;
    title: string;
    subWorker: string;
    subUitzend: string;
    doneTitle: string;
    doneSub: string;
    bankTitle: string;
    bankSub: string;
    allDone: string;
    needBoth: string;
    needBankHere: string;
    needBank: string;
    idLabel: string;
    idHint: string;
    bankLabel: string;
    bankHint: string;
    approved: string;
    uploaded: string;
    rejectedUpload: string;
    notUploaded: string;
    upload: string;
    uploading: string;
    replace: string;
    uploadFailed: string;
    other: string;
    walletTitle: string;
    walletBody: string;
    walletButton: string;
    bankLoginTitle: string;
    bankLoginHint: string;
    bankLoginButton: string;
    bankLoginBusy: string;
    bankLoginChecking: string;
    bankLoginOk: string;
    bankLoginNoName: string;
    bankLoginNoIban: string;
    bankLoginCancelled: string;
    bankLoginFallback: string;
  };
  onb: {
    business: string;
    regKind: string;
    kvk: [string, string];
    vat: [string, string];
    kvkLabel: string;
    kvkHint: string;
    vatLabel: string;
    vatHint: string;
    uitzendNote: string;
    home: string;
    postal: string;
    house: string;
    iban: string;
    identity: string;
    howIdentity: string;
    stripe: [string, string];
    upload: [string, string];
    stripeInfo: string;
    docType: string;
    docs: { PASSPORT: string; ID_CARD: string; DRIVERS_LICENSE: string };
    docNumber: string;
    validUntil: string;
    nameOnDoc: string;
    photosInfo: string;
    front: [string, string];
    back: [string, string];
    selfie: [string, string];
    pick: string;
    replace: string;
    processing: string;
    missing: string;
    missingNames: { documentFront: string; documentBack: string; selfie: string };
    and: string;
    tooBig: string;
    failed: string;
    offline: string;
    submit: string;
    toStripe: string;
    checkingBusy: string;
    stripeNote: string;
    uploadNote: string;
    result: string;
    verified: string;
    rejected: string;
    inReview: string;
    company: string;
    validated: string;
    notValidated: string;
    checks: string;
    retry: string;
    help: string;
    toDashboard: string;
  };
}

const nl: AuthDict = {
  lang: "Taal",
  shell: {
    tagline: "Zeker van je werk, zeker van je mensen.",
    or: "of",
    points: ["Zelf kiezen hoe snel je uitbetaald wordt", "Modelovereenkomst en Wet DBA-bewaking inbegrepen", "Transparant over gegevens en dienstverleners"],
  },
  login: {
    title: "Welkom bij ZekerFlex",
    subtitle: "Vul je gegevens in.",
    noAccount: "Nog geen account?",
    create: "Aanmaken",
    email: "E-mailadres",
    password: "Wachtwoord",
    showPw: "Wachtwoord tonen",
    hidePw: "Wachtwoord verbergen",
    remember: "Ingelogd blijven",
    forgot: "Wachtwoord vergeten?",
    submit: "Inloggen",
    busy: "Bezig…",
    google: "Inloggen met Google",
    trouble: "Problemen met inloggen?",
    contact: "Neem contact op met support",
    resetDone: "Je wachtwoord is aangepast. Log in met je nieuwe wachtwoord.",
    failed: "Inloggen mislukt.",
    twoFaTitle: "Tweestapsverificatie",
    twoFaBody: "Open je authenticator-app en vul de 6-cijferige code in voor {email}. Telefoon kwijt? Gebruik een van je herstelcodes.",
    code: "Code",
    back: "Terug — met een ander account inloggen",
  },
  register: {
    title: "Maak je account aan",
    subtitle: "Vul je gegevens in.",
    haveAccount: "Heb je al een account?",
    login: "Inloggen",
    seekWork: "Ik zoek werk",
    seekPeople: "Ik zoek mensen",
    google: "Maak account met Google",
    workForm: "Je werkvorm",
    kinds: { zzp: ["ZZP'er", "KVK of EU-btw-nummer"], flexwerker: ["Flexwerker", "Btw optioneel / KOR"], uitzendkracht: ["Uitzendkracht", "Geen KVK nodig"] },
    yourName: "Jouw naam",
    fullName: "Volledige naam",
    email: "E-mailadres",
    checking: "Controleren…",
    emailFree: "✓ Dit e-mailadres is beschikbaar",
    emailTaken: "Er bestaat al een account met dit e-mailadres.",
    emailInvalid: "Vul een geldig e-mailadres in.",
    emailCheckUnavailable: "Beschikbaarheidscontrole lukt niet. Je kunt doorgaan; we controleren dit bij aanmelding.",
    phone: "Telefoon",
    optional: "(optioneel)",
    password: "Wachtwoord",
    passwordCheckUnavailable: "De wachtwoordcontrole is tijdelijk niet beschikbaar. Je wachtwoord wordt bij aanmelding alsnog gecontroleerd.",
    generate: "Genereer sterk wachtwoord",
    show: "Tonen",
    hide: "Verbergen",
    strength: "Sterkte",
    breached: "Dit wachtwoord staat in bekende datalekken — kies een ander.",
    repeat: "Herhaal wachtwoord",
    match: "✓ Wachtwoorden komen overeen",
    noMatch: "De wachtwoorden komen niet overeen.",
    submitWorker: "Account aanmaken",
    submitCompany: "Organisatie aanmelden",
    busy: "Bezig…",
    agree1: "Door een account aan te maken ga je akkoord met de",
    terms: "voorwaarden",
    and: "en de",
    privacy: "privacyverklaring",
    afterWorker: "Na aanmelding rond je je profiel af met je KVK- of btw-nummer en een identiteitscheck.",
  },
  verify: {
    title: "Bevestig je e-mailadres",
    subtitle: "We hebben een code en link gestuurd naar {email}. Voer de code in of klik de link om je account te activeren.",
    backToLogin: "Terug naar inloggen",
    badLink: "Link niet geldig",
    badLinkBody: "Log in en vraag een nieuwe verificatielink aan.",
    codeLabel: "Vul de 6-cijferige code uit de e-mail in",
    confirm: "Bevestig mijn account",
    confirming: "Bevestigen…",
    resend: "Stuur de code opnieuw",
    busy: "Bezig…",
    local: "Lokale omgeving: er is nog geen externe e-mailserver ingesteld, dus hier is je verificatie direct.",
  },
  page: {
    back: "Instellingen",
    title: "Rond je verificatie af",
    subWorker: "Koppel je KVK of EU-btw-nummer en bevestig je identiteit — meestal binnen een minuut geregeld.",
    subUitzend: "Vul je thuisbasis en rekeningnummer in en bevestig je identiteit. Je hoeft geen KVK te koppelen — je werkt als uitzendkracht.",
    doneTitle: "Verificatie",
    doneSub: "Je account is volledig geverifieerd.",
    bankTitle: "Bankrekening bevestigen",
    bankSub: "Nodig voordat je uitbetaald kunt worden — zo weten we zeker dat het IBAN hierboven van jou is.",
    allDone: "✓ Je verplichte documenten staan klaar. Je IBAN wordt hiermee gecontroleerd.",
    needBoth: "Upload je identiteitsbewijs en een bankafschrift. Beide zijn verplicht voordat je uitbetaald kunt worden.",
    needBankHere: "Verifieer nog je bankrekening — log in bij je bank, dan controleren we je IBAN direct. Je identiteitsbewijs regel je hierboven.",
    needBank: "Verifieer je bankrekening. Dit is verplicht voordat je uitbetaald kunt worden — je identiteitsbewijs staat al goed via je verificatie.",
    idLabel: "Identiteitsbewijs",
    idHint: "Vul eerst de verificatie hierboven in — die vult dit automatisch. Los uploaden kan ook.",
    bankLabel: "Bankafschrift",
    bankHint: "Recent afschrift of schermafbeelding waarop je naam én IBAN staan. Bedragen mag je wegstrepen.",
    approved: "goedgekeurd ✓",
    uploaded: "geüpload ✓",
    rejectedUpload: "afgewezen — upload opnieuw",
    notUploaded: "nog niet geüpload",
    upload: "Uploaden",
    uploading: "Uploaden…",
    replace: "Vervangen",
    uploadFailed: "Upload mislukt",
    other: "Overig: extra documenten kun je via ZekerFlex Support toevoegen.",
    walletTitle: "Digitale ID-wallet",
    walletBody: "Heb je een ID in een wallet op dit apparaat staan? Dan hoef je geen foto's te maken.",
    walletButton: "Verifieer met wallet",
    bankLoginTitle: "Bankrekening verifiëren",
    bankLoginHint: "Log in bij je eigen bank via iDEAL en bevestig een betaling van € 0,01. Zo laat je bank zien dat de rekening van jou is; we krijgen alleen de naam van de rekeninghouder en de laatste cijfers van je IBAN.",
    bankLoginButton: "Inloggen bij mijn bank",
    bankLoginBusy: "Je bank openen…",
    bankLoginChecking: "We controleren de gegevens van je bank…",
    bankLoginOk: "✓ Geverifieerd via je bank: {name} · rekening eindigend op {last4}",
    bankLoginNoName: "Je bank gaf de naam \"{name}\", die niet overeenkomt met je account. Gebruik een rekening op je eigen naam, of upload een bankafschrift.",
    bankLoginNoIban: "Je bank gaf een rekening eindigend op {last4}, maar in je profiel staat een ander IBAN. Pas je IBAN aan of log in met de juiste rekening.",
    bankLoginCancelled: "Inloggen bij je bank is afgebroken. Probeer het opnieuw wanneer je wilt.",
    bankLoginFallback: "Geen Nederlandse bank? Upload een bankafschrift",
  },
  onb: {
    business: "Onderneming",
    regKind: "Soort registratie",
    kvk: ["KVK-nummer", "Ingeschreven in Nederland"],
    vat: ["Btw-nummer (EU)", "Bijv. uit Polen, Roemenië, België"],
    kvkLabel: "KVK-nummer",
    kvkHint: "We controleren dit live in het Handelsregister.",
    vatLabel: "Btw-nummer (met landcode)",
    vatHint: "We controleren dit live in de EU-database (VIES). Werk je in Nederland als zzp'er zonder KVK? Dan factureer je met je eigen btw-nummer.",
    uitzendNote: "Je werkt als uitzendkracht — je hoeft geen KVK te koppelen. Vul hieronder je thuisbasis, rekeningnummer en identiteitsbewijs in. Je BSN en loonheffingskorting vul je apart in bij “Uitzenden”.",
    home: "Thuisbasis & uitbetaling",
    postal: "Postcode",
    house: "Huisnr.",
    iban: "IBAN voor uitbetalingen",
    identity: "Identiteitsbewijs",
    howIdentity: "Hoe wil je je identiteit bevestigen?",
    stripe: ["Snel via Stripe (aanbevolen)", "Ongeveer 2 minuten met je telefooncamera: ID + selfie, meestal direct goedgekeurd."],
    upload: ["Zelf foto's uploaden", "Voorkant, achterkant en een selfie; wij controleren het."],
    stripeInfo: "Na “Verificatie versturen” ga je naar de beveiligde pagina van Stripe. Daar maak je met je camera een foto van je ID-kaart, paspoort of rijbewijs en een korte selfie. Daarna kom je automatisch hier terug.",
    docType: "Type document",
    docs: { PASSPORT: "Paspoort", ID_CARD: "Identiteitskaart", DRIVERS_LICENSE: "Rijbewijs" },
    docNumber: "Documentnummer",
    validUntil: "Geldig tot",
    nameOnDoc: "Naam zoals op document",
    photosInfo: "Drie foto's: de voorkant en achterkant van je document, en een selfie zodat we kunnen zien dat jij het bent. Maak ze met je camera of kies ze uit je galerij. Zorg voor goed licht en scherpe tekst.",
    front: ["Voorkant", "Pasfoto-zijde van je document"],
    back: ["Achterkant", "De kant zonder foto"],
    selfie: ["Selfie", "Kijk recht in de camera"],
    pick: "Foto maken of kiezen",
    replace: "Vervangen",
    processing: "Verwerken…",
    missing: "Maak of kies nog een foto van {list}.",
    missingNames: { documentFront: "de voorkant", documentBack: "de achterkant", selfie: "de selfie" },
    and: "en",
    tooBig: "De foto's zijn te groot om te versturen. Probeer het opnieuw — of kies kleinere foto's.",
    failed: "Er ging iets mis. Probeer het opnieuw.",
    offline: "Kon de verificatie niet versturen. Controleer je verbinding.",
    submit: "Verificatie versturen",
    toStripe: "Doorsturen naar Stripe…",
    checkingBusy: "Bezig met controleren…",
    stripeNote: "De ID-controle gebeurt door Stripe (onze betaalpartner), die je gegevens beveiligd verwerkt. ZekerFlex krijgt alleen de uitslag en je naam zoals op het document.",
    uploadNote: "Je foto's worden versleuteld bewaard door ZekerFlex en alleen gebruikt voor deze verificatie. Je hoeft je ID nergens anders nog een keer te uploaden.",
    result: "Resultaat",
    verified: "Geverifieerd",
    rejected: "Afgewezen",
    inReview: "In behandeling",
    company: "Onderneming",
    validated: "gevalideerd",
    notValidated: "niet gevalideerd",
    checks: "Controles",
    retry: "Gegevens aanpassen en opnieuw proberen",
    help: "Hulp nodig? support@zekerflex.com",
    toDashboard: "Naar mijn dashboard",
  },
};

const en: AuthDict = {
  lang: "Language",
  shell: {
    tagline: "Sure of your work, sure of your people.",
    or: "or",
    points: ["Choose how fast you get paid", "Model agreement and Dutch DBA-law monitoring included", "Fully self-hosted — your data stays yours"],
  },
  login: {
    title: "Welcome to ZekerFlex",
    subtitle: "Enter your details.",
    noAccount: "No account yet?",
    create: "Create one",
    email: "Email address",
    password: "Password",
    showPw: "Show password",
    hidePw: "Hide password",
    remember: "Stay logged in",
    forgot: "Forgot password?",
    submit: "Log in",
    busy: "Working…",
    google: "Log in with Google",
    trouble: "Trouble logging in?",
    contact: "Contact support",
    resetDone: "Your password has been changed. Log in with your new password.",
    failed: "Login failed.",
    twoFaTitle: "Two-step verification",
    twoFaBody: "Open your authenticator app and enter the 6-digit code for {email}. Lost your phone? Use one of your recovery codes.",
    code: "Code",
    back: "Back — log in with another account",
  },
  register: {
    title: "Create your account",
    subtitle: "Enter your details.",
    haveAccount: "Already have an account?",
    login: "Log in",
    seekWork: "I'm looking for work",
    seekPeople: "I'm looking for people",
    google: "Sign up with Google",
    workForm: "How you work",
    kinds: { zzp: ["Self-employed", "Dutch KVK or EU VAT number"], flexwerker: ["Flex worker", "VAT optional"], uitzendkracht: ["Agency worker", "No KVK needed"] },
    yourName: "Your name",
    fullName: "Full name",
    email: "Email address",
    checking: "Checking…",
    emailFree: "✓ This email address is available",
    emailTaken: "An account with this email address already exists.",
    emailInvalid: "Enter a valid email address.",
    emailCheckUnavailable: "We couldn't check availability. You can continue; we'll check during sign-up.",
    phone: "Phone",
    optional: "(optional)",
    password: "Password",
    passwordCheckUnavailable: "Password checking is temporarily unavailable. Your password will still be checked during sign-up.",
    generate: "Generate a strong password",
    show: "Show",
    hide: "Hide",
    strength: "Strength",
    breached: "This password appears in known data breaches — choose another one.",
    repeat: "Repeat password",
    match: "✓ Passwords match",
    noMatch: "The passwords don't match.",
    submitWorker: "Create account",
    submitCompany: "Register organisation",
    busy: "Working…",
    agree1: "By creating an account you agree to the",
    terms: "terms",
    and: "and the",
    privacy: "privacy statement",
    afterWorker: "After signing up you finish your profile with your KVK or VAT number and an ID check.",
  },
  verify: {
    title: "Confirm your email address",
    subtitle: "We sent a code and a link to {email}. Enter the code or click the link to activate your account.",
    backToLogin: "Back to log in",
    badLink: "Link not valid",
    badLinkBody: "Log in and request a new verification link.",
    codeLabel: "Enter the 6-digit code from the email",
    confirm: "Confirm my account",
    confirming: "Confirming…",
    resend: "Send the code again",
    busy: "Working…",
    local: "Local environment: no external mail server is set up yet, so here is your verification directly.",
  },
  page: {
    back: "Settings",
    title: "Finish your verification",
    subWorker: "Link your KVK or EU VAT number and confirm your identity — usually done within a minute.",
    subUitzend: "Enter your home base and bank account and confirm your identity. No KVK needed — you work as an agency worker.",
    doneTitle: "Verification",
    doneSub: "Your account is fully verified.",
    bankTitle: "Confirm bank account",
    bankSub: "Needed before you can be paid — so we know for sure the IBAN above is yours.",
    allDone: "✓ Your required documents are in place. Your IBAN is checked with them.",
    needBoth: "Upload your ID and a bank statement. Both are required before you can be paid.",
    needBankHere: "Still verify your bank account — log in at your bank and we check your IBAN instantly. Your ID is handled above.",
    needBank: "Verify your bank account. It's required before you can be paid — your ID is already covered by your verification.",
    idLabel: "Proof of identity",
    idHint: "Fill in the verification above first — it fills this in automatically. Uploading separately also works.",
    bankLabel: "Bank statement",
    bankHint: "A recent statement or screenshot showing your name and IBAN. You may black out amounts.",
    approved: "approved ✓",
    uploaded: "uploaded ✓",
    rejectedUpload: "rejected — upload again",
    notUploaded: "not uploaded yet",
    upload: "Upload",
    uploading: "Uploading…",
    replace: "Replace",
    uploadFailed: "Upload failed",
    other: "Other: you can add extra documents via ZekerFlex Support.",
    walletTitle: "Digital ID wallet",
    walletBody: "Have an ID in a wallet on this device? Then you don't need to take photos.",
    walletButton: "Verify with wallet",
    bankLoginTitle: "Verify bank account",
    bankLoginHint: "Log in at your own bank via iDEAL and confirm a € 0.01 payment. That's how your bank shows the account is yours; we only receive the account holder's name and the last digits of your IBAN.",
    bankLoginButton: "Log in at my bank",
    bankLoginBusy: "Opening your bank…",
    bankLoginChecking: "Checking the details from your bank…",
    bankLoginOk: "✓ Verified via your bank: {name} · account ending in {last4}",
    bankLoginNoName: "Your bank returned the name \"{name}\", which doesn't match your account. Use an account in your own name, or upload a bank statement.",
    bankLoginNoIban: "Your bank returned an account ending in {last4}, but your profile has a different IBAN. Update your IBAN or log in with the right account.",
    bankLoginCancelled: "Logging in at your bank was cancelled. Try again whenever you like.",
    bankLoginFallback: "No Dutch bank? Upload a bank statement",
  },
  onb: {
    business: "Business",
    regKind: "Registration type",
    kvk: ["KVK number", "Registered in the Netherlands"],
    vat: ["VAT number (EU)", "E.g. from Poland, Romania, Belgium"],
    kvkLabel: "KVK number",
    kvkHint: "We check this live in the Dutch Chamber of Commerce register.",
    vatLabel: "VAT number (with country code)",
    vatHint: "We check this live in the EU database (VIES). Self-employed in the Netherlands without a KVK? Then you invoice with your own VAT number.",
    uitzendNote: "You work as an agency worker — no KVK needed. Fill in your home base, bank account and ID below. You enter your BSN and payroll tax credit separately under “Agency work”.",
    home: "Home base & payouts",
    postal: "Postcode",
    house: "House no.",
    iban: "IBAN for payouts",
    identity: "Proof of identity",
    howIdentity: "How do you want to confirm your identity?",
    stripe: ["Quick via Stripe (recommended)", "About 2 minutes with your phone camera: ID + selfie, usually approved right away."],
    upload: ["Upload photos yourself", "Front, back and a selfie; we check it."],
    stripeInfo: "After “Send verification” you go to Stripe's secure page. There you take a photo of your ID card, passport or driving licence and a short selfie. Then you come back here automatically.",
    docType: "Document type",
    docs: { PASSPORT: "Passport", ID_CARD: "ID card", DRIVERS_LICENSE: "Driving licence" },
    docNumber: "Document number",
    validUntil: "Valid until",
    nameOnDoc: "Name as on document",
    photosInfo: "Three photos: the front and back of your document, and a selfie so we can see it's you. Take them with your camera or choose them from your gallery. Make sure there's good light and sharp text.",
    front: ["Front", "Photo side of your document"],
    back: ["Back", "The side without a photo"],
    selfie: ["Selfie", "Look straight into the camera"],
    pick: "Take or choose a photo",
    replace: "Replace",
    processing: "Processing…",
    missing: "Still take or choose a photo of {list}.",
    missingNames: { documentFront: "the front", documentBack: "the back", selfie: "the selfie" },
    and: "and",
    tooBig: "The photos are too large to send. Try again — or choose smaller photos.",
    failed: "Something went wrong. Please try again.",
    offline: "Couldn't send the verification. Check your connection.",
    submit: "Send verification",
    toStripe: "Taking you to Stripe…",
    checkingBusy: "Checking…",
    stripeNote: "The ID check is done by Stripe (our payment partner), which processes your data securely. ZekerFlex only receives the result and your name as on the document.",
    uploadNote: "Your photos are stored encrypted by ZekerFlex and used only for this verification. You don't need to upload your ID anywhere else.",
    result: "Result",
    verified: "Verified",
    rejected: "Rejected",
    inReview: "In review",
    company: "Business",
    validated: "validated",
    notValidated: "not validated",
    checks: "Checks",
    retry: "Edit details and try again",
    help: "Need help? support@zekerflex.com",
    toDashboard: "Go to my dashboard",
  },
};

const pl: AuthDict = {
  lang: "Język",
  shell: {
    tagline: "Pewna praca, pewni ludzie.",
    or: "lub",
    points: ["Sam wybierasz, jak szybko dostajesz wypłatę", "Umowa i sygnały ryzyka Wet DBA w cenie", "Przejrzyste informacje o danych i usługodawcach"],
  },
  login: {
    title: "Witaj w ZekerFlex",
    subtitle: "Wpisz swoje dane.",
    noAccount: "Nie masz jeszcze konta?",
    create: "Załóż konto",
    email: "Adres e-mail",
    password: "Hasło",
    showPw: "Pokaż hasło",
    hidePw: "Ukryj hasło",
    remember: "Nie wylogowuj mnie",
    forgot: "Nie pamiętasz hasła?",
    submit: "Zaloguj się",
    busy: "Chwileczkę…",
    google: "Zaloguj się przez Google",
    trouble: "Problem z logowaniem?",
    contact: "Skontaktuj się z pomocą",
    resetDone: "Hasło zostało zmienione. Zaloguj się nowym hasłem.",
    failed: "Logowanie nie powiodło się.",
    twoFaTitle: "Weryfikacja dwuetapowa",
    twoFaBody: "Otwórz aplikację uwierzytelniającą i wpisz 6-cyfrowy kod dla {email}. Zgubiłeś telefon? Użyj jednego z kodów odzyskiwania.",
    code: "Kod",
    back: "Wróć — zaloguj się na inne konto",
  },
  register: {
    title: "Załóż konto",
    subtitle: "Wpisz swoje dane.",
    haveAccount: "Masz już konto?",
    login: "Zaloguj się",
    seekWork: "Szukam pracy",
    seekPeople: "Szukam ludzi",
    google: "Załóż konto przez Google",
    workForm: "Forma pracy",
    kinds: { zzp: ["Samozatrudniony", "KVK lub unijny NIP (VAT)"], flexwerker: ["Pracownik elastyczny", "VAT opcjonalnie"], uitzendkracht: ["Pracownik agencyjny", "Bez KVK"] },
    yourName: "Twoje imię i nazwisko",
    fullName: "Imię i nazwisko",
    email: "Adres e-mail",
    checking: "Sprawdzanie…",
    emailFree: "✓ Ten adres e-mail jest dostępny",
    emailTaken: "Konto z tym adresem e-mail już istnieje.",
    emailInvalid: "Podaj prawidłowy adres e-mail.",
    emailCheckUnavailable: "Nie udało się sprawdzić dostępności. Możesz kontynuować; sprawdzimy to przy rejestracji.",
    phone: "Telefon",
    optional: "(opcjonalnie)",
    password: "Hasło",
    passwordCheckUnavailable: "Sprawdzenie hasła jest chwilowo niedostępne. Hasło zostanie sprawdzone podczas rejestracji.",
    generate: "Wygeneruj silne hasło",
    show: "Pokaż",
    hide: "Ukryj",
    strength: "Siła",
    breached: "To hasło występuje w znanych wyciekach danych — wybierz inne.",
    repeat: "Powtórz hasło",
    match: "✓ Hasła są zgodne",
    noMatch: "Hasła nie są zgodne.",
    submitWorker: "Załóż konto",
    submitCompany: "Zarejestruj firmę",
    busy: "Chwileczkę…",
    agree1: "Zakładając konto, akceptujesz",
    terms: "regulamin",
    and: "oraz",
    privacy: "politykę prywatności",
    afterWorker: "Po rejestracji uzupełnisz profil numerem KVK lub VAT i weryfikacją tożsamości.",
  },
  verify: {
    title: "Potwierdź adres e-mail",
    subtitle: "Wysłaliśmy kod i link na {email}. Wpisz kod lub kliknij link, aby aktywować konto.",
    backToLogin: "Wróć do logowania",
    badLink: "Link jest nieważny",
    badLinkBody: "Zaloguj się i poproś o nowy link weryfikacyjny.",
    codeLabel: "Wpisz 6-cyfrowy kod z e-maila",
    confirm: "Potwierdź moje konto",
    confirming: "Potwierdzanie…",
    resend: "Wyślij kod ponownie",
    busy: "Chwileczkę…",
    local: "Środowisko lokalne: serwer poczty nie jest jeszcze skonfigurowany, więc weryfikacja jest tutaj.",
  },
  page: {
    back: "Ustawienia",
    title: "Dokończ weryfikację",
    subWorker: "Podaj numer KVK lub unijny numer VAT i potwierdź tożsamość — zwykle trwa to minutę.",
    subUitzend: "Podaj adres i numer konta oraz potwierdź tożsamość. Nie potrzebujesz KVK — pracujesz jako pracownik agencyjny.",
    doneTitle: "Weryfikacja",
    doneSub: "Twoje konto jest w pełni zweryfikowane.",
    bankTitle: "Potwierdź konto bankowe",
    bankSub: "Potrzebne przed pierwszą wypłatą — dzięki temu wiemy, że powyższy IBAN należy do Ciebie.",
    allDone: "✓ Wymagane dokumenty są gotowe. Na ich podstawie sprawdzamy Twój IBAN.",
    needBoth: "Prześlij dokument tożsamości i wyciąg bankowy. Oba są wymagane przed wypłatą.",
    needBankHere: "Zweryfikuj jeszcze konto bankowe — zaloguj się w banku, a od razu sprawdzimy Twój IBAN. Dokument tożsamości załatwiasz powyżej.",
    needBank: "Zweryfikuj konto bankowe. Jest to wymagane przed wypłatą — dokument tożsamości masz już potwierdzony w weryfikacji.",
    idLabel: "Dokument tożsamości",
    idHint: "Najpierw wypełnij weryfikację powyżej — uzupełni to automatycznie. Możesz też przesłać osobno.",
    bankLabel: "Wyciąg bankowy",
    bankHint: "Aktualny wyciąg lub zrzut ekranu z Twoim imieniem i nazwiskiem oraz IBAN. Kwoty możesz zamazać.",
    approved: "zatwierdzono ✓",
    uploaded: "przesłano ✓",
    rejectedUpload: "odrzucono — prześlij ponownie",
    notUploaded: "jeszcze nie przesłano",
    upload: "Prześlij",
    uploading: "Przesyłanie…",
    replace: "Zmień",
    uploadFailed: "Przesyłanie nie powiodło się",
    other: "Inne: dodatkowe dokumenty możesz dodać przez pomoc ZekerFlex.",
    walletTitle: "Cyfrowy portfel ID",
    walletBody: "Masz dokument w portfelu cyfrowym na tym urządzeniu? Wtedy nie musisz robić zdjęć.",
    walletButton: "Zweryfikuj portfelem",
    bankLoginTitle: "Weryfikacja konta bankowego",
    bankLoginHint: "Zaloguj się w swoim banku przez iDEAL i potwierdź płatność 0,01 €. W ten sposób bank pokazuje, że konto jest Twoje; otrzymujemy tylko imię i nazwisko posiadacza i ostatnie cyfry IBAN.",
    bankLoginButton: "Zaloguj się w moim banku",
    bankLoginBusy: "Otwieranie banku…",
    bankLoginChecking: "Sprawdzamy dane z Twojego banku…",
    bankLoginOk: "✓ Zweryfikowano przez bank: {name} · konto kończące się na {last4}",
    bankLoginNoName: "Bank podał nazwisko \"{name}\", które nie pasuje do Twojego konta. Użyj rachunku na swoje nazwisko lub prześlij wyciąg bankowy.",
    bankLoginNoIban: "Bank podał konto kończące się na {last4}, ale w profilu masz inny IBAN. Zmień IBAN albo zaloguj się na właściwe konto.",
    bankLoginCancelled: "Logowanie w banku zostało przerwane. Spróbuj ponownie, kiedy chcesz.",
    bankLoginFallback: "Nie masz holenderskiego banku? Prześlij wyciąg bankowy",
  },
  onb: {
    business: "Działalność",
    regKind: "Rodzaj rejestracji",
    kvk: ["Numer KVK", "Zarejestrowany w Holandii"],
    vat: ["Numer VAT (UE)", "Np. z Polski, Rumunii, Belgii"],
    kvkLabel: "Numer KVK",
    kvkHint: "Sprawdzamy go na żywo w holenderskim rejestrze handlowym.",
    vatLabel: "Numer VAT (z kodem kraju)",
    vatHint: "Sprawdzamy go na żywo w unijnej bazie VIES. Pracujesz w Holandii jako samozatrudniony bez KVK? Wtedy wystawiasz faktury na swój własny numer VAT, np. PL1234567890.",
    uitzendNote: "Pracujesz jako pracownik agencyjny — nie potrzebujesz KVK. Poniżej podaj adres, numer konta i dokument tożsamości. BSN i ulgę podatkową podajesz osobno w części “Uitzenden”.",
    home: "Adres i wypłaty",
    postal: "Kod pocztowy",
    house: "Nr domu",
    iban: "IBAN do wypłat",
    identity: "Dokument tożsamości",
    howIdentity: "Jak chcesz potwierdzić tożsamość?",
    stripe: ["Szybko przez Stripe (polecane)", "Ok. 2 minuty z aparatem telefonu: dokument + selfie, zwykle od razu zatwierdzone."],
    upload: ["Prześlij zdjęcia samodzielnie", "Przód, tył i selfie; my to sprawdzimy."],
    stripeInfo: "Po kliknięciu “Wyślij weryfikację” przejdziesz na bezpieczną stronę Stripe. Tam zrobisz zdjęcie dowodu osobistego, paszportu lub prawa jazdy oraz krótkie selfie. Potem automatycznie wrócisz tutaj.",
    docType: "Rodzaj dokumentu",
    docs: { PASSPORT: "Paszport", ID_CARD: "Dowód osobisty", DRIVERS_LICENSE: "Prawo jazdy" },
    docNumber: "Numer dokumentu",
    validUntil: "Ważny do",
    nameOnDoc: "Imię i nazwisko jak w dokumencie",
    photosInfo: "Trzy zdjęcia: przód i tył dokumentu oraz selfie, abyśmy widzieli, że to Ty. Zrób je aparatem lub wybierz z galerii. Zadbaj o dobre światło i wyraźny tekst.",
    front: ["Przód", "Strona dokumentu ze zdjęciem"],
    back: ["Tył", "Strona bez zdjęcia"],
    selfie: ["Selfie", "Patrz prosto w aparat"],
    pick: "Zrób lub wybierz zdjęcie",
    replace: "Zmień",
    processing: "Przetwarzanie…",
    missing: "Zrób lub wybierz jeszcze zdjęcie: {list}.",
    missingNames: { documentFront: "przód", documentBack: "tył", selfie: "selfie" },
    and: "i",
    tooBig: "Zdjęcia są za duże, aby je wysłać. Spróbuj ponownie — albo wybierz mniejsze zdjęcia.",
    failed: "Coś poszło nie tak. Spróbuj ponownie.",
    offline: "Nie udało się wysłać weryfikacji. Sprawdź połączenie.",
    submit: "Wyślij weryfikację",
    toStripe: "Przekierowanie do Stripe…",
    checkingBusy: "Sprawdzanie…",
    stripeNote: "Weryfikację dokumentu przeprowadza Stripe (nasz partner płatniczy), który bezpiecznie przetwarza Twoje dane. ZekerFlex otrzymuje tylko wynik i imię oraz nazwisko z dokumentu.",
    uploadNote: "Twoje zdjęcia są przechowywane przez ZekerFlex w formie zaszyfrowanej i używane tylko do tej weryfikacji. Nie musisz nigdzie indziej ponownie przesyłać dokumentu.",
    result: "Wynik",
    verified: "Zweryfikowano",
    rejected: "Odrzucono",
    inReview: "W trakcie sprawdzania",
    company: "Działalność",
    validated: "zweryfikowana",
    notValidated: "niezweryfikowana",
    checks: "Kontrole",
    retry: "Popraw dane i spróbuj ponownie",
    help: "Potrzebujesz pomocy? support@zekerflex.com",
    toDashboard: "Przejdź do panelu",
  },
};

const ro: AuthDict = {
  lang: "Limbă",
  shell: {
    tagline: "Sigur pe munca ta, sigur pe oamenii tăi.",
    or: "sau",
    points: ["Alegi singur cât de repede ești plătit", "Contract-model și monitorizare legea DBA incluse", "Găzduit complet local — datele tale rămân ale tale"],
  },
  login: {
    title: "Bine ai venit la ZekerFlex",
    subtitle: "Introdu datele tale.",
    noAccount: "Nu ai încă un cont?",
    create: "Creează cont",
    email: "Adresă de e-mail",
    password: "Parolă",
    showPw: "Arată parola",
    hidePw: "Ascunde parola",
    remember: "Rămâi conectat",
    forgot: "Ai uitat parola?",
    submit: "Conectare",
    busy: "Se procesează…",
    google: "Conectare cu Google",
    trouble: "Probleme la conectare?",
    contact: "Contactează asistența",
    resetDone: "Parola a fost schimbată. Conectează-te cu parola nouă.",
    failed: "Conectarea a eșuat.",
    twoFaTitle: "Verificare în doi pași",
    twoFaBody: "Deschide aplicația de autentificare și introdu codul de 6 cifre pentru {email}. Ai pierdut telefonul? Folosește unul dintre codurile de recuperare.",
    code: "Cod",
    back: "Înapoi — conectare cu alt cont",
  },
  register: {
    title: "Creează-ți contul",
    subtitle: "Introdu datele tale.",
    haveAccount: "Ai deja un cont?",
    login: "Conectare",
    seekWork: "Caut de lucru",
    seekPeople: "Caut oameni",
    google: "Creează cont cu Google",
    workForm: "Forma de muncă",
    kinds: { zzp: ["PFA / independent", "KVK sau cod TVA UE"], flexwerker: ["Lucrător flexibil", "TVA opțional"], uitzendkracht: ["Lucrător prin agenție", "Fără KVK"] },
    yourName: "Numele tău",
    fullName: "Nume complet",
    email: "Adresă de e-mail",
    checking: "Se verifică…",
    emailFree: "✓ Această adresă de e-mail este disponibilă",
    emailTaken: "Există deja un cont cu această adresă de e-mail.",
    emailInvalid: "Introdu o adresă de e-mail validă.",
    emailCheckUnavailable: "Nu am putut verifica disponibilitatea. Poți continua; vom verifica la înregistrare.",
    phone: "Telefon",
    optional: "(opțional)",
    password: "Parolă",
    passwordCheckUnavailable: "Verificarea parolei nu este disponibilă momentan. Parola va fi verificată la înregistrare.",
    generate: "Generează o parolă puternică",
    show: "Arată",
    hide: "Ascunde",
    strength: "Putere",
    breached: "Această parolă apare în scurgeri de date cunoscute — alege alta.",
    repeat: "Repetă parola",
    match: "✓ Parolele coincid",
    noMatch: "Parolele nu coincid.",
    submitWorker: "Creează cont",
    submitCompany: "Înregistrează organizația",
    busy: "Se procesează…",
    agree1: "Prin crearea unui cont accepți",
    terms: "termenii",
    and: "și",
    privacy: "declarația de confidențialitate",
    afterWorker: "După înregistrare îți completezi profilul cu numărul KVK sau codul TVA și o verificare a identității.",
  },
  verify: {
    title: "Confirmă adresa de e-mail",
    subtitle: "Am trimis un cod și un link la {email}. Introdu codul sau apasă pe link pentru a-ți activa contul.",
    backToLogin: "Înapoi la conectare",
    badLink: "Link invalid",
    badLinkBody: "Conectează-te și cere un nou link de verificare.",
    codeLabel: "Introdu codul de 6 cifre din e-mail",
    confirm: "Confirmă contul meu",
    confirming: "Se confirmă…",
    resend: "Trimite din nou codul",
    busy: "Se procesează…",
    local: "Mediu local: încă nu este configurat un server de e-mail, așa că verificarea este aici.",
  },
  page: {
    back: "Setări",
    title: "Finalizează verificarea",
    subWorker: "Adaugă numărul KVK sau codul TVA UE și confirmă-ți identitatea — de obicei durează un minut.",
    subUitzend: "Completează adresa și contul bancar și confirmă-ți identitatea. Nu ai nevoie de KVK — lucrezi prin agenție.",
    doneTitle: "Verificare",
    doneSub: "Contul tău este complet verificat.",
    bankTitle: "Confirmă contul bancar",
    bankSub: "Necesar înainte de a fi plătit — așa știm sigur că IBAN-ul de mai sus este al tău.",
    allDone: "✓ Documentele obligatorii sunt în regulă. Cu ele verificăm IBAN-ul tău.",
    needBoth: "Încarcă actul de identitate și un extras de cont. Ambele sunt obligatorii înainte de plată.",
    needBankHere: "Mai verifică-ți contul bancar — autentifică-te la bancă și îți verificăm IBAN-ul imediat. Actul de identitate îl rezolvi mai sus.",
    needBank: "Verifică-ți contul bancar. Este obligatoriu înainte de plată — actul de identitate e deja acoperit de verificare.",
    idLabel: "Act de identitate",
    idHint: "Completează mai întâi verificarea de mai sus — o completează automat. Poți încărca și separat.",
    bankLabel: "Extras de cont",
    bankHint: "Un extras recent sau o captură de ecran cu numele și IBAN-ul tău. Poți acoperi sumele.",
    approved: "aprobat ✓",
    uploaded: "încărcat ✓",
    rejectedUpload: "respins — încarcă din nou",
    notUploaded: "încă neîncărcat",
    upload: "Încarcă",
    uploading: "Se încarcă…",
    replace: "Înlocuiește",
    uploadFailed: "Încărcarea a eșuat",
    other: "Altele: documente suplimentare poți adăuga prin asistența ZekerFlex.",
    walletTitle: "Portofel digital ID",
    walletBody: "Ai un act într-un portofel digital pe acest dispozitiv? Atunci nu trebuie să faci fotografii.",
    walletButton: "Verifică prin portofel",
    bankLoginTitle: "Verifică contul bancar",
    bankLoginHint: "Autentifică-te la banca ta prin iDEAL și confirmă o plată de 0,01 €. Așa arată banca că acel cont e al tău; primim doar numele titularului și ultimele cifre ale IBAN-ului.",
    bankLoginButton: "Autentificare la banca mea",
    bankLoginBusy: "Se deschide banca…",
    bankLoginChecking: "Verificăm datele de la banca ta…",
    bankLoginOk: "✓ Verificat prin bancă: {name} · cont care se termină în {last4}",
    bankLoginNoName: "Banca a transmis numele \"{name}\", care nu corespunde contului tău. Folosește un cont pe numele tău sau încarcă un extras de cont.",
    bankLoginNoIban: "Banca a transmis un cont care se termină în {last4}, dar în profil ai alt IBAN. Actualizează IBAN-ul sau autentifică-te cu contul corect.",
    bankLoginCancelled: "Autentificarea la bancă a fost anulată. Încearcă din nou oricând.",
    bankLoginFallback: "Nu ai bancă olandeză? Încarcă un extras de cont",
  },
  onb: {
    business: "Firmă",
    regKind: "Tip de înregistrare",
    kvk: ["Număr KVK", "Înregistrat în Olanda"],
    vat: ["Cod TVA (UE)", "De ex. din Polonia, România, Belgia"],
    kvkLabel: "Număr KVK",
    kvkHint: "Îl verificăm în timp real în registrul comerțului din Olanda.",
    vatLabel: "Cod TVA (cu codul țării)",
    vatHint: "Îl verificăm în timp real în baza de date UE (VIES). Lucrezi în Olanda ca independent fără KVK? Atunci facturezi cu propriul cod TVA, de ex. RO12345678.",
    uitzendNote: "Lucrezi prin agenție — nu ai nevoie de KVK. Completează mai jos adresa, contul bancar și actul de identitate. BSN-ul și deducerea fiscală le completezi separat la “Uitzenden”.",
    home: "Adresă și plăți",
    postal: "Cod poștal",
    house: "Nr.",
    iban: "IBAN pentru plăți",
    identity: "Act de identitate",
    howIdentity: "Cum vrei să îți confirmi identitatea?",
    stripe: ["Rapid prin Stripe (recomandat)", "Cam 2 minute cu camera telefonului: act + selfie, de obicei aprobat imediat."],
    upload: ["Încarcă singur fotografiile", "Față, verso și un selfie; noi le verificăm."],
    stripeInfo: "După “Trimite verificarea” ajungi pe pagina securizată Stripe. Acolo faci o fotografie a cărții de identitate, a pașaportului sau a permisului și un scurt selfie. Apoi revii automat aici.",
    docType: "Tip document",
    docs: { PASSPORT: "Pașaport", ID_CARD: "Carte de identitate", DRIVERS_LICENSE: "Permis de conducere" },
    docNumber: "Număr document",
    validUntil: "Valabil până la",
    nameOnDoc: "Numele ca pe document",
    photosInfo: "Trei fotografii: fața și versoul documentului și un selfie, ca să vedem că ești tu. Fă-le cu camera sau alege-le din galerie. Asigură-te că e lumină bună și textul e clar.",
    front: ["Față", "Partea cu fotografia"],
    back: ["Verso", "Partea fără fotografie"],
    selfie: ["Selfie", "Privește drept în cameră"],
    pick: "Fă sau alege o fotografie",
    replace: "Înlocuiește",
    processing: "Se procesează…",
    missing: "Mai fă sau alege o fotografie cu {list}.",
    missingNames: { documentFront: "fața", documentBack: "versoul", selfie: "selfie-ul" },
    and: "și",
    tooBig: "Fotografiile sunt prea mari pentru a fi trimise. Încearcă din nou — sau alege fotografii mai mici.",
    failed: "Ceva n-a mers. Încearcă din nou.",
    offline: "Verificarea nu a putut fi trimisă. Verifică conexiunea.",
    submit: "Trimite verificarea",
    toStripe: "Te trimitem la Stripe…",
    checkingBusy: "Se verifică…",
    stripeNote: "Verificarea actului este făcută de Stripe (partenerul nostru de plăți), care îți prelucrează datele în siguranță. ZekerFlex primește doar rezultatul și numele de pe document.",
    uploadNote: "Fotografiile tale sunt păstrate criptat de ZekerFlex și folosite doar pentru această verificare. Nu trebuie să încarci actul nicăieri altundeva.",
    result: "Rezultat",
    verified: "Verificat",
    rejected: "Respins",
    inReview: "În verificare",
    company: "Firmă",
    validated: "validată",
    notValidated: "nevalidată",
    checks: "Verificări",
    retry: "Modifică datele și încearcă din nou",
    help: "Ai nevoie de ajutor? support@zekerflex.com",
    toDashboard: "Mergi la panoul meu",
  },
};

const uk: AuthDict = {
  lang: "Мова",
  shell: {
    tagline: "Впевненість у роботі, впевненість у людях.",
    or: "або",
    points: ["Ти сам обираєш, як швидко отримати виплату", "Типовий договір і контроль за законом DBA включено", "Власні сервери — твої дані належать тобі"],
  },
  login: {
    title: "Ласкаво просимо до ZekerFlex",
    subtitle: "Введи свої дані.",
    noAccount: "Ще немає акаунта?",
    create: "Створити",
    email: "Електронна пошта",
    password: "Пароль",
    showPw: "Показати пароль",
    hidePw: "Сховати пароль",
    remember: "Залишатися в системі",
    forgot: "Забув пароль?",
    submit: "Увійти",
    busy: "Зачекай…",
    google: "Увійти через Google",
    trouble: "Проблеми зі входом?",
    contact: "Зв'яжися з підтримкою",
    resetDone: "Пароль змінено. Увійди з новим паролем.",
    failed: "Не вдалося увійти.",
    twoFaTitle: "Двоетапна перевірка",
    twoFaBody: "Відкрий застосунок-автентифікатор і введи 6-значний код для {email}. Загубив телефон? Використай один із кодів відновлення.",
    code: "Код",
    back: "Назад — увійти з іншим акаунтом",
  },
  register: {
    title: "Створи акаунт",
    subtitle: "Введи свої дані.",
    haveAccount: "Вже маєш акаунт?",
    login: "Увійти",
    seekWork: "Шукаю роботу",
    seekPeople: "Шукаю людей",
    google: "Створити акаунт через Google",
    workForm: "Форма роботи",
    kinds: { zzp: ["ФОП / самозайнятий", "KVK або номер ПДВ ЄС"], flexwerker: ["Гнучкий працівник", "ПДВ необов'язково"], uitzendkracht: ["Через агенцію", "KVK не потрібен"] },
    yourName: "Твоє ім'я",
    fullName: "Повне ім'я",
    email: "Електронна пошта",
    checking: "Перевіряємо…",
    emailFree: "✓ Ця адреса доступна",
    emailTaken: "Акаунт з цією адресою вже існує.",
    emailInvalid: "Введи правильну адресу електронної пошти.",
    emailCheckUnavailable: "Не вдалося перевірити доступність. Можна продовжити; перевіримо під час реєстрації.",
    phone: "Телефон",
    optional: "(необов'язково)",
    password: "Пароль",
    passwordCheckUnavailable: "Перевірка пароля тимчасово недоступна. Пароль усе одно буде перевірено під час реєстрації.",
    generate: "Згенерувати надійний пароль",
    show: "Показати",
    hide: "Сховати",
    strength: "Надійність",
    breached: "Цей пароль є у відомих витоках даних — обери інший.",
    repeat: "Повтори пароль",
    match: "✓ Паролі збігаються",
    noMatch: "Паролі не збігаються.",
    submitWorker: "Створити акаунт",
    submitCompany: "Зареєструвати організацію",
    busy: "Зачекай…",
    agree1: "Створюючи акаунт, ти погоджуєшся з",
    terms: "умовами",
    and: "та",
    privacy: "політикою конфіденційності",
    afterWorker: "Після реєстрації ти завершиш профіль номером KVK або ПДВ і перевіркою особи.",
  },
  verify: {
    title: "Підтверди електронну пошту",
    subtitle: "Ми надіслали код і посилання на {email}. Введи код або натисни посилання, щоб активувати акаунт.",
    backToLogin: "Назад до входу",
    badLink: "Посилання недійсне",
    badLinkBody: "Увійди та попроси нове посилання для підтвердження.",
    codeLabel: "Введи 6-значний код з листа",
    confirm: "Підтвердити акаунт",
    confirming: "Підтверджуємо…",
    resend: "Надіслати код ще раз",
    busy: "Зачекай…",
    local: "Локальне середовище: поштовий сервер ще не налаштовано, тому підтвердження тут.",
  },
  page: {
    back: "Налаштування",
    title: "Заверши перевірку",
    subWorker: "Вкажи номер KVK або номер ПДВ ЄС і підтверди особу — зазвичай це займає хвилину.",
    subUitzend: "Вкажи адресу й рахунок і підтверди особу. KVK не потрібен — ти працюєш через агенцію.",
    doneTitle: "Перевірка",
    doneSub: "Твій акаунт повністю перевірено.",
    bankTitle: "Підтвердь банківський рахунок",
    bankSub: "Потрібно перед першою виплатою — так ми точно знаємо, що IBAN вище твій.",
    allDone: "✓ Обов'язкові документи готові. За ними ми перевіряємо твій IBAN.",
    needBoth: "Завантаж документ і банківську виписку. Обидва потрібні перед виплатою.",
    needBankHere: "Ще підтвердь банківський рахунок — увійди у свій банк, і ми одразу перевіримо IBAN. Документ ти вже оформлюєш вище.",
    needBank: "Підтвердь банківський рахунок. Це потрібно перед виплатою — документ уже підтверджено перевіркою.",
    idLabel: "Документ, що посвідчує особу",
    idHint: "Спершу заповни перевірку вище — це заповниться автоматично. Можна також завантажити окремо.",
    bankLabel: "Банківська виписка",
    bankHint: "Свіжа виписка або знімок екрана з твоїм ім'ям та IBAN. Суми можна зафарбувати.",
    approved: "схвалено ✓",
    uploaded: "завантажено ✓",
    rejectedUpload: "відхилено — завантаж ще раз",
    notUploaded: "ще не завантажено",
    upload: "Завантажити",
    uploading: "Завантаження…",
    replace: "Замінити",
    uploadFailed: "Не вдалося завантажити",
    other: "Інше: додаткові документи можна додати через підтримку ZekerFlex.",
    walletTitle: "Цифровий гаманець ID",
    walletBody: "Маєш документ у цифровому гаманці на цьому пристрої? Тоді фото не потрібні.",
    walletButton: "Підтвердити гаманцем",
    bankLoginTitle: "Підтвердження рахунку",
    bankLoginHint: "Увійди у свій банк через iDEAL і підтвердь платіж 0,01 €. Так банк показує, що рахунок твій; ми отримуємо лише ім'я власника та останні цифри IBAN.",
    bankLoginButton: "Увійти в мій банк",
    bankLoginBusy: "Відкриваємо банк…",
    bankLoginChecking: "Перевіряємо дані від твого банку…",
    bankLoginOk: "✓ Підтверджено через банк: {name} · рахунок, що закінчується на {last4}",
    bankLoginNoName: "Банк передав ім'я \"{name}\", яке не збігається з твоїм акаунтом. Використай рахунок на своє ім'я або завантаж виписку.",
    bankLoginNoIban: "Банк передав рахунок, що закінчується на {last4}, але в профілі інший IBAN. Зміни IBAN або увійди з правильним рахунком.",
    bankLoginCancelled: "Вхід у банк скасовано. Спробуй ще раз, коли захочеш.",
    bankLoginFallback: "Немає нідерландського банку? Завантаж виписку",
  },
  onb: {
    business: "Підприємство",
    regKind: "Тип реєстрації",
    kvk: ["Номер KVK", "Зареєстровано в Нідерландах"],
    vat: ["Номер ПДВ (ЄС)", "Напр. з Польщі, Румунії, Бельгії"],
    kvkLabel: "Номер KVK",
    kvkHint: "Ми перевіряємо його в реальному часі в торговому реєстрі Нідерландів.",
    vatLabel: "Номер ПДВ (з кодом країни)",
    vatHint: "Ми перевіряємо його в реальному часі в базі ЄС (VIES). Працюєш у Нідерландах як самозайнятий без KVK? Тоді виставляєш рахунки зі своїм номером ПДВ.",
    uitzendNote: "Ти працюєш через агенцію — KVK не потрібен. Нижче вкажи адресу, рахунок і документ. BSN і податкову пільгу вказуєш окремо в розділі “Uitzenden”.",
    home: "Адреса та виплати",
    postal: "Поштовий індекс",
    house: "№ будинку",
    iban: "IBAN для виплат",
    identity: "Документ, що посвідчує особу",
    howIdentity: "Як ти хочеш підтвердити особу?",
    stripe: ["Швидко через Stripe (рекомендовано)", "Близько 2 хвилин з камерою телефона: документ + селфі, зазвичай схвалюється одразу."],
    upload: ["Завантажити фото самостійно", "Лицьовий бік, зворот і селфі; ми перевіримо."],
    stripeInfo: "Після “Надіслати перевірку” ти перейдеш на захищену сторінку Stripe. Там сфотографуєш ID-картку, паспорт або посвідчення водія та зробиш коротке селфі. Потім автоматично повернешся сюди.",
    docType: "Тип документа",
    docs: { PASSPORT: "Паспорт", ID_CARD: "ID-картка", DRIVERS_LICENSE: "Посвідчення водія" },
    docNumber: "Номер документа",
    validUntil: "Дійсний до",
    nameOnDoc: "Ім'я як у документі",
    photosInfo: "Три фото: лицьовий бік і зворот документа та селфі, щоб ми бачили, що це ти. Зроби їх камерою або обери з галереї. Подбай про гарне світло та чіткий текст.",
    front: ["Лицьовий бік", "Бік документа з фото"],
    back: ["Зворот", "Бік без фото"],
    selfie: ["Селфі", "Дивись прямо в камеру"],
    pick: "Зробити або обрати фото",
    replace: "Замінити",
    processing: "Обробка…",
    missing: "Ще зроби або обери фото: {list}.",
    missingNames: { documentFront: "лицьовий бік", documentBack: "зворот", selfie: "селфі" },
    and: "і",
    tooBig: "Фото завеликі для надсилання. Спробуй ще раз — або обери менші фото.",
    failed: "Щось пішло не так. Спробуй ще раз.",
    offline: "Не вдалося надіслати перевірку. Перевір з'єднання.",
    submit: "Надіслати перевірку",
    toStripe: "Переходимо до Stripe…",
    checkingBusy: "Перевіряємо…",
    stripeNote: "Перевірку документа виконує Stripe (наш платіжний партнер), який безпечно обробляє твої дані. ZekerFlex отримує лише результат і ім'я з документа.",
    uploadNote: "Твої фото зберігаються ZekerFlex у зашифрованому вигляді й використовуються лише для цієї перевірки. Більше ніде не потрібно завантажувати документ.",
    result: "Результат",
    verified: "Підтверджено",
    rejected: "Відхилено",
    inReview: "На розгляді",
    company: "Підприємство",
    validated: "перевірено",
    notValidated: "не перевірено",
    checks: "Перевірки",
    retry: "Змінити дані та спробувати ще раз",
    help: "Потрібна допомога? support@zekerflex.com",
    toDashboard: "До мого кабінету",
  },
};

export const AUTH_DICTS: Record<Locale, AuthDict> = { nl, en, pl, ro, uk };

export function fill(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}
