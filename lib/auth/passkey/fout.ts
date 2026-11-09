import { NextResponse } from "next/server";

// Een passkey-fout met een eigen code. Nooit 403: CrowdSec telt een reeks 403's
// als inbraakpoging en sluit dan het hele IP buiten (AGENTS.md).
export type PasskeyFoutStatus = 400 | 401 | 404 | 409 | 423 | 429 | 503;

export class PasskeyFout extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: PasskeyFoutStatus = 400,
  ) {
    super(message);
    this.name = "PasskeyFout";
  }
}

/** Een PasskeyFout als JSON-antwoord (zelfde vorm als lib/errors), anders null. */
export function passkeyFoutAntwoord(err: unknown): NextResponse | null {
  if (!(err instanceof PasskeyFout)) return null;
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
}
