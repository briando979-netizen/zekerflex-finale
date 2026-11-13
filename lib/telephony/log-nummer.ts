// Wat over een telefoonnummer in een log of het foutenlogboek mag: alleen het land en de laatste 2 cijfers.
// Puur, zonder imports (net als lib/mail/log-domein.ts), zodat elke laag het kan gebruiken.

// Landnummers van 1 en 3 cijfers (E.164); alle andere zijn 2 cijfers.
const EEN_CIJFER = new Set(["1", "7"]);
const DRIE_CIJFERS = ["21", "22", "23", "24", "25", "26", "29", "35", "37", "38", "42", "50", "59", "67", "68", "69", "80", "85", "87", "88", "96", "97", "99"];

function landnummer(cijfers: string): string {
  if (EEN_CIJFER.has(cijfers.slice(0, 1))) return cijfers.slice(0, 1);
  return DRIE_CIJFERS.includes(cijfers.slice(0, 2)) ? cijfers.slice(0, 3) : cijfers.slice(0, 2);
}

/**
 * "+31612345678" geeft "+31…78". Ook "0031…", "whatsapp:+31…" en een WhatsApp-adres ("31612345678@s.whatsapp.net").
 * Zonder landnummer (bv. "0612345678") of in een andere vorm: "onbekend".
 */
export function nummerVoorLog(nummer: unknown): string {
  const ruw = String(nummer ?? "").split("@")[0] ?? "";
  const metPlusOfNul = ruw.replace(/^[^+\d]*/, "");
  if (/^0(?!0)/.test(metPlusOfNul)) return "onbekend";
  const cijfers = metPlusOfNul.replace(/^(\+|00)/, "").replace(/[\s().-]/g, "");
  if (!/^\d{8,15}$/.test(cijfers)) return "onbekend";
  return `+${landnummer(cijfers)}…${cijfers.slice(-2)}`;
}

/** Haalt telefoonnummers uit een tekst (bv. een foutmelding van Twilio: "The number +31612345678 is not valid"). */
export function zonderNummers(tekst: string | undefined): string {
  return (tekst ?? "").replace(/(?:\+|00)?\d(?:[\s().-]?\d){7,}/g, "<nummer>");
}
