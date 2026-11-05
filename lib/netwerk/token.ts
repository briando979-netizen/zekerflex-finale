import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// De RADIUS-server (FreeRADIUS, in een eigen container op de server) vraagt de
// app per inlogpoging of iemand wifi mag (lib/netwerk/radius.ts). Die vragen
// komen niet van een ingelogde gebruiker maar met een vaste sleutel:
// NETWERK_RADIUS_TOKEN, die alleen de app en die container kennen. Zonder
// sleutel staat de wifi-dienst uit en wijst de app elke vraag af.
// ---------------------------------------------------------------------------

export type NetwerkPoort = { ok: true } | { ok: false; status: number; message: string };

export function wifiServerKlaar(): boolean {
  return Boolean(env.NETWERK_RADIUS_TOKEN);
}

export function checkNetwerkToken(request: Request): NetwerkPoort {
  const verwacht = env.NETWERK_RADIUS_TOKEN;
  if (!verwacht) return { ok: false, status: 412, message: "De wifi-dienst is nog niet ingericht (NETWERK_RADIUS_TOKEN ontbreekt)." };
  const auth = request.headers.get("authorization");
  // rlm_rest (FreeRADIUS 3) kent geen eigen koppen: de sleutel komt dan als wachtwoord in Basic-auth
  const basis = auth?.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString("utf8").split(":").slice(1).join(":") : null;
  const gegeven = request.headers.get("x-netwerk-token") ?? (auth?.startsWith("Bearer ") ? auth.slice(7) : basis);
  if (!gegeven) return { ok: false, status: 401, message: "Geen sleutel." };
  const a = Buffer.from(gegeven);
  const b = Buffer.from(verwacht);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, status: 401, message: "Verkeerde sleutel." };
  return { ok: true };
}
