// ---------------------------------------------------------------------------
// Een tabblad dat open blijft staan terwijl de sessie verloopt, bleef eeuwig
// doorvragen. Gemeten op 28 nov 2026 in het Caddy-log: op 23 en 24 november
// 17.494 en 15.016 keer een 401 op /api/werkgever/recent-responses, /api/inbox
// en /api/me/notifications, vanuit 24 adressen. Dat kostte niet alleen 32.000
// zinloze verzoeken: de werkgever in dat tabblad zag géén nieuwe reacties op
// zijn klus en kreeg nergens te zien waarom. Hij denkt dan dat er niemand
// gereageerd heeft.
//
// De oplossing is niet een nieuwe melding verzinnen (de werker-app is
// vijftalig, dus elke nieuwe zin kost vijf vertalingen), maar het tabblad één
// keer herladen: de middleware stuurt een niet-ingelogde bezoeker naar de
// inlogpagina, en die legt het al in zijn eigen taal uit.
//
// Puur (geen imports), met de omgeving als parameter zodat het te testen is —
// zelfde opzet als lib/ops/stale-deployment.ts.
// ---------------------------------------------------------------------------

/** Zegt dit antwoord "je bent niet (meer) ingelogd"? */
export function isNietIngelogd(status: number): boolean {
  return status === 401;
}

/**
 * Zegt dit antwoord "je bent ingelogd, maar dit mag je niet"?
 *
 * Dit gebeurt echt: /api/werkgever/recent-responses eist een van vier rollen, en het scherm eromheen
 * (EmployerShell) vraagt het elke 6 seconden. Wijzigt iemands rol of bedrijf terwijl zijn tabblad
 * openstaat, dan is de pagina al getekend maar weigert de route. Gemeten in het Caddy-log: 78 van die
 * 403's op 24 nov en 7 op 26 nov.
 *
 * Doorvragen is dan niet alleen zinloos maar gevaarlijk: AGENTS.md waarschuwt dat CrowdSec een reeks
 * 403's als inbraakpoging telt en het hele IP-adres vier uur blokkeert — dus ook de app en de site voor
 * dat hele bedrijf. Eén 403 is geen reeks, dus stoppen is de hele oplossing.
 */
export function isNietToegestaan(status: number): boolean {
  return status === 403;
}

/** De sleutel waarmee een tabblad onthoudt dat het al één keer herladen heeft. */
export const HERLAAD_SLEUTEL = "zf-sessie-verlopen-herladen";

export interface SessieOmgeving {
  /** leest een onthouden waarde; mag null geven als het niet kan (privémodus) */
  lees: (sleutel: string) => string | null;
  /** bewaart een waarde; mag niets doen als het niet kan */
  bewaar: (sleutel: string, waarde: string) => void;
  /** herlaadt het tabblad */
  herlaad: () => void;
}

/**
 * Handelt het antwoord van een herhaalde achtergrondvraag af.
 *
 * Geeft `true` als de aanroeper moet **stoppen** met vragen. Dat is zo bij een 401 (niet meer
 * ingelogd) en bij een 403 (wel ingelogd, mag dit niet).
 *
 * Alleen bij een 401 wordt het tabblad één keer herladen, zodat de bezoeker op de inlogpagina komt
 * die het in zijn eigen taal uitlegt. Bij een 403 niet: die bezoeker ís ingelogd, dus herladen helpt
 * hem niet en laat hem alleen een pagina opnieuw zien. Een tweede keer herladen gebeurt nooit: dat
 * zou een herlaadlus kunnen worden als de inlogpagina zelf nog iets opvraagt.
 */
export function stopBijVerlopenSessie(status: number, omgeving: SessieOmgeving): boolean {
  if (isNietToegestaan(status)) return true; // stoppen, maar niet herladen
  if (!isNietIngelogd(status)) return false;

  let alHerladen = false;
  try {
    alHerladen = omgeving.lees(HERLAAD_SLEUTEL) === "1";
  } catch {
    // privémodus of geblokkeerde opslag: dan liever niet herladen dan een lus riskeren
    alHerladen = true;
  }

  if (!alHerladen) {
    try {
      omgeving.bewaar(HERLAAD_SLEUTEL, "1");
    } catch {
      /* niets te onthouden: we herladen hieronder toch maar één keer per tabblad */
    }
    try {
      omgeving.herlaad();
    } catch {
      /* niets aan te doen; stoppen met vragen is het belangrijkste */
    }
  }

  return true;
}

/** De omgeving in een browser. Buiten een browser doet hij niets (server-render). */
export function browserOmgeving(): SessieOmgeving {
  return {
    lees: (sleutel) => {
      if (typeof window === "undefined") return "1"; // op de server nooit herladen
      return window.sessionStorage.getItem(sleutel);
    },
    bewaar: (sleutel, waarde) => {
      if (typeof window === "undefined") return;
      window.sessionStorage.setItem(sleutel, waarde);
    },
    herlaad: () => {
      if (typeof window === "undefined") return;
      window.location.reload();
    },
  };
}

/**
 * Het geval dat bijna elke poller nodig heeft: stop ik met vragen?
 *
 * `true` bij een 401 of een 403. Bij een 401 gaat het tabblad ook één keer naar de inlogpagina.
 * De naam zegt wat de aanroeper moet doen, want dát is wat er op de plek van de aanroep telt.
 */
export function stopMetPollen(status: number): boolean {
  return stopBijVerlopenSessie(status, browserOmgeving());
}
