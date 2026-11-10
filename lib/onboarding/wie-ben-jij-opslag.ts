import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { getFiscal, setFiscal } from "@/lib/fiscal/store";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { naamIsVast, updatePersonalInfo } from "@/lib/profile/personal";
import { schoonOpleiding, type Opleiding } from "@/lib/onboarding/opleiding";
import {
  controleerPersoon,
  isLandnummer,
  persoonKlaar,
  splitNaam,
  splitTelefoon,
  telefoonNaarE164,
  voegNaam,
  type PersoonGegevens,
} from "@/lib/onboarding/wie-ben-jij";

// ---------------------------------------------------------------------------
// Opslag van "Hey! Wie ben jij?" (stap 1 van /dashboard/verificatie), zonder
// schemawijziging:
//  - naam: User.fullName (voornaam en achternaam apart in het scherm, samengesteld
//    opgeslagen); een naam die met een identiteitsbewijs is bevestigd, blijft vast
//    (lib/profile/personal.ts), zoals nu;
//  - telefoon: User.phone als E.164 (de spoedoproepen en sms lezen dit nummer);
//  - geboortedatum: de fiscale gegevens (lib/fiscal/store.ts, birthDate);
//  - opleiding: KV "werker-opleiding:<userId>" (optioneel, nooit een eis voor de poort).
// ---------------------------------------------------------------------------

const opleidingSleutel = (userId: string) => `werker-opleiding:${userId}`;

export interface WieBenJijStand extends PersoonGegevens {
  opleiding: Opleiding | null;
  /** de naam is met een identiteitsbewijs bevestigd en staat vast */
  naamVast: boolean;
  /** stap 1 is af: naam, geboortedatum (18+) en telefoon kloppen */
  klaar: boolean;
}

export async function leesWieBenJij(userId: string): Promise<WieBenJijStand> {
  const [user, fiscal, opleiding] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, phone: true, kycStatus: true } }),
    getFiscal(userId).catch(() => null),
    kvGet<unknown>(opleidingSleutel(userId)).catch(() => null),
  ]);
  const { voornaam, achternaam } = splitNaam(user?.fullName);
  const tel = splitTelefoon(user?.phone);
  const gegevens: PersoonGegevens = {
    voornaam,
    achternaam,
    geboortedatum: fiscal?.birthDate ?? "",
    landnummer: tel.landnummer,
    telefoon: tel.nummer,
  };
  return {
    ...gegevens,
    opleiding: schoonOpleiding(opleiding),
    naamVast: user ? await naamIsVast(userId, user.kycStatus) : false,
    klaar: persoonKlaar(gegevens),
  };
}

export interface WieBenJijInvoer extends PersoonGegevens {
  /** undefined = laten staan, null = wissen */
  opleiding?: Opleiding | null | undefined;
}

/** Controleert met dezelfde regels als het scherm en bewaart; geeft de bewaarde stand terug. */
export async function bewaarWieBenJij(userId: string, invoer: WieBenJijInvoer): Promise<WieBenJijStand> {
  if (!isLandnummer(invoer.landnummer)) throw AppError.validation("Kies een landnummer uit de lijst.", { veld: "telefoon" });
  const fouten = controleerPersoon(invoer);
  const eerste = Object.entries(fouten)[0];
  if (eerste) {
    const [veld, reden] = eerste;
    const bericht =
      reden === "onder18" ? "Je moet minimaal 18 jaar zijn om via ZekerFlex te werken." : "Controleer de ingevulde gegevens.";
    throw AppError.validation(bericht, { veld, reden });
  }
  const telefoon = telefoonNaarE164(invoer.landnummer, invoer.telefoon);
  if (!telefoon) throw AppError.validation("Vul een geldig telefoonnummer in.", { veld: "telefoon", reden: "telefoon" });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, kycStatus: true } });
  if (!user) throw AppError.notFound("Account niet gevonden.");
  // een bevestigde naam blijft staan: alleen telefoon en geboortedatum worden dan bijgewerkt
  const vast = await naamIsVast(userId, user.kycStatus);
  await updatePersonalInfo(userId, { fullName: vast ? user.fullName : voegNaam(invoer.voornaam, invoer.achternaam), phone: telefoon });
  await setFiscal(userId, { birthDate: invoer.geboortedatum });

  if (invoer.opleiding === null) await kvDelete(opleidingSleutel(userId)).catch(() => undefined);
  else if (invoer.opleiding) {
    const schoon = schoonOpleiding(invoer.opleiding);
    if (schoon) await kvSet(opleidingSleutel(userId), { ...schoon, bijgewerkt: new Date().toISOString() });
  }
  return leesWieBenJij(userId);
}
