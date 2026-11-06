import { GRATIS_DIENSTEN, type GratisDienst, type GratisStatus } from "@/lib/gratis/diensten";
import { getGratisStand } from "@/lib/ai/gratis";

// ---------------------------------------------------------------------------
// De stand per dienst: staat er een sleutel klaar, en gebruiken we die nu echt?
//
// We lezen alleen óf er iets staat (Boolean), nooit de waarde — een sleutel
// hoort nergens in een scherm of een log te staan.
// ---------------------------------------------------------------------------

export interface DienstStand extends GratisDienst {
  /** staat er voor deze dienst een sleutel klaar in de omgeving? */
  sleutel: boolean;
  /** rekent deze dienst op dit moment echt geld af? */
  kostNu: boolean;
}

function heeftSleutel(namen: string[] | undefined): boolean {
  if (!namen?.length) return false;
  return namen.some((n) => {
    const v = process.env[n];
    return typeof v === "string" && v.trim().length > 0;
  });
}

export async function dienstenStand(): Promise<{ diensten: DienstStand[]; aiGratis: boolean; kostNu: number }> {
  const stand = await getGratisStand();
  const diensten = GRATIS_DIENSTEN.map<DienstStand>((d) => {
    const sleutel = heeftSleutel(d.env);
    // de AI is de enige die we met een knop kunnen omzetten: staat die aan,
    // dan kost hij niets meer, ook al staat de betaalde sleutel er nog.
    const kostNu =
      d.id === "ai" ? !stand.aan && sleutel : (d.status === "bouwen" || d.status === "nodig") && sleutel;
    return { ...d, sleutel, kostNu };
  });
  return { diensten, aiGratis: stand.aan, kostNu: diensten.filter((d) => d.kostNu).length };
}

/** Voor de tegels: hoeveel diensten in elke stand, met de AI-knop meegerekend. */
export function telling(diensten: DienstStand[]): Record<GratisStatus | "kost", number> {
  const t: Record<GratisStatus | "kost", number> = { gratis: 0, schakelbaar: 0, bouwen: 0, nodig: 0, kost: 0 };
  for (const d of diensten) {
    t[d.status] += 1;
    if (d.kostNu) t.kost += 1;
  }
  return t;
}
