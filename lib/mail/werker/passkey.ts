import type { MailTaal } from "@/lib/mail/vorm";
import { vulIn } from "@/lib/i18n/vul-in";
import { amsterdamClock, amsterdamParts } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// De mails rond passkeys (code om een passkey toe te voegen + meldingen bij een wijziging), in de app-taal van de werker.
// Puur bestand (geen prisma, kv of mail); de aanroeper is lib/auth/passkey/mail.ts. Opdrachtgevers krijgen altijd "nl".
// Machine-assisted translations: native-speaker review recommended.
// ---------------------------------------------------------------------------

const MAANDEN: Record<MailTaal, readonly string[]> = {
  nl: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  pl: ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"],
  ro: ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"],
  uk: ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"],
};

const TIJDSTIP: Record<MailTaal, string> = {
  nl: "{dag} {maand} {jaar} om {tijd}",
  en: "{maand} {dag}, {jaar} at {tijd}",
  pl: "{dag} {maand} {jaar} o {tijd}",
  ro: "{dag} {maand} {jaar} la {tijd}",
  uk: "{dag} {maand} {jaar} о {tijd}",
};

/** "9 november 2026 om 15:04" in Nederlandse tijd (de server draait in UTC), in de taal van de mail. */
export function mailTijdstip(d: Date, taal: MailTaal): string {
  const p = amsterdamParts(d);
  return vulIn(TIJDSTIP[taal], { dag: p.day, maand: MAANDEN[taal][p.month - 1] ?? "", jaar: p.year, tijd: amsterdamClock(d) });
}

interface CodeTekst {
  onderwerp: string;
  tekst: string;
}

const CODE: Record<MailTaal, CodeTekst> = {
  nl: {
    onderwerp: "Je bevestigingscode voor een nieuwe passkey",
    tekst:
      "Hoi {naam},\n\nJe wilt een passkey toevoegen aan je ZekerFlex-account (inloggen met je vingerafdruk, gezicht of pincode). Vul deze code in om dat te bevestigen; hij is 15 minuten geldig:\n\n{code}\n\nHeb jij dit niet gedaan? Negeer deze mail: zonder de code komt er geen passkey bij. Wijzig voor de zekerheid je wachtwoord.",
  },
  en: {
    onderwerp: "Your confirmation code for a new passkey",
    tekst:
      "Hi {naam},\n\nYou want to add a passkey to your ZekerFlex account (signing in with your fingerprint, face or PIN). Enter this code to confirm it; it is valid for 15 minutes:\n\n{code}\n\nWasn't you? Ignore this email: without the code, no passkey will be added. To be safe, change your password.",
  },
  pl: {
    onderwerp: "Twój kod potwierdzający dla nowego passkey",
    tekst:
      "Cześć {naam},\n\nChcesz dodać passkey do swojego konta ZekerFlex (logowanie odciskiem palca, twarzą lub kodem PIN). Wpisz ten kod, aby to potwierdzić; jest ważny przez 15 minut:\n\n{code}\n\nTo nie Ty? Zignoruj tę wiadomość: bez kodu żaden passkey nie zostanie dodany. Dla pewności zmień swoje hasło.",
  },
  ro: {
    onderwerp: "Codul tău de confirmare pentru un passkey nou",
    tekst:
      "Salut {naam},\n\nVrei să adaugi un passkey la contul tău ZekerFlex (autentificare cu amprenta, fața sau PIN-ul). Introdu acest cod pentru a confirma; este valabil 15 minute:\n\n{code}\n\nNu ai fost tu? Ignoră acest e-mail: fără cod nu se adaugă niciun passkey. Pentru siguranță, schimbă-ți parola.",
  },
  uk: {
    onderwerp: "Твій код підтвердження для нового passkey",
    tekst:
      "Привіт, {naam}!\n\nТи хочеш додати passkey до свого облікового запису ZekerFlex (вхід за відбитком пальця, обличчям або PIN-кодом). Введи цей код, щоб підтвердити; він дійсний 15 хвилин:\n\n{code}\n\nЦе був не ти? Ігноруй цей лист: без коду passkey не буде додано. Для безпеки зміни свій пароль.",
  },
};

/** De mail met de code om een passkey toe te voegen. */
export function passkeyCodeMailT(voornaam: string, code: string, taal: MailTaal): { subject: string; text: string } {
  const t = CODE[taal];
  return { subject: t.onderwerp, text: vulIn(t.tekst, { naam: voornaam, code }) };
}

export type PasskeyMeldingSoort = "toegevoegd" | "verwijderd" | "herstel" | "tweestaps";

