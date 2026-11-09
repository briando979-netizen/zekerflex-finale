// ---------------------------------------------------------------------------
// Browserkant van passkeys (puur: geen prisma, kv, zod of node-modules).
// De server geeft opties als JSON met base64url; de WebAuthn-API wil
// ArrayBuffers, en het antwoord gaat weer als JSON terug. We zetten dat zelf
// om in plaats van PublicKeyCredential.parseCreationOptionsFromJSON/toJSON,
// want oudere Safari- en Android-versies kennen die nog niet.
// ---------------------------------------------------------------------------

export function vanB64u(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function naarB64u(buf: ArrayBuffer | ArrayBufferView): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Kan deze browser überhaupt passkeys (WebAuthn)? */
export function kanPasskeys(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function" && Boolean(navigator.credentials);
}

/** Kan de browser een passkey voorstellen in het e-mailveld (conditional UI)? */
export async function kanPasskeySuggestie(): Promise<boolean> {
  if (!kanPasskeys()) return false;
  const pkc = window.PublicKeyCredential as unknown as { isConditionalMediationAvailable?: () => Promise<boolean> };
  try {
    return typeof pkc.isConditionalMediationAvailable === "function" && (await pkc.isConditionalMediationAvailable());
  } catch {
    return false;
  }
}

export interface AanmaakOptiesJson {
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout: number;
  attestation: AttestationConveyancePreference;
  authenticatorSelection: AuthenticatorSelectionCriteria;
  excludeCredentials: { type: "public-key"; id: string; transports: string[] }[];
}

export interface InlogOptiesJson {
  challenge: string;
  rpId: string;
  timeout: number;
  userVerification: UserVerificationRequirement;
  allowCredentials: { type: "public-key"; id: string; transports?: string[] }[];
}

export function naarAanmaakOpties(o: AanmaakOptiesJson): PublicKeyCredentialCreationOptions {
  return {
    rp: o.rp,
    user: { id: vanB64u(o.user.id), name: o.user.name, displayName: o.user.displayName },
    challenge: vanB64u(o.challenge),
    pubKeyCredParams: o.pubKeyCredParams,
    timeout: o.timeout,
    attestation: o.attestation,
    authenticatorSelection: o.authenticatorSelection,
    excludeCredentials: o.excludeCredentials.map((c) => ({ type: c.type, id: vanB64u(c.id), transports: c.transports as AuthenticatorTransport[] })),
  };
}

export function naarInlogOpties(o: InlogOptiesJson): PublicKeyCredentialRequestOptions {
  return {
    challenge: vanB64u(o.challenge),
    rpId: o.rpId,
    timeout: o.timeout,
    userVerification: o.userVerification,
    allowCredentials: o.allowCredentials.map((c) => ({ type: c.type, id: vanB64u(c.id), ...(c.transports ? { transports: c.transports as AuthenticatorTransport[] } : {}) })),
  };
}

/** Het antwoord van navigator.credentials.create als JSON voor de server. */
export function registratieNaarJson(cred: PublicKeyCredential) {
  const r = cred.response as AuthenticatorAttestationResponse;
  const transports = typeof r.getTransports === "function" ? r.getTransports() : [];
  return {
    id: naarB64u(cred.rawId),
    rawId: naarB64u(cred.rawId),
    type: "public-key" as const,
    response: { clientDataJSON: naarB64u(r.clientDataJSON), attestationObject: naarB64u(r.attestationObject), transports },
  };
}

/** Het antwoord van navigator.credentials.get als JSON voor de server. */
export function inlogNaarJson(cred: PublicKeyCredential) {
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: naarB64u(cred.rawId),
    rawId: naarB64u(cred.rawId),
    type: "public-key" as const,
    response: {
      clientDataJSON: naarB64u(r.clientDataJSON),
      authenticatorData: naarB64u(r.authenticatorData),
      signature: naarB64u(r.signature),
      userHandle: r.userHandle ? naarB64u(r.userHandle) : null,
    },
  };
}

/** De naam van de DOMException (NotAllowedError = geannuleerd of te laat, InvalidStateError = staat al op dit toestel). */
export function foutNaam(err: unknown): string {
  return err && typeof err === "object" && "name" in err && typeof (err as { name: unknown }).name === "string" ? (err as { name: string }).name : "";
}

/**
 * Vertel de passkey-beheerder van het toestel dat deze passkey bij ons niet
 * (meer) bestaat, zodat hij hem kan opruimen. Alleen waar de browser dat kent.
 */
export function meldOnbekendePasskey(rpId: string, credentialId: string): void {
  const pkc = window.PublicKeyCredential as unknown as { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> };
  if (typeof pkc?.signalUnknownCredential !== "function") return;
  pkc.signalUnknownCredential({ rpId, credentialId }).catch(() => undefined);
}
