import { z } from "zod";

// ---------------------------------------------------------------------------
// Wat de browser terugstuurt (de JSON-vorm van PublicKeyCredential, zie
// lib/auth/passkey/browser.ts), streng gelezen: alleen base64url en met een
// bovengrens per veld, zodat een enorme of rare invoer niet eens bij de CBOR-
// lezer komt.
// ---------------------------------------------------------------------------

const b64u = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+$/, "geen base64url");

/** Transports die we bewaren (andere waarden negeren we). */
export const TRANSPORTS = ["usb", "nfc", "ble", "internal", "hybrid", "smart-card"] as const;

export const registratieJson = z.object({
  id: b64u(1400),
  rawId: b64u(1400),
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: b64u(16_000),
    attestationObject: b64u(64_000),
    transports: z.array(z.string().max(20)).max(10).optional(),
  }),
});
export type RegistratieJson = z.infer<typeof registratieJson>;

export const inlogJson = z.object({
  id: b64u(1400),
  rawId: b64u(1400),
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: b64u(16_000),
    authenticatorData: b64u(8_000),
    signature: b64u(2_000),
    userHandle: b64u(200).nullable().optional(),
  }),
});
export type InlogJson = z.infer<typeof inlogJson>;

export const vanB64u = (s: string): Buffer => Buffer.from(s, "base64url");

/** Alleen transports die we kennen, zonder dubbele. */
export function netteTransports(lijst: readonly string[] | undefined): string[] {
  const bekend = new Set<string>(TRANSPORTS);
  return [...new Set((lijst ?? []).filter((t) => bekend.has(t)))];
}
