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
 * Geeft `true` als de aanroeper moet **stoppen** met vragen (de sessie is verlopen).
 * Bij de eerste 401 in dit tabblad wordt ook één keer herladen, zodat de bezoeker
 * op de inlogpagina komt. Een tweede keer herladen gebeurt nooit: dat zou een
 * herlaadlus kunnen worden als de inlogpagina zelf nog iets opvraagt.
 */
export function stopBijVerlopenSessie(status: number, omgeving: SessieOmgeving): boolean {
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

/** Het geval dat bijna elke poller nodig heeft: stop ik met vragen? */
export function sessieVerlopen(status: number): boolean {
  return stopBijVerlopenSessie(status, browserOmgeving());
}
