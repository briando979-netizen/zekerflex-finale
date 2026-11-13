// Rondzenden (zoals de verzendlijst van WhatsApp, 13 nov 2026): één bericht apart naar meerdere mensen. Puur, voor de
// route (app/api/inbox/rondzenden) en het venster (components/chat/RondzendModal.tsx).

/** Hooguit zoveel ontvangers in één keer. */
export const RONDZEND_MAX = 50;

export interface Kandidaat {
  userId: string;
  name: string;
}

/** Wie je kunt kiezen: je bewaarde contacten en de andere kant van je gesprekken met één persoon; elk één keer, op naam. */
export function rondzendKandidaten(
  contacten: readonly { userId: string }[],
  gesprekken: readonly { kind: string; participants: readonly string[] }[],
  ik: string,
  naamVan: (userId: string) => string | undefined,
): Kandidaat[] {
  const ids = new Set<string>([...contacten.map((c) => c.userId), ...gesprekken.filter((t) => t.kind === "direct").flatMap((t) => t.participants)]);
  ids.delete(ik);
  return [...ids]
    .map((userId) => ({ userId, name: naamVan(userId) ?? "" }))
    .filter((k) => k.name)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
}
