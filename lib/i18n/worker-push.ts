import { basisLocale, type BasisLocale, type Locale } from "@/lib/i18n/config";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { amsterdamClock, amsterdamParts } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Push texts to workers, in their own app language (lib/i18n/worker-locale.ts).
// Server-only (it reads FREELANCER_DICTS); never import into a client file.
// Amounts stay in Dutch euro notation ("€ 135,00"), the same as on the payslip.
// Machine-assisted translations: native-speaker review recommended.
// ---------------------------------------------------------------------------

export interface WorkerPushTexts {
  hours: string;
  approvedTitle: string;
  approvedPaid: (amount: string) => string;
  approvedSpeed: string;
  approvedPayroll: (week: string) => string;
  approvedAdvance: (amount: string, week: string) => string;
  timeChangedTitle: (title: string) => string;
  timeChangedBody: (when: string) => string;
  cancelledTitle: (title: string) => string;
  cancelledBody: (when: string) => string;
  perHour: string;
  standbyTitle: (title: string) => string;
  standbyBody: (details: string) => string;
  replacementTitle: (title: string) => string;
  replacementBody: (name: string, when: string, branch: string) => string;
  claimApprovedTitle: string;
  claimApprovedBody: (title: string, amount: string) => string;
  claimRejectedTitle: string;
  employerClaimTitle: string;
  employerClaimBody: (title: string, amount: string) => string;
  employerWaivedTitle: string;
  employerWaivedBody: (title: string) => string;
  correctionTitle: string;
  correctionBody: (title: string, from: string, to: string) => string;
  noShowTitle: (title: string) => string;
  noShowBody: (title: string, branch: string) => string;
  selectedTitle: string;
  selectedBody: (title: string, branch: string, when: string) => string;
  dayTitle: string;
  dayBody: (title: string, branch: string, time: string) => string;
  soonTitle: string;
  soonBody: (title: string, branch: string, time: string) => string;
  startTitle: string;
  startBody: (title: string, branch: string) => string;
  profileTitle: string;
  profileBody: string;
  declinedTitle: string;
  declinedBody: (title: string) => string;
  /** reactie vervallen: de klus begon zonder dat de opdrachtgever koos (lib/offers/expire.ts) */
  notChosenTitle: string;
  notChosenBody: (title: string) => string;
  followTitle: (company: string) => string;
  followMore: (extraDays: number) => string;
  geoTitle: (hours: number) => string;
  geoBody: (title: string, city: string, km: string, time: string, amount: string) => string;
  /** spoedoproep (lib/spoed): push, sms/WhatsApp en de antwoorden op "1"/"2"/STOP */
  spoedTitle: (title: string) => string;
  spoedBody: (company: string, city: string, when: string, rate: string) => string;
  spoedSms: (title: string, company: string, city: string, when: string, rate: string, link: string) => string;
  spoedAccepted: (title: string, when: string, link: string) => string;
  spoedPending: (title: string) => string;
  spoedDeclined: string;
  spoedUnknown: string;
  spoedNone: string;
  spoedStopped: string;
  spoedFailed: (reason: string) => string;
  /** recht om te werken (lib/werkrecht): het document is nagekeken */
  werkrechtOkTitle: string;
  werkrechtOkBody: (land: string) => string;
  werkrechtAfTitle: string;
  werkrechtAfBody: (land: string, reden: string) => string;
  /** ID geverifieerd (lib/onboarding/id-geverifieerd.ts): alleen wat voor het ID geldt */
  idOkTitle: string;
  idOkBody: string;
  /** een klusvoorstel van de matching (lib/notifications/dispatcher.ts): titel, en plek · stad · tarief · reistijd */
  offerTitle: (title: string) => string;
  offerBody: (plek: string, stad: string, tarief: string, minuten: number) => string;
  /** administratie-mijlpalen (lib/worker/milestone-push.ts); bij btw en KOR volgt de mijlpaaltekst in dezelfde taal */
  msBtwTitle: string;
  msUrenTitle: string;
  msUrenBody: string;
  msSpreidingTitle: string;
  msSpreidingBody: (headline: string) => string;
  msKorTitle: string;
  /** badge omhoog (lib/worker/stats-sync.ts) */
  badge: Record<"SILVER" | "GOLD" | "PLATINUM", { title: string; body: string }>;
  /** bedrijf geverifieerd: bevestig je klus (lib/company/verified.ts) */
  verifiedTitle: string;
  verifiedBody: (company: string, title: string) => string;
  /** uren invullen (lib/autopilot/actions.ts) */
  hoursReminderTitle: string;
  hoursReminderBody: (title: string, branch: string, time: string) => string;
  /** uitbetaling geblokkeerd door een onvolledig profiel (lib/timesheets/approve.ts) */
  payoutIncompleteTitle: string;
  payoutIncompleteBody: (reason: "iban" | "dest" | "pending") => string;
  /** kentekenherkenning bij de slagboom (lib/locatie/toegang.ts) */
  welcomeTitle: (venue: string) => string;
  welcomeBody: (plate: string) => string;
  /** testmelding (app/api/me/push/test) */
  testTitle: string;
  testBody: string;
  /** chat en bellen (lib/messaging/notify.ts) */
  callTitle: (name: string, video: boolean) => string;
  callBody: string;
  missedTitle: (name: string) => string;
  missedVideoBody: string;
  missedBody: string;
  newMessage: string;
}

