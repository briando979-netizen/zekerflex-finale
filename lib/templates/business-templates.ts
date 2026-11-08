export const BUSINESS_TEMPLATES = {
  salon: {
    naam: "Kapsalon / Beauty",
    categorieen: ["Knippen", "Kleuren", "Behandelingen", "Pedicure", "Manicure"],
    producten: [
      { naam: "Knippen", prijs: 30 },
      { naam: "Verven", prijs: 45 },
      { naam: "Highlights", prijs: 60 },
      { naam: "Behandeling", prijs: 25 },
    ],
  },
  restaurant: {
    naam: "Restaurant",
    categorieen: ["Gerechten", "Dranken", "Desserts", "Specials"],
    producten: [
      { naam: "3-gangen menu", prijs: 35 },
      { naam: "Hoofd gerecht", prijs: 22 },
      { naam: "Voorgerecht", prijs: 12 },
      { naam: "Dessert", prijs: 8 },
    ],
  },
  fitness: {
    naam: "Fitnessstudio",
    categorieen: ["Lidmaatschap", "Trainingen", "Groepsles", "Coaching"],
    producten: [
      { naam: "Maandelijks lidmaatschap", prijs: 45 },
      { naam: "Persoonlijke training", prijs: 60 },
      { naam: "Groepsles", prijs: 15 },
      { naam: "3 maanden pakket", prijs: 120 },
    ],
  },
  consultancy: {
    naam: "Adviesbureau",
    categorieen: ["Advies", "Training", "Workshops", "Coaching"],
    producten: [
      { naam: "Uurtarief advies", prijs: 150 },
      { naam: "Half dag training", prijs: 800 },
      { naam: "Volledige dag workshop", prijs: 1500 },
      { naam: "Groep coaching", prijs: 250 },
    ],
  },
};

export function getTemplate(type: string) {
  return BUSINESS_TEMPLATES[type as keyof typeof BUSINESS_TEMPLATES] || null;
}
