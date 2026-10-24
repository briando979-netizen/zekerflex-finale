import { createHash, createHmac } from "node:crypto";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Geavanceerd elektronisch zegel over een werkpaspoort (zelfde aanpak als het
// modelovereenkomst-zegel in lib/agreements/esign.ts). Het zegel bewijst de
// echtheid van door ZekerFlex uitgegeven paspoortgegevens: een sha256 over de
// canonieke inhoud + een server-HMAC. Verifiëren = de huidige gegevens opnieuw
// hashen en vergelijken. Omdat een paspoort meegroeit met het werk is dit een
// echtheidsbewijs ("uitgegeven door ZekerFlex"), geen onveranderlijkheids-
// garantie: de referentie is stabiel per persoon, de inhoudshash verandert mee.
// ---------------------------------------------------------------------------

export interface PassportSeal {
  reference: string; // ZF-PAS-xxxxxxxx (stabiel per persoon)
  contentHash: string; // sha256 van de canonieke inhoud
  serverSeal: string; // HMAC(contentHash)
  sealedAt: string; // ISO
  issuer: string;
}

function secret(): string {
  return env.AUTH_SECRET ?? "dev-secret";
}

export function passportReference(userId: string): string {
  const h = createHash("sha256").update(`passport-ref:${userId}`).digest("hex");
  return `ZF-PAS-${h.slice(0, 8).toUpperCase()}`;
}

export function sealPassport(userId: string, canonical: string): PassportSeal {
  const contentHash = createHash("sha256").update(canonical).digest("hex");
  const serverSeal = createHmac("sha256", secret()).update(`${contentHash}`).digest("base64url").slice(0, 32);
  return {
    reference: passportReference(userId),
    contentHash,
    serverSeal,
    sealedAt: new Date().toISOString(),
    issuer: "ZekerFlex",
  };
}
