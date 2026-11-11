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
  wissel: { vraag: "Ben je een bedrijf?", knop: "Ik zoek personeel" },
  eyebrow: "Voor flexwerkers, zzp'ers en uitzendkrachten",
  kop: "Jouw tijd. Jouw werk.",
  kopAccent: "Jouw geld.",
  lead: "Kies zelf je klussen bij jou in de buurt. Je ziet vooraf wat je verdient, je checkt in met je telefoon en je geld komt op je eigen rekening.",
  knop: "Maak gratis je profiel",
  knop2: "Bekijk klussen",
  punten: ["Gratis voor werkers", "Klaar in een paar minuten", "In vijf talen"],
  fotoAlt: "Een lachende serveerster aan het werk in een café",
} as const;

export interface WerkGroep {
  titel: string;
  tekst: string;
  foto: string;
  alt: string;
}

/** Voor wie: zo herkent een bezoeker zichzelf. */
export const WERK_GROEPEN: WerkGroep[] = [
  { titel: "Naast je studie", tekst: "Werk een avond of een weekend. Je tentamens plan je er gewoon omheen.", foto: "/werk/student.jpg", alt: "Een jonge vrouw achter de toonbank van een bakkerij" },
  { titel: "Als zzp'er", tekst: "Opdrachten zonder acquisitie, en je hoeft zelf geen facturen te sturen.", foto: "/werk/logistiek.jpg", alt: "Een lachende man in een magazijn" },
  { titel: "Zonder KVK", tekst: "Werk via ons uitzendbureau, met elke week een echte loonstrook.", foto: "/werk/magazijn.jpg", alt: "Een magazijnmedewerker met dozen" },
  { titel: "Iets extra's", tekst: "Een paar uur per week erbij, op de momenten dat het jou uitkomt.", foto: "/werk/bijverdienen.jpg", alt: "Een serveerster met een drankje in een restaurant" },
];

export const WERK_STAPPEN = [
  { titel: "Maak je profiel", tekst: "Je vak, je woonplaats en wanneer je kunt. Je ID controleer je met je telefoon." },
  { titel: "Kies je klus", tekst: "Bij elke klus zie je het uurtarief en de reistijd. Reageren doe je met één tik." },
  { titel: "Werk en word betaald", tekst: "Je checkt in met je telefoon. Na goedkeuring van je uren komt je geld op je eigen rekening." },
] as const;

export type WerkIcoon = "geld" | "keuze" | "rekening" | "chat";

export const WERK_VOORDELEN: { icoon: WerkIcoon; titel: string; tekst: string }[] = [
  { icoon: "geld", titel: "Vooraf weten wat je verdient", tekst: "Uurtarief en reistijd staan bij elke klus. Geen verrassingen achteraf." },
  { icoon: "keuze", titel: "Jij zegt ja of nee", tekst: "Niemand die je een rooster oplegt. Jij kiest welke klussen je doet." },
  { icoon: "rekening", titel: "Je geld op je eigen rekening", tekst: "Als zzp'er kies je zelf hoe snel. Als uitzendkracht krijg je elke week je loon." },
  { icoon: "chat", titel: "Je staat er niet alleen voor", tekst: "Chat in de app met de opdrachtgever, en met ons als er iets is." },
];

/** De vragen van een werker (de antwoorden komen van de homepagina voor bedrijven, zonder wat bedrijven betalen). */
export const WERK_FAQ: { q: string; a: string }[] = [
  { q: "Kost het mij iets?", a: "Nee. Meedoen als werker is gratis." },
  { q: "Kan ik werken zonder KVK?", a: "Ja. Via ons uitzendbureau werk je als uitzendkracht: ZekerFlex is dan je werkgever en verloont je elke week met een echte loonstrook, inclusief vakantiegeld, pensioen (StiPP) en het ABU-fasensysteem. Alles is terug te lezen in je dashboard onder ‘Verloning’." },
  { q: "Hoe snel word ik als zzp'er betaald?", a: "Dat kies je zelf. Standaard wacht je gratis tot de opdrachtgever binnen 30 dagen afrekent. Wil je eerder, dan kies je een snellere uitbetaling tegen een fee: betaalopdracht direct indienen (4% van de factuur) of binnen 3 werkdagen indienen (2%)." },
  { q: "Moet ik zelf facturen sturen?", a: "Nee. ZekerFlex werkt met reverse billing en maakt de facturen automatisch aan, met de juiste btw-behandeling." },
  { q: "In welke talen werkt de app?", a: "In het Nederlands, Engels, Pools, Roemeens en Oekraïens." },
  { q: "Is mijn data veilig?", a: "Voor diensten zoals betalingen, e-mail en verificatie gebruiken we gespecialiseerde aanbieders. Gevoelige gegevens worden waar nodig versleuteld opgeslagen; belangrijke handelingen komen in een auditspoor." },
];

export const WERK_SLOT = {
  kop: "Je volgende klus begint hier.",
  lead: "Maak in een paar minuten je profiel. Zodra er werk bij jou in de buurt is, krijg je een melding.",
} as const;

/** De vragen als FAQPage voor zoekmachines (in de pagina via ldJson). */
export function werkFaqJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: WERK_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
