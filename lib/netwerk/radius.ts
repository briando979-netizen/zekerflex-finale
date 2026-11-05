import { prisma } from "@/lib/prisma";
import { moduleActief } from "@/lib/netwerk/modules";
import { netwerkStand, radiusClientVoorIp, wifiWachtwoord } from "@/lib/netwerk/store";

// ---------------------------------------------------------------------------
// Mag deze persoon nu wifi op deze vestiging? De RADIUS-server vraagt het per
// inlogpoging (app/api/netwerk/radius/authorize). De regels:
//   - het verzoek komt van een IP dat bij een vestiging hoort, en die vestiging
//     staat aan en het wifi-pakket van het bedrijf is actief;
//   - een eigen medewerker (lid van het bedrijf in ZekerFlex) mag altijd;
//   - een flexwerker mag als hij op die vestiging ingepland staat: vanaf een
//     half uur vóór het begin tot een half uur ná het einde van zijn dienst.
// Het antwoord bevat het eigen wifi-wachtwoord van de gebruiker (de RADIUS-
// server controleert daarmee het wachtwoord dat het apparaat stuurt) en hoe
// lang de sessie mag duren, zodat de wifi vanzelf stopt na de dienst.
// ---------------------------------------------------------------------------

export const MARGE_MINUTEN = 30;
const MEDEWERKER_SESSIE_SEC = 12 * 3600;

export type WifiToegang =
  | { ok: true; soort: "medewerker" | "flexwerker"; naam: string; wachtwoord: string; sessieSeconden: number; tenantId: string; branchId: string }
  | { ok: false; reden: "onbekend-netwerk" | "wifi-uit" | "onbekende-gebruiker" | "geen-dienst" };

export async function wifiToegang(input: { gebruiker: string; nasIp: string; nu?: Date }): Promise<WifiToegang> {
  const nu = input.nu ?? new Date();
  const client = await radiusClientVoorIp(input.nasIp);
  if (!client) return { ok: false, reden: "onbekend-netwerk" };
  const stand = await netwerkStand(client.tenantId);
  if (!client.aan || !moduleActief(stand, "wifi")) return { ok: false, reden: "wifi-uit" };

  const email = input.gebruiker.trim().toLowerCase();
  if (!email || email.length > 254) return { ok: false, reden: "onbekende-gebruiker" };
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      fullName: true,
      memberships: { where: { tenantId: client.tenantId }, select: { id: true }, take: 1 },
      freelancerProfile: { select: { id: true } },
    },
  });
  if (!user) return { ok: false, reden: "onbekende-gebruiker" };

  if (user.memberships.length > 0) {
    return { ok: true, soort: "medewerker", naam: user.fullName, wachtwoord: await wifiWachtwoord(user.id), sessieSeconden: MEDEWERKER_SESSIE_SEC, ...client };
  }
  if (!user.freelancerProfile) return { ok: false, reden: "geen-dienst" };

  const marge = MARGE_MINUTEN * 60_000;
  const dienst = await prisma.shiftAssignment.findFirst({
    where: {
      freelancerId: user.freelancerProfile.id,
      cancelledAt: null,
      shift: {
        branchId: client.branchId,
        status: { notIn: ["DRAFT", "CANCELLED"] },
        startsAt: { lte: new Date(nu.getTime() + marge) },
        endsAt: { gte: new Date(nu.getTime() - marge) },
      },
    },
    select: { shift: { select: { endsAt: true } } },
    orderBy: { shift: { endsAt: "desc" } },
  });
  if (!dienst) return { ok: false, reden: "geen-dienst" };
  const sessieSeconden = Math.max(60, Math.round((dienst.shift.endsAt.getTime() + marge - nu.getTime()) / 1000));
  return { ok: true, soort: "flexwerker", naam: user.fullName, wachtwoord: await wifiWachtwoord(user.id), sessieSeconden, ...client };
}

export const REDEN_TEKST: Record<Extract<WifiToegang, { ok: false }>["reden"], string> = {
  "onbekend-netwerk": "Dit netwerk is niet aan een vestiging gekoppeld.",
  "wifi-uit": "Het wifi-pakket van dit bedrijf staat uit.",
  "onbekende-gebruiker": "Geen ZekerFlex-account met dit e-mailadres.",
  "geen-dienst": "Geen dienst op deze vestiging op dit moment.",
};
