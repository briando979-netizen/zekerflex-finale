import { vt } from "@/lib/i18n/site";
// ---------------------------------------------------------------------------
// De homepagina voor werkzoekenden (11 nov 2026). De eigenaar: wie zekerflex.com
// opent, ziet de pagina voor de werker; de homepagina van daarvoor staat
// ongewijzigd op /bedrijven, met een knop om te wisselen. Hier staan de teksten,
// zodat de pagina (app/(marketing)/page.tsx) alleen opmaak is.
// Alles is waar en nu te doen: geen verzonnen cijfers, geen bedrijfsprijs, geen
// software. Puur en browser-veilig.
// ---------------------------------------------------------------------------

/** Waar de knop "Ik zoek personeel" heen gaat: de homepagina voor bedrijven. */
export const BEDRIJVEN_HOME = "/bedrijven";
/** Aanmelden als werker. */
export const WERK_AANMELDEN = "/register?type=freelancer";

export const WERK_HERO = {
  wissel: { vraag: vt("Ben je een bedrijf?"), knop: vt("Ik zoek personeel") },
  eyebrow: vt("Voor flexwerkers, zzp'ers en uitzendkrachten"),
  kop: vt("Jouw tijd. Jouw werk."),
  kopAccent: vt("Jouw geld."),
  lead: vt("Kies zelf je klussen bij jou in de buurt. Je ziet vooraf wat je verdient, je checkt in met je telefoon en je geld komt op je eigen rekening."),
  knop: vt("Maak gratis je profiel"),
  knop2: vt("Bekijk klussen"),
  punten: [vt("Gratis voor werkers"), vt("Klaar in een paar minuten"), vt("In vijf talen")],
  /** een staande foto: op de telefoon bovenaan, op een groter scherm als strook rechts (12 nov 2026, eigenaar: "een blonde dame, student ofzo") */
  foto: "/werk/campagne-kop.jpg",
  /** dezelfde foto, bewegend (18 nov 2026, eigenaar: "die persoon moet levend worden"): 10 s heen en terug, zonder geluid; ligt over de foto */
  video: "/werk/campagne-kop.mp4",
  fotoAlt: vt("Een medewerker met een dienblad onder de arm in de deuropening van een café"),
} as const;

/** De schuivende strook onder de kop: de soorten werk, elk naar de pagina met dat werk (17 nov 2026). */
export const WERK_STROOK: { naam: string; href: string }[] = [
  { naam: vt("Horeca"), href: "/horeca-vacatures" },
  { naam: vt("Magazijn"), href: "/logistiek-vacatures" },
  { naam: vt("Winkel"), href: "/retail-vacatures" },
  { naam: vt("Evenementen"), href: "/evenementen-vacatures" },
  { naam: vt("Schoonmaak"), href: "/schoonmaak-vacatures" },
  { naam: vt("Bezorgen"), href: "/klussen" },
];

export interface WerkGroep {
  titel: string;
  tekst: string;
  foto: string;
  alt: string;
  /** De uitgeknipte persoon (achtergrond weg), voor het pop-out-effect bij hover/aanraken. */
  uit?: string;
}

/** Voor wie: zo herkent een bezoeker zichzelf. */
export const WERK_GROEPEN: WerkGroep[] = [
  { titel: vt("Naast je studie"), tekst: vt("Werk een avond of een weekend. Je tentamens plan je er gewoon omheen."), foto: "/werk/campagne-studie.jpg", uit: "/werk/campagne-studie-cut.png", alt: vt("Een barista schenkt melk in een cappuccino") },
  { titel: vt("Als zzp'er"), tekst: vt("Opdrachten zonder acquisitie, en je hoeft zelf geen facturen te sturen."), foto: "/werk/campagne-zzp.jpg", uit: "/werk/campagne-zzp-cut.png", alt: vt("Een magazijnmedewerker scant een doos") },
  { titel: vt("Zonder KVK"), tekst: vt("Werk als uitzendkracht via een aangesloten uitzendbureau, met een echte loonstrook."), foto: "/werk/campagne-uitzend.jpg", uit: "/werk/campagne-uitzend-cut.png", alt: vt("Een medewerker duwt een steekkar met dozen") },
  { titel: vt("Iets extra's"), tekst: vt("Een paar uur per week erbij, op de momenten dat het jou uitkomt."), foto: "/werk/campagne-extra.jpg", uit: "/werk/campagne-extra-cut.png", alt: vt("Een barman tapt een biertje achter de bar") },
];

