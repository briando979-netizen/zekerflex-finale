// Wie eigenaar wordt als de eigenaar de groep verlaat (zoals WhatsApp): de beheerder die het langst lid is, anders het
// lid dat het langst lid is. Puur; gelijk aan leaveCommunity in lib/communities/store.ts, zodat het venster vooraf kan
// zeggen wie het wordt.
export function opvolgerVan(members: { userId: string; role: string; joinedAt?: string }[], ownerId: string): string | null {
  const rest = members.filter((m) => m.userId !== ownerId).sort((a, b) => (a.joinedAt ?? "").localeCompare(b.joinedAt ?? ""));
  return (rest.find((m) => m.role === "admin") ?? rest[0])?.userId ?? null;
}
