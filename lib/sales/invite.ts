import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Account-uitnodiging voor een bedrijf, verstuurd door een buitendienst-rep na
// een bezoek. Een korte, ondertekende token die het bedrijf naar een
// voor-ingevuld registratieformulier brengt. Geen DB-tabel — de token draagt
// alles en verloopt na 14 dagen.
// ---------------------------------------------------------------------------

const ISSUER = "zekerflex.sales-invite";
const TTL_DAYS = 14;

function key(): Uint8Array {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export interface EmployerInvite {
  leadId: string;
  companyName: string;
  kvkNumber?: string | undefined;
  contactName?: string | undefined;
  contactEmail?: string | undefined;
  repName: string;
}

export async function signEmployerInvite(payload: EmployerInvite): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(`${TTL_DAYS}d`)
    .sign(key());
}

export async function verifyEmployerInvite(token: string): Promise<EmployerInvite | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER });
    if (typeof payload.leadId !== "string" || typeof payload.companyName !== "string") return null;
    return {
      leadId: payload.leadId,
      companyName: payload.companyName,
      kvkNumber: typeof payload.kvkNumber === "string" ? payload.kvkNumber : undefined,
      contactName: typeof payload.contactName === "string" ? payload.contactName : undefined,
      contactEmail: typeof payload.contactEmail === "string" ? payload.contactEmail : undefined,
      repName: typeof payload.repName === "string" ? payload.repName : "je ZekerFlex-contactpersoon",
    };
  } catch {
    return null;
  }
}

export function inviteUrl(token: string): string {
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/uitnodiging/bedrijf?token=${encodeURIComponent(token)}`;
}
