// De pictogrammen bij de voorwaarden van een klus-type (freelance of uitzenden), in de volgorde van de teksten
// market.typeFreelance / market.typeUitzend in lib/i18n/freelancer.ts. Puur bestand: Ontdekken (client) en de
// kluspagina (server) tonen dezelfde rij, zoals het vergelijkblok en de chips op de kluspagina van YoungOnes.

export const KLUS_TYPE_EMOJI = {
  freelance: ["✌️", "💰", "🧾", "🏖️", "💸"],
  uitzenden: ["📝", "💰", "🧾", "🏖️", "💸"],
} as const;
