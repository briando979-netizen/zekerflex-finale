// Puur hulpbestand (geen zod of server): ook de browser (LeerlingenTab, LesScherm) mag dit laden. lib/rijschool/website.ts geeft het opnieuw door.
/** "06 12345678" → "31612345678" voor wa.me; null als het geen bruikbaar nummer is. */
export function whatsappNummer(s: string): string | null {
  const cijfers = s.replace(/[^0-9+]/g, "").replace(/^\+/, "");
  if (/^0[1-9][0-9]{8}$/.test(cijfers)) return `31${cijfers.slice(1)}`;
  if (/^31[1-9][0-9]{8}$/.test(cijfers)) return cijfers;
  return null;
}