export const WORKER_PUSH: Record<BasisLocale, WorkerPushTexts> = {
  nl: {
    hours: "uur",
    approvedTitle: "✅ Je uren zijn goedgekeurd",
    approvedPaid: (a) => `${a} is onderweg naar je rekening.`,
    approvedSpeed: "Je uitbetaling volgt volgens de snelheid die je koos.",
    approvedPayroll: (w) => `Je loon volgt met de verloning van ${w}.`,
    approvedAdvance: (a, w) => `Je voorschot van ${a} is onderweg; de rest volgt met de verloning van ${w}.`,
    timeChangedTitle: (t) => `Nieuwe tijd: ${t}`,
    timeChangedBody: (w) => `De opdrachtgever heeft je dienst verzet naar ${w}.`,
    cancelledTitle: (t) => `Geannuleerd: ${t}`,
    cancelledBody: (w) => `De opdrachtgever heeft je dienst van ${w} geannuleerd. Bekijk de klus voor de vergoeding.`,
    perHour: "/u",
    standbyTitle: (t) => `⚡ Spoeddienst: ${t}`,
    standbyBody: (d) => `${d}. Je staat op standby: wie het eerst aanneemt, heeft hem.`,
    replacementTitle: (t) => `Jij neemt de klus over: ${t}`,
    replacementBody: (n, w, b) => `${n} heeft jou gekozen als vervanger: ${w} bij ${b}. Bevestig je komst in de app.`,
    claimApprovedTitle: "Je annuleringsclaim is goedgekeurd",
    claimApprovedBody: (t, a) => `${t}: je ontvangt ${a} bij je eerstvolgende uitbetaling.`,
    claimRejectedTitle: "Je annuleringsclaim is afgewezen",
    employerClaimTitle: "De opdrachtgever claimt een vergoeding",
    employerClaimBody: (t, a) => `${t}: ${a} wegens te laat afzeggen of niet opdagen. Je krijgt hierover een factuur per mail.`,
    employerWaivedTitle: "Geen vergoeding geclaimd",
    employerWaivedBody: (t) => `De opdrachtgever ziet af van een vergoeding voor ${t}.`,
    correctionTitle: "Correctie op je uren voorgesteld",
    correctionBody: (t, f, to) => `${t}: ${f} → ${to} uur. Bekijk het en reageer in de app.`,
    noShowTitle: (t) => `Niet ingecheckt: ${t}`,
    noShowBody: (t, b) => `Je staat als niet opgekomen voor ${t} bij ${b}. Was je er wel? Stuur de opdrachtgever direct een bericht in de app.`,
    selectedTitle: "🎉 Je bent uitgekozen!",
    selectedBody: (t, b, w) => `${t} bij ${b}, ${w}. Bekijk de klus in de app.`,
    dayTitle: "📅 Morgen werken",
    dayBody: (t, b, tm) => `${t} bij ${b} begint morgen om ${tm}. Bereid je goed voor: check de route en je werkkleding.`,
    soonTitle: "⏰ Over 2 uur begint je klus",
    soonBody: (t, b, tm) => `${t} bij ${b} om ${tm}. Vertrek op tijd!`,
    startTitle: "▶️ Je klus begint nu",
    startBody: (t, b) => `${t} bij ${b}. Vergeet niet in te checken in de app.`,
    profileTitle: "Je bent er bijna 👋",
    profileBody: "Vul je gegevens in om te beginnen — daarna kun je direct op klussen reageren.",
    declinedTitle: "Reactie niet gekozen",
    declinedBody: (t) => `Voor "${t}" is iemand anders gekozen. Er staan nog genoeg andere klussen voor je klaar.`,
    notChosenTitle: "Helaas niet uitgekozen",
    notChosenBody: (t) => `Voor "${t}" ben je deze keer niet gekozen. Zoek een andere klus: er staan er genoeg voor je klaar.`,
    followTitle: (c) => `❤️ Nieuwe dienst bij ${c}`,
    followMore: (n) => ` (+${n} ${n === 1 ? "dag" : "dagen"})`,
    geoTitle: (h) => `📍 Klus dichtbij — begint over ${h} uur`,
    geoBody: (t, c, km, tm, a) => `${t} in ${c} (±${km} km), start ${tm} · €${a}/uur. Reageer snel in de app.`,
    spoedTitle: (t) => `⚡ Spoedoproep: ${t}`,
    spoedBody: (c, s, w, r) => `${c} in ${s} zoekt je nú: ${w} · ${r}. Open de app en neem aan.`,
    spoedSms: (t, c, s, w, r, l) => `SPOED ZekerFlex: ${c} zoekt ${t} in ${s}, ${w}, ${r}. Antwoord 1 = ik neem aan, 2 = nee. Info: ${l} (STOP = geen berichten meer)`,
    spoedAccepted: (t, w, l) => `Top, je staat ingepland: ${t}, ${w}. Details: ${l}`,
    spoedPending: (t) => `Je reactie op ${t} is genoteerd; de opdrachtgever bevestigt zodra zijn bedrijf is goedgekeurd.`,
    spoedDeclined: "Bedankt voor je antwoord, we zoeken verder. Tot de volgende keer!",
    spoedUnknown: "Antwoord 1 om de spoedklus aan te nemen of 2 om af te slaan.",
    spoedNone: "Er staat geen spoedklus meer voor je open. Kijk in de app voor klussen.",
    spoedStopped: "Oké, je krijgt geen sms of WhatsApp meer voor spoedklussen. Aanzetten kan in de app bij Account.",
    spoedFailed: (r) => `Dat lukte niet: ${r}`,
    werkrechtOkTitle: "Je document is goedgekeurd",
    werkrechtOkBody: (l) => `Je mag via ZekerFlex werken in ${l}. Je kunt diensten aannemen.`,
    werkrechtAfTitle: "Je document is afgewezen",
    werkrechtAfBody: (l, r) => `Werken in ${l}: ${r} Upload een nieuw document bij Verificatie.`,
    idOkTitle: "Je ID is geverifieerd",
    idOkBody: "Je kunt op klussen reageren zodra de rest van je aanmelding klopt. Een duidelijke foto en je werkervaring helpen opdrachtgevers je te kiezen.",
    offerTitle: (t) => `Nieuwe klus: ${t}`,
    offerBody: (p, c, r, m) => `${p}, ${c} · ${r} · ±${m} min reizen`,
    msBtwTitle: "🧾 Btw-aangifte bijna",
    msUrenTitle: "⏱️ 1.225 uur gehaald!",
    msUrenBody: "Je hebt het urencriterium gehaald — je komt in aanmerking voor de zelfstandigenaftrek. Bekijk wat dat voor je betekent.",
    msSpreidingTitle: "⚖️ Let op je spreiding over opdrachtgevers",
    msSpreidingBody: (h) => `Je omzet: ${h}. Werk ook voor andere opdrachtgevers, zodat je in lijn blijft met de Wet DBA.`,
    msKorTitle: "📊 Let op je KOR-grens",
    badge: {
      SILVER: { title: "🥈 Je bent nu Zilver", body: "Opdrachtgevers zien je zilveren badge en je krijgt een klein voordeel in de matching." },
      GOLD: { title: "🥇 Je bent nu Goud", body: "Voorrang in de matching: je komt eerder in beeld bij nieuwe diensten." },
      PLATINUM: { title: "💎 Je bent nu Platina", body: "De hoogste badge, met de meeste voorrang in de matching. Knap werk!" },
    },
    verifiedTitle: "Bedrijf geverifieerd — bevestig je klus",
    verifiedBody: (c, t) => `${c} is goedgekeurd. Tik op "Aannemen" bij "${t}" om ingepland te worden.`,
    hoursReminderTitle: "🕒 Vul je uren in",
    hoursReminderBody: (t, b, tm) => `${t} bij ${b} (${tm}) — dien je uren in, dan kan de uitbetaling starten.`,
    payoutIncompleteTitle: "Vul je gegevens aan om uitbetaald te worden",
    payoutIncompleteBody: (r) =>
      `Je uren kunnen nog niet goedgekeurd en uitbetaald worden: ${r === "iban" ? "er staat nog geen geldig rekeningnummer (IBAN) op je profiel." : r === "dest" ? "er is nog geen uitbetaalbestemming op je profiel ingesteld." : "je rekeningnummer is recent gewijzigd en nog niet geverifieerd."} Vul je profiel 100% in (o.a. je bankrekening/IBAN).`,
    welcomeTitle: (v) => `👋 Welkom bij ${v}`,
    welcomeBody: (p) => `Je kenteken ${p} is herkend, de slagboom gaat open. Vergeet niet in te checken in de app.`,
    testTitle: "🔔 Testmelding van ZekerFlex",
    testBody: "Top — je meldingen werken. Zo krijg je straks een seintje bij een dienst die begint.",
    callTitle: (n, v) => (v ? `📹 ${n} belt je (video)` : `📞 ${n} belt je`),
    callBody: "Tik om op te nemen in ZekerFlex.",
    missedTitle: (n) => `Gemiste oproep van ${n}`,
    missedVideoBody: "📹 Videogesprek — tik om terug te bellen.",
    missedBody: "📞 Tik om terug te bellen.",
    newMessage: "Nieuw bericht",
  },
  en: {
    hours: "hours",
    approvedTitle: "✅ Your hours have been approved",
    approvedPaid: (a) => `${a} is on its way to your account.`,
    approvedSpeed: "Your payout follows the speed you chose.",
    approvedPayroll: (w) => `Your wage follows with the payroll of ${w}.`,
    approvedAdvance: (a, w) => `Your advance of ${a} is on its way; the rest follows with the payroll of ${w}.`,
    timeChangedTitle: (t) => `New time: ${t}`,
    timeChangedBody: (w) => `The client moved your shift to ${w}.`,
    cancelledTitle: (t) => `Cancelled: ${t}`,
    cancelledBody: (w) => `The client cancelled your shift on ${w}. Open the job to see your compensation.`,
    perHour: "/h",
    standbyTitle: (t) => `⚡ Urgent shift: ${t}`,
    standbyBody: (d) => `${d}. You're on standby: first to accept gets it.`,
    replacementTitle: (t) => `You're taking over: ${t}`,
    replacementBody: (n, w, b) => `${n} picked you as replacement: ${w} at ${b}. Confirm you're coming in the app.`,
    claimApprovedTitle: "Your cancellation claim was approved",
    claimApprovedBody: (t, a) => `${t}: you'll receive ${a} with your next payout.`,
    claimRejectedTitle: "Your cancellation claim was rejected",
    employerClaimTitle: "The client is claiming compensation",
    employerClaimBody: (t, a) => `${t}: ${a} for cancelling late or not showing up. You'll get an invoice by email.`,
    employerWaivedTitle: "No compensation claimed",
    employerWaivedBody: (t) => `The client waives compensation for ${t}.`,
    correctionTitle: "Correction to your hours proposed",
    correctionBody: (t, f, to) => `${t}: ${f} → ${to} hours. Review it and respond in the app.`,
    noShowTitle: (t) => `Not checked in: ${t}`,
    noShowBody: (t, b) => `You're marked as a no-show for ${t} at ${b}. Were you there? Message the client right away in the app.`,
    selectedTitle: "🎉 You've been selected!",
    selectedBody: (t, b, w) => `${t} at ${b}, ${w}. Open the job in the app.`,
    dayTitle: "📅 Working tomorrow",
    dayBody: (t, b, tm) => `${t} at ${b} starts tomorrow at ${tm}. Get ready: check your route and work clothes.`,
    soonTitle: "⏰ Your job starts in 2 hours",
    soonBody: (t, b, tm) => `${t} at ${b} at ${tm}. Leave on time!`,
    startTitle: "▶️ Your job starts now",
    startBody: (t, b) => `${t} at ${b}. Don't forget to check in in the app.`,
    profileTitle: "Almost there 👋",
    profileBody: "Fill in your details to get started — then you can respond to jobs right away.",
    declinedTitle: "Response not chosen",
    declinedBody: (t) => `Someone else was chosen for "${t}". There are plenty of other jobs waiting for you.`,
    notChosenTitle: "Not selected this time",
    notChosenBody: (t) => `You were not chosen for "${t}" this time. Find another job: there are plenty waiting for you.`,
    followTitle: (c) => `❤️ New shift at ${c}`,
    followMore: (n) => ` (+${n} ${n === 1 ? "day" : "days"})`,
    geoTitle: (h) => `📍 Job nearby — starts in ${h} ${h === 1 ? "hour" : "hours"}`,
    geoBody: (t, c, km, tm, a) => `${t} in ${c} (±${km} km), starts ${tm} · €${a}/hour. Respond quickly in the app.`,
    spoedTitle: (t) => `⚡ Urgent call: ${t}`,
    spoedBody: (c, s, w, r) => `${c} in ${s} needs you now: ${w} · ${r}. Open the app and accept.`,
    spoedSms: (t, c, s, w, r, l) => `URGENT ZekerFlex: ${c} needs ${t} in ${s}, ${w}, ${r}. Reply 1 = I'll take it, 2 = no. Info: ${l} (STOP = no more messages)`,
    spoedAccepted: (t, w, l) => `Great, you're scheduled: ${t}, ${w}. Details: ${l}`,
    spoedPending: (t) => `Your response to ${t} is noted; the employer confirms once their company is approved.`,
    spoedDeclined: "Thanks for replying, we'll keep looking. See you next time!",
    spoedUnknown: "Reply 1 to take the urgent job or 2 to decline.",
    spoedNone: "There is no open urgent job for you right now. Check the app for jobs.",
    spoedStopped: "OK, you will no longer get SMS or WhatsApp for urgent jobs. You can turn it back on in the app under Account.",
    spoedFailed: (r) => `That didn't work: ${r}`,
    werkrechtOkTitle: "Your document has been approved",
    werkrechtOkBody: (l) => `You may work in ${l} through ZekerFlex. You can now accept shifts.`,
    werkrechtAfTitle: "Your document was rejected",
    werkrechtAfBody: (l, r) => `Working in ${l}: ${r} Upload a new document under Verification.`,
    idOkTitle: "Your ID has been verified",
    idOkBody: "You can respond to jobs as soon as the rest of your sign-up is in order. A clear photo and your work experience help clients choose you.",
    offerTitle: (t) => `New job: ${t}`,
    offerBody: (p, c, r, m) => `${p}, ${c} · ${r} · ~${m} min travel`,
    msBtwTitle: "🧾 VAT return due soon",
    msUrenTitle: "⏱️ 1,225 hours reached!",
    msUrenBody: "You've reached the hours criterion — you qualify for the self-employed deduction. See what that means for you.",
    msSpreidingTitle: "⚖️ Mind your spread across clients",
    msSpreidingBody: (h) => `Your revenue: ${h}. Work for other clients too, so you stay in line with the Wet DBA.`,
    msKorTitle: "📊 Mind your KOR limit",
    badge: {
      SILVER: { title: "🥈 You're now Silver", body: "Clients see your silver badge and you get a small advantage in matching." },
      GOLD: { title: "🥇 You're now Gold", body: "Priority in matching: you show up sooner for new shifts." },
      PLATINUM: { title: "💎 You're now Platinum", body: "The highest badge, with the most priority in matching. Great work!" },
    },
    verifiedTitle: "Company verified — confirm your job",
    verifiedBody: (c, t) => `${c} has been approved. Tap "Accept" on "${t}" to get scheduled.`,
    hoursReminderTitle: "🕒 Fill in your hours",
    hoursReminderBody: (t, b, tm) => `${t} at ${b} (${tm}) — submit your hours so the payout can start.`,
    payoutIncompleteTitle: "Complete your details to get paid",
    payoutIncompleteBody: (r) =>
      `Your hours can't be approved and paid yet: ${r === "iban" ? "there is no valid bank account (IBAN) on your profile yet." : r === "dest" ? "no payout destination is set on your profile yet." : "your bank account was changed recently and isn't verified yet."} Complete your profile 100% (including your bank account/IBAN).`,
    welcomeTitle: (v) => `👋 Welcome to ${v}`,
    welcomeBody: (p) => `Your licence plate ${p} was recognised, the barrier is opening. Don't forget to check in in the app.`,
    testTitle: "🔔 Test notification from ZekerFlex",
    testBody: "Great — your notifications work. This is how you'll be alerted when a shift is about to start.",
    callTitle: (n, v) => (v ? `📹 ${n} is calling you (video)` : `📞 ${n} is calling you`),
    callBody: "Tap to answer in ZekerFlex.",
    missedTitle: (n) => `Missed call from ${n}`,
    missedVideoBody: "📹 Video call — tap to call back.",
    missedBody: "📞 Tap to call back.",
    newMessage: "New message",
  },
  pl: {
    hours: "godz.",
    approvedTitle: "✅ Twoje godziny zostały zatwierdzone",
    approvedPaid: (a) => `${a} jest w drodze na Twoje konto.`,
    approvedSpeed: "Wypłata nastąpi zgodnie z wybraną przez Ciebie szybkością.",
    approvedPayroll: (w) => `Wynagrodzenie otrzymasz z listą płac za ${w}.`,
    approvedAdvance: (a, w) => `Twoja zaliczka ${a} jest w drodze; reszta przyjdzie z listą płac za ${w}.`,
    timeChangedTitle: (t) => `Nowa godzina: ${t}`,
    timeChangedBody: (w) => `Zleceniodawca przesunął Twoją zmianę na ${w}.`,
    cancelledTitle: (t) => `Odwołano: ${t}`,
    cancelledBody: (w) => `Zleceniodawca odwołał Twoją zmianę ${w}. Otwórz zlecenie, aby zobaczyć rekompensatę.`,
    perHour: "/godz.",
    standbyTitle: (t) => `⚡ Pilna zmiana: ${t}`,
    standbyBody: (d) => `${d}. Jesteś w trybie gotowości: kto pierwszy przyjmie, ten dostaje.`,
    replacementTitle: (t) => `Przejmujesz zlecenie: ${t}`,
    replacementBody: (n, w, b) => `${n} wybrał(a) Cię na zastępstwo: ${w} w ${b}. Potwierdź przyjście w aplikacji.`,
    claimApprovedTitle: "Twoje roszczenie za odwołanie zostało zatwierdzone",
    claimApprovedBody: (t, a) => `${t}: otrzymasz ${a} przy najbliższej wypłacie.`,
    claimRejectedTitle: "Twoje roszczenie za odwołanie zostało odrzucone",
    employerClaimTitle: "Zleceniodawca żąda rekompensaty",
    employerClaimBody: (t, a) => `${t}: ${a} za zbyt późne odwołanie lub nieobecność. Fakturę otrzymasz e-mailem.`,
    employerWaivedTitle: "Bez żądania rekompensaty",
    employerWaivedBody: (t) => `Zleceniodawca rezygnuje z rekompensaty za ${t}.`,
    correctionTitle: "Zaproponowano korektę Twoich godzin",
    correctionBody: (t, f, to) => `${t}: ${f} → ${to} godz. Sprawdź i odpowiedz w aplikacji.`,
    noShowTitle: (t) => `Brak zameldowania: ${t}`,
    noShowBody: (t, b) => `Masz status nieobecności na ${t} w ${b}. Byłeś(-aś) na miejscu? Napisz od razu do zleceniodawcy w aplikacji.`,
    selectedTitle: "🎉 Zostałeś(-aś) wybrany(-a)!",
    selectedBody: (t, b, w) => `${t} w ${b}, ${w}. Zobacz zlecenie w aplikacji.`,
    dayTitle: "📅 Jutro pracujesz",
    dayBody: (t, b, tm) => `${t} w ${b} zaczyna się jutro o ${tm}. Przygotuj się: sprawdź trasę i strój roboczy.`,
    soonTitle: "⏰ Twoje zlecenie zaczyna się za 2 godziny",
    soonBody: (t, b, tm) => `${t} w ${b} o ${tm}. Wyjdź na czas!`,
    startTitle: "▶️ Twoje zlecenie zaczyna się teraz",
    startBody: (t, b) => `${t} w ${b}. Nie zapomnij zameldować się w aplikacji.`,
    profileTitle: "Już prawie 👋",
    profileBody: "Uzupełnij swoje dane, aby zacząć — potem od razu możesz reagować na zlecenia.",
    declinedTitle: "Twoja odpowiedź nie została wybrana",
    declinedBody: (t) => `Do „${t}” wybrano kogoś innego. Czeka na Ciebie wiele innych zleceń.`,
    notChosenTitle: "Tym razem nie wybrano",
    notChosenBody: (t) => `Tym razem nie wybrano Cię do „${t}”. Znajdź inne zlecenie: czeka na Ciebie wiele innych.`,
    followTitle: (c) => `❤️ Nowa zmiana w ${c}`,
    followMore: (n) => ` (+${n} ${n === 1 ? "dzień" : "dni"})`,
    geoTitle: (h) => `📍 Zlecenie w pobliżu — zaczyna się za ${h} godz.`,
    geoBody: (t, c, km, tm, a) => `${t} w ${c} (±${km} km), start ${tm} · €${a}/godz. Odpowiedz szybko w aplikacji.`,
    spoedTitle: (t) => `⚡ Pilne wezwanie: ${t}`,
    spoedBody: (c, s, w, r) => `${c} w ${s} potrzebuje Cię teraz: ${w} · ${r}. Otwórz aplikację i przyjmij.`,
    spoedSms: (t, c, s, w, r, l) => `PILNE ZekerFlex: ${c} szuka ${t} w ${s}, ${w}, ${r}. Odpowiedz 1 = biorę, 2 = nie. Info: ${l} (STOP = koniec wiadomości)`,
    spoedAccepted: (t, w, l) => `Super, jesteś zaplanowany: ${t}, ${w}. Szczegóły: ${l}`,
    spoedPending: (t) => `Twoja odpowiedź na ${t} została zapisana; pracodawca potwierdzi po zatwierdzeniu firmy.`,
    spoedDeclined: "Dziękujemy za odpowiedź, szukamy dalej. Do następnego razu!",
    spoedUnknown: "Odpowiedz 1, aby przyjąć pilne zlecenie, lub 2, aby odmówić.",
    spoedNone: "Nie ma teraz otwartego pilnego zlecenia dla Ciebie. Sprawdź zlecenia w aplikacji.",
    spoedStopped: "OK, nie będziesz już dostawać SMS-ów ani WhatsAppa o pilnych zleceniach. Włączysz to ponownie w aplikacji w Koncie.",
    spoedFailed: (r) => `Nie udało się: ${r}`,
    werkrechtOkTitle: "Twój dokument został zatwierdzony",
    werkrechtOkBody: (l) => `Możesz pracować przez ZekerFlex w kraju: ${l}. Możesz już przyjmować zlecenia.`,
    werkrechtAfTitle: "Twój dokument został odrzucony",
    werkrechtAfBody: (l, r) => `Praca w kraju ${l}: ${r} Prześlij nowy dokument w sekcji Weryfikacja.`,
    idOkTitle: "Twój dokument został zweryfikowany",
    idOkBody: "Możesz odpowiadać na zlecenia, gdy reszta Twojej rejestracji będzie w porządku. Wyraźne zdjęcie i doświadczenie zawodowe pomagają zleceniodawcom Cię wybrać.",
    offerTitle: (t) => `Nowe zlecenie: ${t}`,
    offerBody: (p, c, r, m) => `${p}, ${c} · ${r} · ok. ${m} min dojazdu`,
    msBtwTitle: "🧾 Zbliża się deklaracja VAT",
    msUrenTitle: "⏱️ Osiągnięto 1225 godzin!",
    msUrenBody: "Kryterium godzin zostało spełnione — kwalifikujesz się do ulgi dla samozatrudnionych. Zobacz, co to dla Ciebie oznacza.",
    msSpreidingTitle: "⚖️ Uwaga na rozłożenie zleceniodawców",
    msSpreidingBody: (h) => `Twój obrót: ${h}. Pracuj też dla innych zleceniodawców, aby zachować zgodność z Wet DBA.`,
    msKorTitle: "📊 Uwaga na limit KOR",
    badge: {
      SILVER: { title: "🥈 Masz teraz Srebro", body: "Zleceniodawcy widzą Twoją srebrną odznakę, a Ty zyskujesz małą przewagę w dopasowaniu." },
      GOLD: { title: "🥇 Masz teraz Złoto", body: "Pierwszeństwo w dopasowaniu: szybciej pojawiasz się przy nowych zleceniach." },
      PLATINUM: { title: "💎 Masz teraz Platynę", body: "Najwyższa odznaka z największym pierwszeństwem w dopasowaniu. Świetna robota!" },
    },
    verifiedTitle: "Firma zweryfikowana — potwierdź zlecenie",
    verifiedBody: (c, t) => `${c} została zatwierdzona. Stuknij „Przyjmij” przy „${t}”, aby trafić do grafiku.`,
    hoursReminderTitle: "🕒 Uzupełnij godziny",
    hoursReminderBody: (t, b, tm) => `${t} w ${b} (${tm}) — wyślij godziny, aby wypłata mogła ruszyć.`,
    payoutIncompleteTitle: "Uzupełnij dane, aby dostać wypłatę",
    payoutIncompleteBody: (r) =>
      `Twoje godziny nie mogą jeszcze zostać zatwierdzone i wypłacone: ${r === "iban" ? "w Twoim profilu nie ma jeszcze prawidłowego numeru konta (IBAN)." : r === "dest" ? "w Twoim profilu nie ustawiono jeszcze miejsca wypłaty." : "Twój numer konta został niedawno zmieniony i nie jest jeszcze zweryfikowany."} Uzupełnij profil w 100% (m.in. konto bankowe/IBAN).`,
    welcomeTitle: (v) => `👋 Witamy w ${v}`,
    welcomeBody: (p) => `Twoja tablica ${p} została rozpoznana, szlaban się otwiera. Pamiętaj, aby zameldować się w aplikacji.`,
    testTitle: "🔔 Powiadomienie testowe od ZekerFlex",
    testBody: "Świetnie — powiadomienia działają. Tak dostaniesz sygnał, gdy zlecenie się zaczyna.",
    callTitle: (n, v) => (v ? `📹 ${n} dzwoni do Ciebie (wideo)` : `📞 ${n} dzwoni do Ciebie`),
    callBody: "Stuknij, aby odebrać w ZekerFlex.",
    missedTitle: (n) => `Nieodebrane połączenie od ${n}`,
    missedVideoBody: "📹 Rozmowa wideo — stuknij, aby oddzwonić.",
    missedBody: "📞 Stuknij, aby oddzwonić.",
    newMessage: "Nowa wiadomość",
  },
  ro: {
    hours: "ore",
    approvedTitle: "✅ Orele tale au fost aprobate",
    approvedPaid: (a) => `${a} este pe drum spre contul tău.`,
    approvedSpeed: "Plata urmează viteza pe care ai ales-o.",
    approvedPayroll: (w) => `Salariul vine cu statul de plată din ${w}.`,
    approvedAdvance: (a, w) => `Avansul tău de ${a} este pe drum; restul vine cu statul de plată din ${w}.`,
    timeChangedTitle: (t) => `Oră nouă: ${t}`,
    timeChangedBody: (w) => `Clientul ți-a mutat tura la ${w}.`,
    cancelledTitle: (t) => `Anulat: ${t}`,
    cancelledBody: (w) => `Clientul ți-a anulat tura din ${w}. Deschide jobul pentru compensație.`,
    perHour: "/oră",
    standbyTitle: (t) => `⚡ Tură urgentă: ${t}`,
    standbyBody: (d) => `${d}. Ești în standby: primul care acceptă o primește.`,
    replacementTitle: (t) => `Preiei jobul: ${t}`,
    replacementBody: (n, w, b) => `${n} te-a ales ca înlocuitor: ${w} la ${b}. Confirmă prezența în aplicație.`,
    claimApprovedTitle: "Cererea ta de compensație a fost aprobată",
    claimApprovedBody: (t, a) => `${t}: primești ${a} la următoarea plată.`,
    claimRejectedTitle: "Cererea ta de compensație a fost respinsă",
    employerClaimTitle: "Clientul cere o compensație",
    employerClaimBody: (t, a) => `${t}: ${a} pentru anulare târzie sau neprezentare. Vei primi o factură pe e-mail.`,
    employerWaivedTitle: "Nicio compensație cerută",
    employerWaivedBody: (t) => `Clientul renunță la compensație pentru ${t}.`,
    correctionTitle: "Corectură propusă pentru orele tale",
    correctionBody: (t, f, to) => `${t}: ${f} → ${to} ore. Verifică și răspunde în aplicație.`,
    noShowTitle: (t) => `Fără check-in: ${t}`,
    noShowBody: (t, b) => `Ești marcat ca absent la ${t} la ${b}. Ai fost acolo? Scrie-i imediat clientului în aplicație.`,
    selectedTitle: "🎉 Ai fost ales!",
    selectedBody: (t, b, w) => `${t} la ${b}, ${w}. Vezi jobul în aplicație.`,
    dayTitle: "📅 Lucrezi mâine",
    dayBody: (t, b, tm) => `${t} la ${b} începe mâine la ${tm}. Pregătește-te: verifică traseul și hainele de lucru.`,
    soonTitle: "⏰ Jobul tău începe în 2 ore",
    soonBody: (t, b, tm) => `${t} la ${b} la ${tm}. Pleacă la timp!`,
    startTitle: "▶️ Jobul tău începe acum",
    startBody: (t, b) => `${t} la ${b}. Nu uita să faci check-in în aplicație.`,
    profileTitle: "Aproape gata 👋",
    profileBody: "Completează-ți datele ca să începi — apoi poți răspunde imediat la joburi.",
    declinedTitle: "Răspunsul tău nu a fost ales",
    declinedBody: (t) => `Pentru „${t}” a fost ales altcineva. Te așteaptă multe alte joburi.`,
    notChosenTitle: "Nu ai fost ales(ă) de data aceasta",
    notChosenBody: (t) => `De data aceasta nu ai fost ales(ă) pentru „${t}”. Caută alt job: te așteaptă multe altele.`,
    followTitle: (c) => `❤️ Tură nouă la ${c}`,
    followMore: (n) => ` (+${n} ${n === 1 ? "zi" : "zile"})`,
    geoTitle: (h) => `📍 Job în apropiere — începe în ${h} ${h === 1 ? "oră" : "ore"}`,
    geoBody: (t, c, km, tm, a) => `${t} în ${c} (±${km} km), start ${tm} · €${a}/oră. Răspunde rapid în aplicație.`,
    spoedTitle: (t) => `⚡ Apel urgent: ${t}`,
    spoedBody: (c, s, w, r) => `${c} din ${s} are nevoie de tine acum: ${w} · ${r}. Deschide aplicația și acceptă.`,
    spoedSms: (t, c, s, w, r, l) => `URGENT ZekerFlex: ${c} caută ${t} în ${s}, ${w}, ${r}. Răspunde 1 = accept, 2 = nu. Info: ${l} (STOP = fără mesaje)`,
    spoedAccepted: (t, w, l) => `Super, ești programat: ${t}, ${w}. Detalii: ${l}`,
    spoedPending: (t) => `Răspunsul tău la ${t} este notat; angajatorul confirmă după aprobarea firmei.`,
    spoedDeclined: "Mulțumim pentru răspuns, căutăm mai departe. Pe data viitoare!",
    spoedUnknown: "Răspunde 1 pentru a accepta jobul urgent sau 2 pentru a refuza.",
    spoedNone: "Nu există acum niciun job urgent deschis pentru tine. Vezi joburile în aplicație.",
    spoedStopped: "OK, nu vei mai primi SMS sau WhatsApp pentru joburi urgente. Poți reactiva în aplicație, la Cont.",
    spoedFailed: (r) => `Nu a mers: ${r}`,
    werkrechtOkTitle: "Documentul tău a fost aprobat",
    werkrechtOkBody: (l) => `Poți lucra prin ZekerFlex în ${l}. Acum poți accepta ture.`,
    werkrechtAfTitle: "Documentul tău a fost respins",
    werkrechtAfBody: (l, r) => `Munca în ${l}: ${r} Încarcă un document nou la Verificare.`,
    idOkTitle: "Actul tău de identitate a fost verificat",
    idOkBody: "Poți răspunde la lucrări imediat ce restul înregistrării tale este în regulă. O fotografie clară și experiența ta de muncă îi ajută pe clienți să te aleagă.",
    offerTitle: (t) => `Job nou: ${t}`,
    offerBody: (p, c, r, m) => `${p}, ${c} · ${r} · ~${m} min de drum`,
    msBtwTitle: "🧾 Declarația de TVA se apropie",
    msUrenTitle: "⏱️ Ai atins 1.225 de ore!",
    msUrenBody: "Ai atins criteriul orelor — te califici pentru deducerea pentru persoane independente. Vezi ce înseamnă asta pentru tine.",
    msSpreidingTitle: "⚖️ Atenție la distribuția între clienți",
    msSpreidingBody: (h) => `Veniturile tale: ${h}. Lucrează și pentru alți clienți, ca să rămâi în linie cu Wet DBA.`,
    msKorTitle: "📊 Atenție la limita KOR",
    badge: {
      SILVER: { title: "🥈 Acum ești Argint", body: "Clienții îți văd insigna de argint și primești un mic avantaj în potrivire." },
      GOLD: { title: "🥇 Acum ești Aur", body: "Prioritate în potrivire: apari mai devreme la turele noi." },
      PLATINUM: { title: "💎 Acum ești Platină", body: "Cea mai înaltă insignă, cu cea mai mare prioritate în potrivire. Muncă excelentă!" },
    },
    verifiedTitle: "Companie verificată — confirmă jobul",
    verifiedBody: (c, t) => `${c} a fost aprobată. Atinge „Acceptă” la „${t}” ca să fii programat.`,
    hoursReminderTitle: "🕒 Completează-ți orele",
    hoursReminderBody: (t, b, tm) => `${t} la ${b} (${tm}) — trimite-ți orele ca plata să poată începe.`,
    payoutIncompleteTitle: "Completează-ți datele ca să fii plătit",
    payoutIncompleteBody: (r) =>
      `Orele tale nu pot fi încă aprobate și plătite: ${r === "iban" ? "nu există încă un cont bancar (IBAN) valid în profilul tău." : r === "dest" ? "nu este setată încă o destinație de plată în profilul tău." : "contul tău bancar a fost modificat recent și nu este încă verificat."} Completează-ți profilul 100% (inclusiv contul bancar/IBAN).`,
    welcomeTitle: (v) => `👋 Bun venit la ${v}`,
    welcomeBody: (p) => `Numărul tău de înmatriculare ${p} a fost recunoscut, bariera se deschide. Nu uita să faci check-in în aplicație.`,
    testTitle: "🔔 Notificare de test de la ZekerFlex",
    testBody: "Super — notificările tale funcționează. Așa vei fi anunțat când începe o tură.",
    callTitle: (n, v) => (v ? `📹 ${n} te sună (video)` : `📞 ${n} te sună`),
    callBody: "Atinge pentru a răspunde în ZekerFlex.",
    missedTitle: (n) => `Apel pierdut de la ${n}`,
    missedVideoBody: "📹 Apel video — atinge pentru a suna înapoi.",
    missedBody: "📞 Atinge pentru a suna înapoi.",
    newMessage: "Mesaj nou",
  },
  uk: {
    hours: "год",
    approvedTitle: "✅ Ваші години затверджено",
    approvedPaid: (a) => `${a} вже йде на ваш рахунок.`,
    approvedSpeed: "Виплата надійде з обраною вами швидкістю.",
    approvedPayroll: (w) => `Зарплата надійде з розрахунком за ${w}.`,
    approvedAdvance: (a, w) => `Ваш аванс ${a} вже в дорозі; решта надійде з розрахунком за ${w}.`,
    timeChangedTitle: (t) => `Новий час: ${t}`,
    timeChangedBody: (w) => `Замовник переніс вашу зміну на ${w}.`,
    cancelledTitle: (t) => `Скасовано: ${t}`,
    cancelledBody: (w) => `Замовник скасував вашу зміну ${w}. Відкрийте роботу, щоб побачити компенсацію.`,
    perHour: "/год",
    standbyTitle: (t) => `⚡ Термінова зміна: ${t}`,
    standbyBody: (d) => `${d}. Ви в режимі очікування: хто перший прийме, той отримає.`,
    replacementTitle: (t) => `Ви берете роботу: ${t}`,
    replacementBody: (n, w, b) => `${n} обрав(ла) вас на заміну: ${w} у ${b}. Підтвердьте прихід у застосунку.`,
    claimApprovedTitle: "Вашу вимогу за скасування затверджено",
    claimApprovedBody: (t, a) => `${t}: ви отримаєте ${a} з наступною виплатою.`,
    claimRejectedTitle: "Вашу вимогу за скасування відхилено",
    employerClaimTitle: "Замовник вимагає компенсацію",
    employerClaimBody: (t, a) => `${t}: ${a} за пізнє скасування або неявку. Рахунок надійде електронною поштою.`,
    employerWaivedTitle: "Компенсацію не вимагають",
    employerWaivedBody: (t) => `Замовник відмовляється від компенсації за ${t}.`,
    correctionTitle: "Запропоновано виправлення ваших годин",
    correctionBody: (t, f, to) => `${t}: ${f} → ${to} год. Перегляньте та дайте відповідь у застосунку.`,
    noShowTitle: (t) => `Без відмітки: ${t}`,
    noShowBody: (t, b) => `Вас позначено як відсутнього на ${t} у ${b}. Ви були там? Одразу напишіть замовнику в застосунку.`,
    selectedTitle: "🎉 Вас обрано!",
    selectedBody: (t, b, w) => `${t} у ${b}, ${w}. Перегляньте роботу в застосунку.`,
    dayTitle: "📅 Завтра на роботу",
    dayBody: (t, b, tm) => `${t} у ${b} починається завтра о ${tm}. Підготуйтеся: перевірте маршрут і робочий одяг.`,
    soonTitle: "⏰ Ваша робота починається через 2 години",
    soonBody: (t, b, tm) => `${t} у ${b} о ${tm}. Вирушайте вчасно!`,
    startTitle: "▶️ Ваша робота починається зараз",
    startBody: (t, b) => `${t} у ${b}. Не забудьте відмітитися в застосунку.`,
    profileTitle: "Майже готово 👋",
    profileBody: "Заповніть свої дані, щоб почати — потім одразу зможете відгукуватися на роботи.",
    declinedTitle: "Вашу відповідь не обрано",
    declinedBody: (t) => `На «${t}» обрали іншу людину. На вас чекає багато інших робіт.`,
    notChosenTitle: "Цього разу вас не обрано",
    notChosenBody: (t) => `Цього разу вас не обрали на «${t}». Знайдіть іншу роботу: на вас чекає багато інших.`,
    followTitle: (c) => `❤️ Нова зміна в ${c}`,
    followMore: (n) => ` (+${n} дн.)`,
    geoTitle: (h) => `📍 Робота поруч — починається через ${h} год`,
    geoBody: (t, c, km, tm, a) => `${t} у ${c} (±${km} км), початок ${tm} · €${a}/год. Відповідайте швидко в застосунку.`,
    spoedTitle: (t) => `⚡ Терміновий виклик: ${t}`,
    spoedBody: (c, s, w, r) => `${c} у ${s} потребує вас зараз: ${w} · ${r}. Відкрийте застосунок і прийміть.`,
    spoedSms: (t, c, s, w, r, l) => `ТЕРМІНОВО ZekerFlex: ${c} шукає ${t} у ${s}, ${w}, ${r}. Відповідь 1 = беру, 2 = ні. Інфо: ${l} (STOP = більше без повідомлень)`,
    spoedAccepted: (t, w, l) => `Чудово, вас заплановано: ${t}, ${w}. Деталі: ${l}`,
    spoedPending: (t) => `Вашу відповідь на ${t} записано; роботодавець підтвердить після схвалення компанії.`,
    spoedDeclined: "Дякуємо за відповідь, шукаємо далі. До наступного разу!",
    spoedUnknown: "Відповідьте 1, щоб узяти термінову роботу, або 2, щоб відмовитися.",
    spoedNone: "Зараз для вас немає відкритої термінової роботи. Перегляньте роботи в застосунку.",
    spoedStopped: "Гаразд, ви більше не отримуватимете SMS чи WhatsApp про термінові роботи. Увімкнути знову можна в застосунку в Обліковому записі.",
    spoedFailed: (r) => `Не вдалося: ${r}`,
    werkrechtOkTitle: "Ваш документ схвалено",
    werkrechtOkBody: (l) => `Ви можете працювати через ZekerFlex у країні: ${l}. Тепер ви можете приймати зміни.`,
    werkrechtAfTitle: "Ваш документ відхилено",
    werkrechtAfBody: (l, r) => `Робота в країні ${l}: ${r} Завантажте новий документ у розділі «Перевірка».`,
    idOkTitle: "Ваш документ перевірено",
    idOkBody: "Ви зможете відгукуватися на роботу, щойно решта вашої реєстрації буде в порядку. Чітке фото та досвід роботи допомагають замовникам вибрати вас.",
    offerTitle: (t) => `Нова робота: ${t}`,
    offerBody: (p, c, r, m) => `${p}, ${c} · ${r} · ~${m} хв у дорозі`,
    msBtwTitle: "🧾 Скоро декларація з ПДВ",
    msUrenTitle: "⏱️ Досягнуто 1225 годин!",
    msUrenBody: "Критерій годин виконано — ти маєш право на відрахування для самозайнятих. Подивись, що це означає для тебе.",
    msSpreidingTitle: "⚖️ Зверни увагу на розподіл між замовниками",
    msSpreidingBody: (h) => `Твоя виручка: ${h}. Працюй і на інших замовників, щоб залишатися в межах Wet DBA.`,
    msKorTitle: "📊 Зверни увагу на межу KOR",
    badge: {
      SILVER: { title: "🥈 Тепер у тебе Срібло", body: "Замовники бачать твій срібний бейдж, а ти отримуєш невелику перевагу в підборі." },
      GOLD: { title: "🥇 Тепер у тебе Золото", body: "Пріоритет у підборі: ти раніше з’являєшся біля нових змін." },
      PLATINUM: { title: "💎 Тепер у тебе Платина", body: "Найвищий бейдж з найбільшим пріоритетом у підборі. Чудова робота!" },
    },
    verifiedTitle: "Компанію верифіковано — підтверди роботу",
    verifiedBody: (c, t) => `${c} схвалено. Натисни «Прийняти» біля «${t}», щоб потрапити в графік.`,
    hoursReminderTitle: "🕒 Заповни свої години",
    hoursReminderBody: (t, b, tm) => `${t} у ${b} (${tm}) — подай години, щоб виплата могла стартувати.`,
    payoutIncompleteTitle: "Доповни дані, щоб отримати виплату",
    payoutIncompleteBody: (r) =>
      `Твої години ще не можна схвалити й виплатити: ${r === "iban" ? "у твоєму профілі ще немає чинного номера рахунку (IBAN)." : r === "dest" ? "у твоєму профілі ще не вказано місце виплати." : "номер твого рахунку нещодавно змінено й ще не верифіковано."} Заповни профіль на 100% (зокрема банківський рахунок/IBAN).`,
    welcomeTitle: (v) => `👋 Ласкаво просимо до ${v}`,
    welcomeBody: (p) => `Твій номерний знак ${p} розпізнано, шлагбаум відкривається. Не забудь зареєструвати прихід у застосунку.`,
    testTitle: "🔔 Тестове сповіщення від ZekerFlex",
    testBody: "Чудово — твої сповіщення працюють. Так ти отримаєш сигнал, коли зміна починається.",
    callTitle: (n, v) => (v ? `📹 ${n} телефонує тобі (відео)` : `📞 ${n} телефонує тобі`),
    callBody: "Натисни, щоб відповісти в ZekerFlex.",
    missedTitle: (n) => `Пропущений дзвінок від ${n}`,
    missedVideoBody: "📹 Відеодзвінок — натисни, щоб передзвонити.",
    missedBody: "📞 Натисни, щоб передзвонити.",
    newMessage: "Нове повідомлення",
  },
};

