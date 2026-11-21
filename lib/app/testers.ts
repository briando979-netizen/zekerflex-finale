import { kvGet, kvSet } from "@/lib/storage/kv";
import { metNieuweTester, type TesterAanvraag } from "@/lib/app/testers-kern";

// De lijst met testers voor de Android-app (KV app:testers). Alleen e-mailadressen die de bezoeker zelf invulde om tester te
// worden; Beheer → Google Play toont en wist ze (lib/app/testers-kern.ts).
const KEY = "app:testers";

export async function testers(): Promise<TesterAanvraag[]> {
  return (await kvGet<TesterAanvraag[]>(KEY)) ?? [];
}

export async function voegTesterToe(email: string, now = new Date()): Promise<boolean> {
  const { lijst, nieuw } = metNieuweTester(await testers(), email, now);
  if (nieuw) await kvSet(KEY, lijst);
  return nieuw;
}

/** Alles wat nu op de lijst staat als toegevoegd markeren (na het plakken in de Play Console). */
export async function markeerAllesToegevoegd(): Promise<TesterAanvraag[]> {
  const lijst = (await testers()).map((t) => ({ ...t, toegevoegd: true }));
  await kvSet(KEY, lijst);
  return lijst;
}

export async function verwijderTester(email: string): Promise<TesterAanvraag[]> {
  const lijst = (await testers()).filter((t) => t.email !== email);
  await kvSet(KEY, lijst);
  return lijst;
}
