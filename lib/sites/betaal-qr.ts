import { qrEncode, qrSvgPath } from "@/lib/qr/encode";
import { schoonIban } from "@/lib/sites/winkel-betalen";

// ---------------------------------------------------------------------------
// De betaal-QR-code bij een bestelling per overboeking (EPC069-12, "SEPA-QR"):
// een bank-app die zo'n code kan lezen, vult naam, IBAN, bedrag en omschrijving
// zelf in. De server tekent hem als inline SVG op de bedankpagina (lib/sites/serve.ts),
// zodat de QR-maker niet in de bundel van de studio of de bouwer komt. Puur.
// ---------------------------------------------------------------------------

/** Wat een overboeking nodig heeft; de omschrijving is het bestelnummer. */
export interface Overboeking {
  iban: string;
  naam: string;
  bedragCents: number;
  omschrijving: string;
}

const regel = (s: string, max: number) => s.replace(/[\r\n]+/g, " ").trim().slice(0, max);

/**
 * De tekst in een betaal-QR-code (EPC069-12, versie 002, tekenset UTF-8): een SEPA-overboeking met
 * naam, IBAN, bedrag en omschrijving. Een BIC is binnen de EER niet nodig. Elk veld op een eigen regel.
 */
export function epcPayload(o: Overboeking): string {
  const bedrag = Math.min(99_999_999_999, Math.max(0, Math.round(o.bedragCents)));
  return [
    "BCD",
    "002",
    "1", // UTF-8
    "SCT",
    "", // BIC
    regel(o.naam, 70),
    schoonIban(o.iban),
    bedrag > 0 ? `EUR${(bedrag / 100).toFixed(2)}` : "",
    "", // doel
    "", // gestructureerde referentie (niet samen met een vrije omschrijving)
    regel(o.omschrijving, 140),
  ].join("\n");
}

/**
 * De betaal-QR-code als inline SVG (foutcorrectie M, zoals EPC069-12 vraagt): alleen vormen, geen script,
 * geen lettertype, geen bestand van buiten. Met een witte rand van vier modules.
 */
export function epcQrSvg(o: Overboeking, px = 220): string {
  const m = qrEncode(epcPayload(o));
  const n = m.length + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" role="img" aria-label="Betaal-QR-code voor je bank-app" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${qrSvgPath(m, 4)}" fill="#000"/></svg>`;
}
