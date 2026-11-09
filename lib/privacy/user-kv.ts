import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Persoonsgegevens in de KeyValueStore (agenda, ritten, chatinstellingen,
// contacten, AI-geheugen, …). Veel modules bewaren per gebruiker een JSON-blok
// onder een sleutel met de userId erin; die vallen buiten de Prisma-modellen
// en dus buiten export.ts en anonymize.ts. Dit bestand dekt ze af:
//   - inzage (art. 15/20): elke rij waarvan de sleutel de userId bevat, met
//     inloggegevens en geheimen afgeschermd;
//   - verwijdering (art. 17): een vaste lijst sleutels zonder bewaarplicht.
//     Bewust een lijst en geen "alles met je userId": fiscale gegevens,
//     contracten en geldzaken (fiscal:, uitzend-contracts:, factoring-terms:,
//     advance-request:, bank-…) vallen onder een wettelijke bewaartermijn.
// ---------------------------------------------------------------------------

/** Sleutels (prefix + userId) die bij een verwijderverzoek direct weg mogen. */
export const ERASABLE_KV_PREFIXES = [
  "agenda:",
  "agenda-ref:",
  "agenda-mail-state:",
  "agenda-mail-scan:",
  "auth-2fa:",
  "badge-push:",
  "brain-mem:",
  "chat-bewaard:",
  "chat-prefs:",
  "chat-settings:",
  "chip-lezing:",
  "chip-sessie:",
  "companion:ctx:",
  "contacts:",
  "id-overdracht:",
  "iban-wijziging:",
  "mail-tools:",
  "mailbox-connection:",
  "mailbox-sent:",
  "mrz-lezing:",
  "nfc-fob-user:",
  "spoed-uit:",
  "spoed-wacht:",
  "notif-dismissed:",
  "onboarding-reminder:",
  "os:",
  "passkey-toevoegen:",
  "passport:public:",
  "prefs:",
  "profile-user:",
  "ritten:",
  "ritten-eigen:",
  "user-birthday:",
  "verdiendoel:",
  "volgt:",
  "wa-chat:",
  "wa-contacts:",
  "wa-msgs:",
  "werker-agenda:",
  "werker-agenda-taal:",
  "werker-taal:",
] as const;

/** Hele waarde afschermen: dit zijn (versleutelde) inloggegevens. */
const SECRET_KEY_PREFIXES = ["auth-2fa:", "mailbox-connection:"];
/** Woorden in een veldnaam (camelCase/snake_case) die op een geheim wijzen, op welke diepte ook. */
const SECRET_WORDS = new Set(["password", "passwd", "pwd", "secret", "token", "sealed", "cipher", "ciphertext", "totp", "otp", "hash", "pin", "privatekey", "apikey", "ssh", "credentials"]);
const HIDDEN = "[afgeschermd]";

/** "smtpPassword", "access_token", "apiKey", "bsnHash" → geheim; "passport", "footprint" niet. */
export function isSecretField(name: string): boolean {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.some((w, i) => SECRET_WORDS.has(w) || SECRET_WORDS.has(w + (words[i + 1] ?? "")));
}

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 12) return HIDDEN;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSecretField(k) ? HIDDEN : redactSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Of deze sleutel bij deze gebruiker hoort (userId als los segment, niet als deel van een ander id). */
export function keyBelongsTo(key: string, userId: string): boolean {
  return key.split(":").includes(userId);
}

export async function exportUserKv(userId: string): Promise<{ key: string; updatedAt: Date; value: unknown }[]> {
  if (!userId) return [];
  const rows = await prisma.keyValueStore.findMany({
    where: { key: { contains: userId } },
    select: { key: true, value: true, updatedAt: true },
    orderBy: { key: "asc" },
    take: 5000,
  });
  return rows
    .filter((r) => keyBelongsTo(r.key, userId))
    .map((r) => ({
      key: r.key,
      updatedAt: r.updatedAt,
      value: SECRET_KEY_PREFIXES.some((p) => r.key.startsWith(p)) ? HIDDEN : redactSecrets(r.value),
    }));
}

/** Prisma-filter voor de sleutels die een verwijderverzoek meteen wist. */
export function erasableKvWhere(userId: string): { OR: { key: { startsWith: string } | { equals: string } }[] } {
  return {
    OR: ERASABLE_KV_PREFIXES.flatMap((p) => [{ key: { equals: `${p}${userId}` } }, { key: { startsWith: `${p}${userId}:` } }]),
  };
}
