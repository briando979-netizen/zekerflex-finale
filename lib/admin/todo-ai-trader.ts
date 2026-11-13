// Eigenaar-taak (14 nov 2026): de Alpaca-papiersleutel invullen bij Beheer -> AI-trader, zodat de stand van de
// demo-rekening in Beheer te zien is. De taak vinkt zichzelf af zodra er een sleutel staat. Puur: alleen of er een sleutel is.

import type { OwnerTodo } from "@/lib/admin/owner-todos";

/** `undefined` = niet kunnen lezen (dan geen taak, om niets vals te tonen). */
export function aiTraderTodo(heeftSleutel: boolean | undefined): OwnerTodo | null {
  if (heeftSleutel === undefined) return null;
  return {
    id: "ai-trader-sleutel",
    group: "Overig",
    title: "Alpaca-papiersleutel invullen bij Beheer → AI-trader",
    why: "Zonder sleutel kan Beheer de stand van de AI-trader niet laten zien (vermogen, posities, orders). Het gaat om de demo-rekening met nep-geld; Beheer leest alleen en plaatst nooit orders.",
    how: [
      "Open app.alpaca.markets en kies bovenin Paper (de demo-rekening, niet de echte).",
      "Maak daar een API-sleutel aan: je krijgt een sleutel-id (begint met PK) en een geheim.",
      "Plak beide in Beheer → AI & automatisering → AI-trader en kies Controleren en bewaren.",
      "Deze taak vinkt zichzelf af zodra er een sleutel staat.",
    ],
    auto: true,
    done: heeftSleutel,
    ...(heeftSleutel ? { doneNote: "er staat een papier-sleutel" } : {}),
  };
}