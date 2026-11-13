// Eigenaar-taak (13 nov 2026, "ja ja" op de echte paskamer): een account bij de pasdienst FASHN, tegoed kopen en de
// sleutel invullen in Beheer. De taak vinkt zichzelf af zodra er een sleutel staat. Puur: alleen of er een sleutel is.

import type { OwnerTodo } from "@/lib/admin/owner-todos";

/** `undefined` = niet kunnen lezen (dan geen taak, om niets vals te tonen). */
export function pasdienstTodo(heeftSleutel: boolean | undefined): OwnerTodo | null {
  if (heeftSleutel === undefined) return null;
  return {
    id: "pasdienst-sleutel",
    group: "Overig",
    title: "Echte paskamer: sleutel van FASHN invullen",
    why: "Je koos voor echt passen op de eigen foto van een bezoeker. Dat doet de pasdienst FASHN, ± 8 cent per beeld. Zonder sleutel krijgt iedereen de gratis paspop. FASHN gebruikt de foto's niet om te trainen en wist ze na het beeld (staat in hun voorwaarden); ZekerFlex bewaart niets.",
    how: [
      "Maak een account op fashn.ai (Developer API) en koop het kleinste pakket tegoed.",
      "Maak in het dashboard van FASHN een API-sleutel aan.",
      "Plak hem in Beheer → Webshop → Hulpmiddelen → Echt passen, kies een dagplafond (standaard € 2) en kies Opslaan.",
      "Zet daarna bij Beheer → Vlaggen \"Paskamer: echt passen\" aan. Uit zetten kan altijd, zonder uitrol.",
    ],
    auto: true,
    done: heeftSleutel,
    ...(heeftSleutel ? { doneNote: "er staat een sleutel van FASHN" } : {}),
  };
}
