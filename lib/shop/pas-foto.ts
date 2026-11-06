// "Pas op mijn foto": de klant uploadt een foto van zichzelf (hele lichaam) en
// de gekozen shopproducten worden door een beeldmodel op die persoon gezet.
// Hier staan alleen de pure regels (invoer, grenzen en de opdracht aan het
// model); de route (app/api/shop/pas-foto) doet het werk. Zonder opslag: de
// foto wordt eenmalig naar het beeldmodel gestuurd en daarna weggegooid.

import { z } from "zod";

export const MAX_PRODUCTEN = 5;
/** Per IP, per 10 minuten, en één plafond per dag voor de hele shop (kosten van het beeldmodel). */
export const LIMIET_PER_IP = 4;
export const LIMIET_PER_DAG = 150;
/** Een foto na verkleinen door de browser: ruim genoeg voor een lichaamsfoto, klein genoeg voor het verzoek. */
export const MAX_FOTO_BYTES = 3_500_000;

const tekst = (n: number) => z.string().trim().max(n).optional();

export const pasFotoSchema = z.object({
  foto: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Dit is geen geldige foto").max(MAX_FOTO_BYTES * 1.4),
  producten: z.array(z.object({ id: z.string().min(1).max(64), maat: tekst(30), kleur: tekst(30) })).min(1).max(MAX_PRODUCTEN),
  /** Toestemming om de foto eenmalig naar een extern beeldmodel te sturen, en 18+ of toestemming van een ouder. */
  akkoord: z.literal(true),
});
export type PasFotoInvoer = z.infer<typeof pasFotoSchema>;

export type PasProduct = { name: string; category: string; description: string; maat?: string | undefined; kleur?: string | undefined; heeftFoto: boolean };

const schoon = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/[`"<>]/g, "").slice(0, 160);

/**
 * De opdracht aan het beeldmodel. Beeld 1 is de klant, daarna volgt per product
 * (in dezelfde volgorde als de lijst) zijn productfoto, als die er is.
 */
export function pasFotoPrompt(producten: PasProduct[]): string {
  const lijst = producten
    .map((p, i) => `${i + 1}. ${schoon(p.name)} (${schoon(p.category)})${p.maat ? `, size ${schoon(p.maat)}` : ""}${p.kleur ? `, colour ${schoon(p.kleur)}` : ""}${p.heeftFoto ? " - see the product photo" : `: ${schoon(p.description)}`}`)
    .join("\n");
  return [
    "Virtual try-on for an online clothing shop.",
    "The FIRST image is the customer: a full-body photo of a real person. The following images are product photos of the items they want to wear.",
    "Task: edit the first image so that this exact person wears the listed items. Replace the clothing in the matching body area (top, trousers, shoes, jacket, hat and so on) and leave everything else untouched.",
    "Keep the person's face, hair, skin tone, body shape, pose, camera angle, framing and background exactly as in the first image. Do not change their identity or proportions.",
    "Reproduce each garment faithfully from its product photo: same cut, colour, material, logos and details. Make it fit this body realistically for the given size (looser for a larger size, tighter for a smaller size), with natural folds, correct occlusion by arms and hands, and lighting and shadows that match the original photo.",
    "Items to wear:",
    lijst,
    "Output one photorealistic photo, same aspect ratio as the first image, with no text, no watermark and no borders.",
  ].join("\n");
}

/** Wat de klant te zien krijgt bij elke uitkomst (alles in gewoon Nederlands). */
export const PAS_FOUTEN = {
  tegoed: "Pas op mijn foto is nog niet beschikbaar. We zetten het zo snel mogelijk aan. Intussen kun je de 3D-paspop gebruiken.",
  geblokkeerd: "Dit beeld kon niet gemaakt worden. Probeer een andere foto, bijvoorbeeld een heldere foto van voren, hele lichaam, in strakke of simpele kleding.",
  druk: "Er zijn nu veel aanvragen. Probeer het over een paar minuten nog eens.",
  dagLimiet: "Pas op mijn foto heeft vandaag al veel gebruikers gehad. Probeer het morgen nog eens, of gebruik de 3D-paspop.",
  mislukt: "Het aanpassen is niet gelukt. Probeer het nog eens, of kies een andere foto.",
} as const;
