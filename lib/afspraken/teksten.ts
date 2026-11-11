// Teksten en codes die de server en de schermen van het afsprakenbeheer delen (puur, zonder opslag of React).

/** De `code` van de 423 die een teamlid zonder beheerdersrol krijgt; de schermen tonen dan een uitleg in plaats van een fout. */
export const ALLEEN_BEHEERDER = "ALLEEN_BEHEERDER";

export const ALLEEN_BEHEERDER_TEKST =
  "Alleen de beheerder van je organisatie ziet en beheert de afspraken en de klanten, want het zijn gegevens van de klanten van het bedrijf. Vraag de beheerder om dit voor je te doen.";

/** Dezelfde tekst voor een link die onbekend, verlopen of gewist is: een bezoeker kan nooit zien welke van de drie. */
export const LINK_ONBEKEND_TEKST = "Deze link werkt niet (meer). Is je afspraak al geweest of gewist? Neem dan contact op met het bedrijf.";

/** Waarom een klant niet (meer) kan annuleren, in gewone woorden (voor de pagina en de route). */
export function annuleerUitleg(reden: "al-geannuleerd" | "verstreken" | "te-laat", annuleerTotMin: number): string {
  if (reden === "al-geannuleerd") return "Deze afspraak is al geannuleerd. Je hoeft niets meer te doen.";
  if (reden === "verstreken") return "Deze afspraak is al geweest, of is niet meer te annuleren.";
  const duur = annuleerTotMin % 60 === 0 && annuleerTotMin > 0 ? `${annuleerTotMin / 60} uur` : `${annuleerTotMin} minuten`;
  return `Je kunt niet meer online annuleren: dat kan tot ${duur} voor de afspraak. Bel het bedrijf als je toch niet kunt komen.`;
}

/** Staat boven een lijst die niet compleet is omdat er meer afspraken zijn dan er in één lijst passen. */
export const LIJST_AFGEKAPT_TEKST =
  "Je hebt zoveel afspraken dat niet alles in deze lijst past. Er ontbreken klanten of afspraken, vooral de nieuwste. Zoek een klant die je mist via de agenda.";
