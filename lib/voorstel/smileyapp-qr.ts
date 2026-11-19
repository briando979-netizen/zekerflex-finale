import { qrEncode, qrSvgPath } from "@/lib/qr/encode";
import { leesBron } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { SUBDOMEIN_HOST } from "@/lib/voorstel/smileyapp-account-regels";

// ---------------------------------------------------------------------------
// De QR-code naar de demo-aanvraag van het SmileyApp-voorstel (19 nov 2026):
// voor op een beursstand, flyer of visitekaartje. Hij wijst naar
// https://smileyapp.zekerflex.com/demo zolang het een voorstel is, met
// optioneel ?bron=<woord> zodat het team bij een aanvraag ziet waar hij vandaan
// kwam. Puur (de eigen QR-encoder heeft geen afhankelijkheden), dus het beheer
// tekent de code in de browser en de route maakt er een bestand van.
// ---------------------------------------------------------------------------

export const DEMO_ADRES = `https://${SUBDOMEIN_HOST}/demo`;

/** Waar de QR-code naartoe wijst. */
export function demoQrAdres(bron?: string): string {
  const b = leesBron(bron);
  return b ? `${DEMO_ADRES}?bron=${b}` : DEMO_ADRES;
}

export const QR_RAND = 4;

/** De QR-code als SVG-pad, met de zijde van het vak (modules plus witte rand). */
export function demoQr(bron?: string): { adres: string; pad: string; zijde: number } {
  const adres = demoQrAdres(bron);
  const m = qrEncode(adres);
  return { adres, pad: qrSvgPath(m, QR_RAND), zijde: m.length + QR_RAND * 2 };
}

/** Een compleet SVG-bestand: donkergroene code op wit, scherp op elke grootte. */
export function demoQrSvg(bron?: string): string {
  const { pad, zijde } = demoQr(bron);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${zijde} ${zijde}" width="1024" height="1024" shape-rendering="crispEdges"><rect width="${zijde}" height="${zijde}" fill="#ffffff"/><path d="${pad}" fill="#0E2A20"/></svg>\n`;
}

/** De bestandsnaam voor een download: alleen a-z, 0-9 en streepjes (de bron is al gecontroleerd). */
export const qrBestandsnaam = (bron: string | undefined, vorm: "svg" | "png") => `smileyapp-demo-qr${leesBron(bron) ? `-${leesBron(bron)}` : ""}.${vorm}`;
