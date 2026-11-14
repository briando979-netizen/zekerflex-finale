// ---------------------------------------------------------------------------
// Stickers in de chat (15 nov 2026), zoals in WhatsApp, maar een eigen set: geen GIF-dienst of andere bron van buiten
// (de eigenaar wil niets betalen en niets van derden). De plaatjes staan in public/chat-stickers/<id>.svg (alleen vormen,
// geen tekst: dan werken ze in alle vijf talen); de naam voor schermlezers staat in de chatteksten (stickerNamen).
// Een bericht bewaart alleen het id; de server neemt alleen een id uit deze vaste lijst aan (Object.hasOwn, AGENTS.md).
// ---------------------------------------------------------------------------

/** Vaste lijst: id → Nederlandse naam (voor de server: voorvertoning en zoeken). */
export const STICKERS = {
  duim: "Duim omhoog",
  hart: "Hartje",
  ster: "Top!",
  klaar: "Klaar!",
  lach: "Haha",
  wow: "Wow",
  sorry: "Sorry",
  bloem: "Bedankt",
  koffie: "Koffie?",
  onderweg: "Onderweg",
  helm: "Aan het werk",
  klok: "Even geduld",
  feest: "Feest!",
  zon: "Goedemorgen",
  maan: "Welterusten",
} as const;

export type StickerId = keyof typeof STICKERS;

/** In de volgorde van de kiezer. */
export const STICKER_IDS = Object.keys(STICKERS) as StickerId[];

export function isSticker(v: unknown): v is StickerId {
  return typeof v === "string" && Object.hasOwn(STICKERS, v);
}

export function stickerSrc(id: StickerId): string {
  return `/chat-stickers/${id}.svg`;
}
