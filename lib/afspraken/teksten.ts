// Teksten en codes die de server en de schermen van het afsprakenbeheer delen (puur, zonder opslag of React).

/** De `code` van de 423 die een teamlid zonder beheerdersrol krijgt; de schermen tonen dan een uitleg in plaats van een fout. */
export const ALLEEN_BEHEERDER = "ALLEEN_BEHEERDER";

export const ALLEEN_BEHEERDER_TEKST =
  "Alleen de beheerder van je organisatie ziet en beheert de afspraken en de klanten, want het zijn gegevens van de klanten van het bedrijf. Vraag de beheerder om dit voor je te doen.";

/** Staat boven een lijst die niet compleet is omdat er meer afspraken zijn dan er in één lijst passen. */
export const LIJST_AFGEKAPT_TEKST =
  "Je hebt zoveel afspraken dat niet alles in deze lijst past. Er ontbreken klanten of afspraken, vooral de nieuwste. Zoek een klant die je mist via de agenda.";
