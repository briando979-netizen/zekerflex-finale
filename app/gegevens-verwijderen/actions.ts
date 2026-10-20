"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { sendMail } from "@/lib/mail";
import { CONTACTS } from "@/lib/seo";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

export interface DataDeletionState {
  done: boolean;
  error: string | null;
}

const DATA_KINDS = {
  id: "ID-foto's en selfie van de verificatie",
  chat: "Chatberichten",
  location: "Locatiegegevens (GPS-check-ins)",
  profile: "Profielfoto, werkervaring en certificaten",
  marketing: "Gegevens voor nieuwsbrief en marketingmails",
  analytics: "Anonieme gebruiksstatistiek gekoppeld aan mijn account",
  other: "Iets anders (zie toelichting)",
} as const;

const schema = z.object({
  email: z.string().trim().email(),
  kinds: z.array(z.enum(Object.keys(DATA_KINDS) as [keyof typeof DATA_KINDS, ...(keyof typeof DATA_KINDS)[]])).min(1),
  note: z.string().trim().max(1500).optional(),
});

/**
 * Request deletion of specific personal data while keeping the account
 * (Google Play "data deletion" link). Lands with the privacy team, who verify
 * the requester (reply from the account's own address) and act within the
 * AVG term of one month. Nothing is deleted automatically from this form.
 */
export async function requestDataDeletionAction(_prev: DataDeletionState, formData: FormData): Promise<DataDeletionState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    kinds: formData.getAll("kinds"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { done: false, error: "Vul je e-mailadres in en kies minstens één soort gegevens." };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "onbekend";
  try {
    await enforceRateLimit({ name: "data-deletion", identifier: ip, limit: 5, windowSeconds: 3600, message: "Te veel verzoeken — probeer het over een uur opnieuw." });
  } catch (err) {
    return { done: false, error: (err as Error).message };
  }

  const { email, kinds, note } = parsed.data;
  const list = kinds.map((k) => `- ${DATA_KINDS[k]}`).join("\n");
  const ref = `GV-${Date.now().toString(36).toUpperCase()}`;
  await sendMail({
    to: CONTACTS.privacy,
    subject: `Verzoek gegevens verwijderen (${ref}) — ${email}`,
    text: `Verzoek via www.zekerflex.com/gegevens-verwijderen\n\nE-mailadres account: ${email}\nReferentie: ${ref}\n\nTe verwijderen:\n${list}\n\nToelichting:\n${note ?? "(geen)"}\n\nControleer eerst dat het verzoek van de accounthouder komt (de bevestigingsmail ging naar dit adres) en handel af binnen één maand (AVG art. 12 lid 3). Wettelijk te bewaren gegevens (facturen, loonadministratie, KVK/btw, IBAN) blijven bewaard.`,
    kind: "support",
    replyTo: email,
  }).catch(() => undefined);
  await sendMail({
    to: email,
    subject: `We hebben je verzoek ontvangen (${ref})`,
    text: `Hoi,\n\nWe hebben je verzoek ontvangen om de volgende gegevens te verwijderen, terwijl je account blijft bestaan:\n${list}\n\nWas jij dit niet? Dan hoef je niets te doen — we verwijderen niets zonder dat we zeker weten dat het verzoek van jou komt. Antwoord op deze mail om je verzoek te bevestigen; we handelen het binnen één maand af en laten je weten wat er verwijderd is.\n\nSommige gegevens moeten we wettelijk bewaren (bijvoorbeeld facturen, loonadministratie en je bankrekeningnummer). Die blijven bewaard zolang de wet dat vraagt.\n\nTeam ZekerFlex — ${CONTACTS.privacy}`,
    kind: "support",
    replyTo: CONTACTS.privacy,
  }).catch(() => undefined);
  await recordAudit({ category: "SECURITY", action: "privacy.data_deletion_requested", actorLabel: "public-form", summary: `Verzoek gegevens verwijderen ${ref} (${kinds.join(", ")})`, metadata: { ref, kinds } }).catch(() => undefined);
  return { done: true, error: null };
}
