import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";
import { antwoordOnderwerp, beginVanTekst } from "@/lib/mail/info-indeling";

// Het antwoordenpakket voor bedrijven die naar info@ mailen (18 nov 2026). Puur bestand. Een bedrijf dat vragen stelt (kosten,
// zzp of uitzend, verzekering, annuleren, ziekte, kennismaken) krijgt een CONCEPT-antwoord dat de eigenaar eerst nakijkt
// (Beheer, AI-teams, Uitvoeren): bedrijfsmails krijgen nooit automatisch een antwoord (lib/mail/info-ronde.ts).
//
// Eerlijk, in lijn met wat op de site staat (AGENTS.md): er is geen verzekering, de uitzendroute is nog in opbouw, de
// uitzendopslag is niet openbaar en we noemen alleen de platformvergoeding uit lib/pricing/tiers.ts. Wat we niet zeker weten
// (toeslagen, annuleringsregels in het bijzonder), beloven we niet maar bespreken we persoonlijk. Geen invulplekken: wat hier
// staat kan zo de deur uit.

export type InfoVraag = "kosten" | "extra" | "soort" | "verzekering" | "annuleren" | "ziekte";

const VRAGEN: Record<InfoVraag, RegExp> = {
  kosten: /\b(kosten|kost|tarief|tarieven|prijs|prijzen|uurtarief|uurprijs|per\s+uur)\b/i,
  extra: /\b(toeslag|toeslagen|abonnement(en)?|extra\s+kosten|meerkosten|opstartkosten)\b/i,
  soort: /\b(zzp'?ers?|zelfstandigen?|uitzendkrachten?|uitzenden|uitzend|payroll|detachering)\b/i,
  verzekering: /\b(verzekering(en)?|verzekerd|aansprakelijk\w*)\b/i,
  annuleren: /\b(annuler\w*|afzeggen|afgezegd)\b/i,
  ziekte: /\b(ziekte|ziek|ziekmelding\w*|no-?show|niet\s+(komt|komen|op)\s*opdagen|niet\s+komt\s+opdagen|afwezig)\b/i,
};

const VOLGORDE: InfoVraag[] = ["kosten", "extra", "soort", "verzekering", "annuleren", "ziekte"];

/** Welke vragen staan er in de mail? Alleen het begin van de tekst telt (geciteerde oude mails niet). */
export function herkenVragen(onderwerp: string | null, tekst: string | null): InfoVraag[] {
  const stof = `${onderwerp ?? ""}\n${beginVanTekst(tekst ?? "")}`;
  return VOLGORDE.filter((v) => VRAGEN[v].test(stof));
}

const euro = (cents: number): string => `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ANTWOORD: Record<InfoVraag, string[]> = {
  kosten: [
    "Wat kost het per gewerkt uur?",
    `Je betaalt het uurtarief van de flexwerker, dat stel je zelf in als je een klus plaatst, plus een platformvergoeding van ${euro(BASE_FEE_PER_HOUR_CENTS)} per gewerkt uur. Hoe meer uren je per maand afneemt, hoe lager die vergoeding wordt (staffelkorting).`,
  ],
  extra: [
    "Toeslagen of andere kosten?",
    "Over toeslagen, bijvoorbeeld voor werken in de nacht of in het weekend, en over eventuele andere kosten praten we je graag persoonlijk bij, zodat je niet voor verrassingen komt te staan.",
  ],
  soort: [
    "Zzp'ers of uitzendkrachten?",
    "Je kunt flexwerkers en zzp'ers een klus aanbieden en rechtstreeks met hen afspraken maken. Uitzenden, waarbij een uitzender de werkgever is en jij niets hoeft te regelen over loon en verzuim, is nog in opbouw. We bespreken graag wat er nu voor jouw situatie mogelijk is.",
  ],
  verzekering: [
    "Verzekeringen en aansprakelijkheid",
    "ZekerFlex biedt zelf geen verzekering aan. Zzp'ers en flexwerkers regelen zelf een aansprakelijkheidsverzekering (AVB). Hoe aansprakelijkheid bij uitzenden ligt, is weer anders; ook dat leggen we je graag persoonlijk uit.",
  ],
  annuleren: [
    "Annuleren",
    "Voor annuleren gelden de voorwaarden op https://zekerflex.com/voorwaarden. Heb je een specifieke situatie, bijvoorbeeld vaste vrijdagen en zaterdagen, dan bespreken we die graag.",
  ],
  ziekte: [
    "Ziekte of niet komen opdagen",
    "Meldt een flexwerker zich af of komt iemand niet opdagen, dan wordt dat vastgelegd en kun je een vervanger zoeken. Voor spoedgevallen kunnen we passende flexwerkers meteen een oproep sturen.",
  ],
};

export interface BedrijfsConcept {
  onderwerp: string;
  tekst: string;
  /** welke vragen het antwoord behandelt, voor de eigenaar in het voorstel */
  vragen: InfoVraag[];
}

/** Het concept-antwoord op een mail van een bedrijf. Altijd afgesloten met het aanbod om kennis te maken. */
export function bedrijfsConcept(onderwerp: string | null, tekst: string | null): BedrijfsConcept {
  const vragen = herkenVragen(onderwerp, tekst);
  const delen: string[] = ["Hallo,", "", "Bedankt voor je bericht en je interesse in ZekerFlex."];
  if (vragen.length > 0) {
    delen.push("", "Hieronder vind je antwoord op je vragen.");
    for (const v of vragen) delen.push("", ...ANTWOORD[v]);
  } else {
    delen.push(
      "",
      "ZekerFlex brengt bedrijven en flexwerkers (zzp'ers en flexkrachten) bij elkaar. Je plaatst een klus, passende flexwerkers krijgen een melding en jij kiest wie er komt.",
      "",
      "Laat gerust weten waar je meer over wilt weten, bijvoorbeeld de kosten, hoe het werkt met zzp'ers of uitzenden, of wat er gebeurt bij ziekte.",
    );
  }
  delen.push(
    "",
    "Zullen we vrijblijvend kennismaken? Je kunt zelf een demo of belafspraak inplannen via https://zekerflex.com/demo, of antwoord op deze mail met een moment waarop we je mogen bellen.",
    "",
    "Groet,",
    "Team ZekerFlex",
  );
  return { onderwerp: antwoordOnderwerp(onderwerp), tekst: delen.join("\n"), vragen };
}

export const VRAAG_LABEL: Record<InfoVraag, string> = {
  kosten: "kosten per uur",
  extra: "toeslagen en extra kosten",
  soort: "zzp of uitzend",
  verzekering: "verzekering en aansprakelijkheid",
  annuleren: "annuleren",
  ziekte: "ziekte of niet komen opdagen",
};
