import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { maakKlantBeeld, volgendeStatussen, type Afspraak, type InstallatieStatus, type KlantBeeld } from "@/lib/installatie/model";
import { leesAfspraak, leesToken, type Rol } from "@/lib/installatie/store";

// Gedeelde stukken van de openbare routes /api/installatie/<code>/…: de code controleren,
// begrenzen per adres en afspraak, en wat de monteur erbovenop te zien krijgt.

const KNOP: Record<InstallatieStatus, { label: string; vraag?: string }> = {
  gepland: { label: "Toch niet vertrekken" },
  onderweg: { label: "Ik ga onderweg" },
  aangekomen: { label: "Ik ben er" },
  bezig: { label: "Start de installatie" },
  klaar: { label: "Installatie klaar" },
  geannuleerd: { label: "Afspraak annuleren", vraag: "Weet je zeker dat je deze afspraak annuleert?" },
};

export interface MonteurBeeld extends KlantBeeld {
  notitie: string;
  volgende: { naar: InstallatieStatus; label: string; vraag?: string }[];
}

export function maakMonteurBeeld(a: Afspraak, nu: Date): MonteurBeeld {
  return {
    ...maakKlantBeeld(a, nu),
    notitie: a.notitie,
    volgende: volgendeStatussen(a.status).map((naar) => ({ naar, ...KNOP[naar] })),
  };
}

/** De afspraak bij een code, met de rol. Geeft altijd dezelfde 404 bij een code die niet klopt. */
export async function laadViaCode(code: string, request: Request, soort: "lezen" | "schrijven"): Promise<{ afspraak: Afspraak; rol: Rol }> {
  const t = leesToken(code);
  if (!t) throw AppError.notFound("Deze link klopt niet of is verlopen.");
  await enforceRateLimit({
    name: soort === "lezen" ? "installatie-lezen" : "installatie-schrijven",
    identifier: `${clientIp(request)}:${t.id}`,
    limit: soort === "lezen" ? 200 : 150,
    windowSeconds: 300,
    message: "Je vraagt te vaak om een update. Wacht even en probeer het opnieuw.",
  });
  const afspraak = await leesAfspraak(t.id);
  if (!afspraak) throw AppError.notFound("Deze link klopt niet of is verlopen.");
  return { afspraak, rol: t.rol };
}

/** Een antwoord dat nooit bewaard wordt: de positie van een bus is na een paar seconden al oud. */
export const GEEN_CACHE = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" } as const;
