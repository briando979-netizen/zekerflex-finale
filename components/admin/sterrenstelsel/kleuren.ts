// De kleuren van de thema's van de Kennisgraaf, gedeeld door de vlakke grafiek (KnowledgeGraph.tsx)
// en het Sterrenstelsel (sterrenstelsel/scene.ts): twaalf tinten die op een donkere achtergrond uit
// elkaar te houden zijn. Puur bestand, zonder imports.

export const THEMA_KLEUREN = ["#4FE0A0", "#7CC5FF", "#FFC46B", "#C9A5FF", "#F5B9AE", "#73D2C0", "#F2E36B", "#FF9DC6", "#9EE6C9", "#B6C2CC", "#FFA07A", "#8FD3FF"] as const;

/** De kleur van een thema (1-based); zonder thema grijs. */
export function themaKleur(thema: number | undefined): string {
  if (thema === undefined) return "#8A938C";
  return THEMA_KLEUREN[(thema - 1) % THEMA_KLEUREN.length] ?? "#8A938C";
}
