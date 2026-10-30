import { env } from "@/lib/env";
import { validateTwilioSignature } from "@/lib/telephony/twilio";

// Helpers voor de Twilio-webhookroutes: form-body uitlezen, de publieke URL
// reconstrueren (achter Caddy is request.url het interne adres) en de
// X-Twilio-Signature valideren.

export function readForm(text: string): Record<string, string> {
  const sp = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of sp) out[k] = v;
  return out;
}

export function publicUrl(request: Request): string {
  const u = new URL(request.url);
  return env.APP_BASE_URL.replace(/\/+$/, "") + u.pathname + u.search;
}

export function signatureValid(request: Request, params: Record<string, string>): boolean {
  return validateTwilioSignature(publicUrl(request), params, request.headers.get("x-twilio-signature"));
}

export function xmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}
