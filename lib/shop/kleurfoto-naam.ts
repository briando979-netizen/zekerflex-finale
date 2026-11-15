// ---------------------------------------------------------------------------
// Een foto per kleur in de webshop (15 nov 2026): klik je op een kleur, dan toont de productpagina de foto in die kleur.
// Puur: hoe het bestand heet en welk stipje bij een kleur hoort. Welke foto's er echt zijn: lib/shop/kleurfoto.ts.
//
// Een kleurfoto staat in public/shop als <basis>-<kleur>.jpg. De basis is de hoofdfoto zonder "-1.jpg"
// (/shop/chino-broek-1.jpg → /shop/chino-broek-marineblauw.jpg), of het webadres van het product als het geen foto
// heeft (/shop/thermo-bodywarmer-unisex-zwart.jpg). Maken: scripts/shop-kleurfotos.mjs.
// ---------------------------------------------------------------------------

/** "Licht blauw" → "licht-blauw", "Écru" → "ecru". */
export function kleurSlug(kleur: string): string {
  return kleur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Waar een kleurfoto kan staan (in deze volgorde): naast de hoofdfoto, of onder het webadres van het product. */
export function kleurFotoKandidaten(slug: string, imageUrl: string | null, kleur: string): string[] {
  const k = kleurSlug(kleur);
  if (!k) return [];
  const uit: string[] = [];
  const m = imageUrl ? /^\/shop\/([a-z0-9-]+?)(?:-\d+)?\.(?:jpe?g|png|webp)$/i.exec(imageUrl) : null;
  if (m) uit.push(`/shop/${m[1]}-${k}.jpg`);
  if (/^[a-z0-9-]+$/.test(slug)) uit.push(`/shop/${slug}-${k}.jpg`);
  return [...new Set(uit)];
}

/** Een stipje bij de kleurknop; onbekende kleuren krijgen geen stip (alleen de naam). */
const KLEUR_HEX: Record<string, string> = {
  wit: "#FFFFFF",
  ecru: "#F3EEDF",
  beige: "#E5D7BE",
  lichtblauw: "#CFE2F0",
  blauw: "#2F5DA8",
  marineblauw: "#26345A",
  navy: "#26345A",
  khaki: "#C4A874",
  bruin: "#7A5434",
  grijs: "#6B6B72",
  lichtgrijs: "#C9C9CE",
  antraciet: "#3A3B40",
  zwart: "#1F1F23",
  mintgroen: "#CDEEE0",
  groen: "#2E7D4F",
  rood: "#C8323C",
  oranje: "#E8772E",
  geel: "#F2C230",
  roze: "#F1A7C0",
  paars: "#6E4A9E",
};

export function kleurStip(kleur: string): string | null {
  const k = kleurSlug(kleur).replace(/-/g, "");
  return Object.hasOwn(KLEUR_HEX, k) ? (KLEUR_HEX[k] ?? null) : null;
}
