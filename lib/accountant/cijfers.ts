// ---------------------------------------------------------------------------
// Antwoord op een cijfervraag (lib/accountant/cijfervraag.ts) uit de echte boekhouding: alleen lezen
// via b3's lib/boekhouding/lezen.ts en de termijnen via termijnenNu(). Geen model, dus geen verzonnen
// bedragen. Alleen echte administraties.
// ---------------------------------------------------------------------------

import { administraties, btwOverzicht, openPosten, proefbalans } from "@/lib/boekhouding/lezen";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { termijnenNu } from "@/lib/accountant/maandcontrole";
import { SLOT, btwTekst, openstaandTekst, termijnTekst, wvTekst, type Cijfervraag } from "@/lib/accountant/cijfervraag";
import type { VraagAntwoord } from "@/lib/accountant/antwoord";

export async function beantwoordCijfervraag(cv: Cijfervraag, nu: Date = new Date()): Promise<VraagAntwoord> {
  if (cv.wat === "termijn") {
    return {
      soort: "antwoord",
      tekst: `${termijnTekst(await termijnenNu(nu), cv.onderwerp)}\n\nDe datums komen uit de termijnenlijst van de boekhouding; een accountant of US tax preparer bevestigt ze.`,
      bronnen: [{ naam: "Termijnen uit Beheer → Boekhouding (lib/boekhouding/deadlines)", url: "/admin/accountant", zekerheid: "laten-bevestigen" }],
      door: "boekhouding",
    };
  }

  const echte = (await administraties()).filter((a) => a.soort === "ECHT");
  if (echte.length === 0) {
    return {
      soort: "onbekend",
      tekst: "Er is nog geen echte administratie, dus ik heb nog geen cijfers. Zodra de boekhouding voor zekerflex, Inc. is ingericht, beantwoord ik dit uit de boeken.",
      bronnen: [],
      door: "boekhouding",
    };
  }

  const vandaag = amsterdamDayKey(nu);
  const { van, tot } = cv.periode;
  const wat = cv.wat; // hier nooit "termijn" meer (die keerde hierboven al terug)
  const delen = await Promise.all(
    echte.map(async (a) => {
      if (wat === "btw") return btwTekst(cv.periode, a.naam, a.valuta, (await btwOverzicht(a.id, van, tot)).geboektSaldoCents);
      if (wat === "openstaand") return openstaandTekst(a.naam, a.valuta, await openPosten(a.id, vandaag), vandaag);
      return wvTekst(wat, cv.periode, a.naam, a.valuta, await proefbalans(a.id, van, tot));
    }),
  );
  return {
    soort: "antwoord",
    tekst: `${delen.join("\n")}\n\n${SLOT}`,
    bronnen: [
      {
        naam: `Eigen boekhouding (${echte.map((a) => a.naam).join(", ")}), ${wat === "openstaand" ? `stand op ${vandaag}` : `${van} t/m ${tot}`}`,
        url: "/admin/accountant",
        zekerheid: "gelezen",
      },
    ],
    door: "boekhouding",
  };
}