export const WERK_STAPPEN = [
  { titel: vt("Maak je profiel"), tekst: vt("Je vak, je woonplaats en wanneer je kunt. Je ID controleer je met je telefoon.") },
  { titel: vt("Kies je klus"), tekst: vt("Bij elke klus zie je het uurtarief en de reistijd. Reageren doe je met één tik.") },
  { titel: vt("Werk en word betaald"), tekst: vt("Je checkt in met je telefoon. Na goedkeuring van je uren komt je geld op je eigen rekening.") },
] as const;

export type WerkIcoon = "geld" | "keuze" | "rekening" | "chat";

export const WERK_VOORDELEN: { icoon: WerkIcoon; titel: string; tekst: string }[] = [
  { icoon: "geld", titel: vt("Vooraf weten wat je verdient"), tekst: vt("Uurtarief en reistijd staan bij elke klus. Geen verrassingen achteraf.") },
  { icoon: "keuze", titel: vt("Jij zegt ja of nee"), tekst: vt("Niemand die je een rooster oplegt. Jij kiest welke klussen je doet.") },
  { icoon: "rekening", titel: vt("Je geld op je eigen rekening"), tekst: vt("Als zzp'er kies je zelf hoe snel. Als uitzendkracht betaalt je uitzendbureau je loon.") },
  { icoon: "chat", titel: vt("Je staat er niet alleen voor"), tekst: vt("Chat in de app met de opdrachtgever, en met ons als er iets is.") },
];

/** De vragen van een werker (de antwoorden komen van de homepagina voor bedrijven, zonder wat bedrijven betalen). */
export const WERK_FAQ: { q: string; a: string }[] = [
  { q: vt("Kost het mij iets?"), a: vt("Nee. Meedoen als werker is gratis.") },
  // 21 nov (eigenaar): geen aparte pagina over uitzendwerk meer, "gewoon een stukje bij vragen: ga in de app, filter uitzend"
  { q: vt("Kan ik werken zonder KVK?"), a: vt("Ja, als uitzendkracht via een aangesloten uitzendbureau. Open de app, tik op het filter en zet bij Type klus alleen Uitzendklussen aan. Meld je aan voor een dienst: het uitzendbureau neemt contact met je op en neemt je aan op een uitzendcontract. Het bureau is dan je werkgever en regelt je loon, vakantiegeld en pensioen volgens zijn cao.") },
  { q: vt("Hoe snel word ik als zzp'er betaald?"), a: vt("Dat kies je zelf. Standaard wacht je gratis tot de opdrachtgever binnen 30 dagen afrekent. Wil je eerder, dan kies je een snellere uitbetaling tegen een fee: betaalopdracht direct indienen (4% van de factuur) of binnen 3 werkdagen indienen (2%).") },
  { q: vt("Moet ik zelf facturen sturen?"), a: vt("Nee. ZekerFlex werkt met reverse billing en maakt de facturen automatisch aan, met de juiste btw-behandeling.") },
  { q: vt("In welke talen werkt de app?"), a: vt("In het Nederlands, Engels, Pools, Roemeens en Oekraïens.") },
  { q: vt("Is mijn data veilig?"), a: vt("Voor diensten zoals betalingen, e-mail en verificatie gebruiken we gespecialiseerde aanbieders. Gevoelige gegevens worden waar nodig versleuteld opgeslagen; belangrijke handelingen komen in een auditspoor.") },
];

export const WERK_SLOT = {
  kop: vt("Je volgende klus begint hier."),
  lead: vt("Maak in een paar minuten je profiel. Zodra er werk bij jou in de buurt is, krijg je een melding."),
} as const;

/** De vragen als FAQPage voor zoekmachines (in de pagina via ldJson). */
export function werkFaqJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: WERK_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