/** "do 5/11 19:00" in the worker's language, Dutch time (short, for offers). */
export function pushDay(locale: Locale, d: Date): string {
  const p = amsterdamParts(d);
  return `${FREELANCER_DICTS[basisLocale(locale)].date.wd[p.weekday] ?? ""} ${p.day}/${p.month} ${amsterdamClock(d)}`;
}

/** "5 nov 09:00" in the worker's language, Dutch time. */
export function pushDayMonth(locale: Locale, d: Date): string {
  const p = amsterdamParts(d);
  return `${p.day} ${FREELANCER_DICTS[basisLocale(locale)].date.mon[p.month - 1] ?? ""} ${amsterdamClock(d)}`;
}

/** "€ 19,00/u" with the worker's own per-hour unit. */
export function pushRate(t: WorkerPushTexts, cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace(".", ",")}${t.perHour}`;
}

/** "do 5 nov 09:00–17:00" in the worker's language, Dutch time. */
export function pushWhen(locale: Locale, w: { startsAt: Date; endsAt: Date }): string {
  const d = FREELANCER_DICTS[basisLocale(locale)].date;
  const p = amsterdamParts(w.startsAt);
  return `${d.wd[p.weekday] ?? ""} ${p.day} ${d.mon[p.month - 1] ?? ""} ${amsterdamClock(w.startsAt)}–${amsterdamClock(w.endsAt)}`;
}