interface MeldingTeksten {
  hoi: string;
  wasJijDitNiet: string;
  herstel: CodeTekst;
  tweestaps: CodeTekst;
  toegevoegd: CodeTekst;
  verwijderd: CodeTekst;
}

const MELDING: Record<MailTaal, MeldingTeksten> = {
  nl: {
    hoi: "Hoi {naam},\n\n",
    wasJijDitNiet: "\n\nWas jij dit niet? Verwijder de passkey in je account en wijzig je wachtwoord:\n{link}",
    herstel: {
      onderwerp: "Je passkeys zijn verwijderd na het herstellen van je wachtwoord",
      tekst:
        "Je wachtwoord is opnieuw ingesteld op {wanneer}. Voor je veiligheid hebben we daarom al je passkeys verwijderd ({toestel}). Je kunt ze opnieuw toevoegen in je account:\n{link}\n\nWas jij dit niet? Vraag dan meteen een nieuw wachtwoord aan:\n{herstelLink}",
    },
    tweestaps: {
      onderwerp: "Tweestapsverificatie staat aan, je passkeys blijven werken",
      tekst:
        "Tweestapsverificatie is aangezet op {wanneer}. Je passkeys blijven werken ({toestel}): een passkey vraagt altijd je vingerafdruk, gezicht of pincode en telt daarom zelf als tweestapsverificatie.",
    },
    toegevoegd: {
      onderwerp: "Er is een passkey toegevoegd aan je account",
      tekst:
        "Er is een passkey toegevoegd aan je ZekerFlex-account: {toestel}, op {wanneer}. Met dit toestel kun je nu inloggen met je vingerafdruk, gezicht of pincode.",
    },
    verwijderd: {
      onderwerp: "Er is een passkey verwijderd uit je account",
      tekst: "Er is een passkey verwijderd uit je ZekerFlex-account: {toestel}, op {wanneer}. Met dit toestel log je weer in met je wachtwoord.",
    },
  },
  en: {
    hoi: "Hi {naam},\n\n",
    wasJijDitNiet: "\n\nWasn't you? Remove the passkey in your account and change your password:\n{link}",
    herstel: {
      onderwerp: "Your passkeys were removed after your password was reset",
      tekst:
        "Your password was reset on {wanneer}. For your safety, we therefore removed all your passkeys ({toestel}). You can add them again in your account:\n{link}\n\nWasn't you? Then request a new password right away:\n{herstelLink}",
    },
    tweestaps: {
      onderwerp: "Two-step verification is on, your passkeys keep working",
      tekst:
        "Two-step verification was turned on on {wanneer}. Your passkeys keep working ({toestel}): a passkey always asks for your fingerprint, face or PIN, so it counts as two-step verification by itself.",
    },
    toegevoegd: {
      onderwerp: "A passkey was added to your account",
      tekst:
        "A passkey was added to your ZekerFlex account: {toestel}, on {wanneer}. With this device you can now sign in with your fingerprint, face or PIN.",
    },
    verwijderd: {
      onderwerp: "A passkey was removed from your account",
      tekst: "A passkey was removed from your ZekerFlex account: {toestel}, on {wanneer}. With this device you sign in with your password again.",
    },
  },
  pl: {
    hoi: "Cześć {naam},\n\n",
    wasJijDitNiet: "\n\nTo nie Ty? Usuń passkey w swoim koncie i zmień hasło:\n{link}",
    herstel: {
      onderwerp: "Twoje passkeys zostały usunięte po zresetowaniu hasła",
      tekst:
        "Twoje hasło zostało zresetowane {wanneer}. Dla Twojego bezpieczeństwa usunęliśmy dlatego wszystkie Twoje passkeys ({toestel}). Możesz je dodać ponownie w swoim koncie:\n{link}\n\nTo nie Ty? Natychmiast poproś o nowe hasło:\n{herstelLink}",
    },
    tweestaps: {
      onderwerp: "Weryfikacja dwuetapowa jest włączona, Twoje passkeys nadal działają",
      tekst:
        "Weryfikacja dwuetapowa została włączona {wanneer}. Twoje passkeys nadal działają ({toestel}): passkey zawsze wymaga odcisku palca, twarzy lub kodu PIN, więc sam w sobie jest weryfikacją dwuetapową.",
    },
    toegevoegd: {
      onderwerp: "Do Twojego konta dodano passkey",
      tekst:
        "Do Twojego konta ZekerFlex dodano passkey: {toestel}, {wanneer}. Na tym urządzeniu możesz teraz logować się odciskiem palca, twarzą lub kodem PIN.",
    },
    verwijderd: {
      onderwerp: "Z Twojego konta usunięto passkey",
      tekst: "Z Twojego konta ZekerFlex usunięto passkey: {toestel}, {wanneer}. Na tym urządzeniu logujesz się znowu hasłem.",
    },
  },
  ro: {
    hoi: "Salut {naam},\n\n",
    wasJijDitNiet: "\n\nNu ai fost tu? Șterge passkey-ul din contul tău și schimbă-ți parola:\n{link}",
    herstel: {
      onderwerp: "Passkey-urile tale au fost șterse după resetarea parolei",
      tekst:
        "Parola ta a fost resetată {wanneer}. Pentru siguranța ta, am șters de aceea toate passkey-urile tale ({toestel}). Le poți adăuga din nou în contul tău:\n{link}\n\nNu ai fost tu? Cere imediat o parolă nouă:\n{herstelLink}",
    },
    tweestaps: {
      onderwerp: "Verificarea în doi pași este activă, passkey-urile tale continuă să funcționeze",
      tekst:
        "Verificarea în doi pași a fost activată {wanneer}. Passkey-urile tale continuă să funcționeze ({toestel}): un passkey cere întotdeauna amprenta, fața sau PIN-ul și contează deci ca verificare în doi pași.",
    },
    toegevoegd: {
      onderwerp: "A fost adăugat un passkey în contul tău",
      tekst:
        "A fost adăugat un passkey în contul tău ZekerFlex: {toestel}, {wanneer}. Cu acest dispozitiv te poți autentifica acum cu amprenta, fața sau PIN-ul.",
    },
    verwijderd: {
      onderwerp: "A fost șters un passkey din contul tău",
      tekst: "A fost șters un passkey din contul tău ZekerFlex: {toestel}, {wanneer}. Cu acest dispozitiv te autentifici din nou cu parola.",
    },
  },
  uk: {
    hoi: "Привіт, {naam}!\n\n",
    wasJijDitNiet: "\n\nЦе був не ти? Видали passkey у своєму обліковому записі та зміни пароль:\n{link}",
    herstel: {
      onderwerp: "Твої passkey видалено після відновлення пароля",
      tekst:
        "Твій пароль скинуто {wanneer}. Для твоєї безпеки ми тому видалили всі твої passkey ({toestel}). Ти можеш додати їх знову у своєму обліковому записі:\n{link}\n\nЦе був не ти? Одразу запроси новий пароль:\n{herstelLink}",
    },
    tweestaps: {
      onderwerp: "Двоетапну перевірку ввімкнено, твої passkey працюють далі",
      tekst:
        "Двоетапну перевірку ввімкнено {wanneer}. Твої passkey працюють далі ({toestel}): passkey завжди вимагає відбиток пальця, обличчя або PIN-код, тож сам вважається двоетапною перевіркою.",
    },
    toegevoegd: {
      onderwerp: "До твого облікового запису додано passkey",
      tekst:
        "До твого облікового запису ZekerFlex додано passkey: {toestel}, {wanneer}. Тепер на цьому пристрої ти можеш входити за відбитком пальця, обличчям або PIN-кодом.",
    },
    verwijderd: {
      onderwerp: "З твого облікового запису видалено passkey",
      tekst: "З твого облікового запису ZekerFlex видалено passkey: {toestel}, {wanneer}. На цьому пристрої ти знову входиш за допомогою пароля.",
    },
  },
};

export interface PasskeyMeldingInvulling {
  wat: PasskeyMeldingSoort;
  voornaam: string;
  toestel: string;
  /** al in de taal van de mail (mailTijdstip) */
  wanneer: string;
  /** de plek waar de passkeys beheerd worden */
  link: string;
  /** de basis-URL zonder slot-slash */
  basis: string;
}

/** Onderwerp en tekst van de melding bij een wijziging van passkeys (puur, voor de test). */
export function passkeyMeldingMailT(i: PasskeyMeldingInvulling, taal: MailTaal): { subject: string; text: string } {
  const t = MELDING[taal];
  const waarden = { naam: i.voornaam, toestel: i.toestel, wanneer: i.wanneer, link: i.link, herstelLink: `${i.basis}/wachtwoord-vergeten` };
  const hoi = vulIn(t.hoi, waarden);
  const deel = t[i.wat];
  const kern = vulIn(deel.tekst, waarden);
  // herstel heeft zijn eigen slot; de andere drie krijgen de gewone "was jij dit niet"-regel erachter
  const slot = i.wat === "herstel" ? "" : vulIn(t.wasJijDitNiet, waarden);
  return { subject: deel.onderwerp, text: `${hoi}${kern}${slot}` };
}
