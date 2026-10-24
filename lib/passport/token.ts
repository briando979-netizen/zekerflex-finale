import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Deelbare, niet-raadbare token voor een werkpaspoort. We tekenen de userId met
// een HMAC (AUTH_SECRET) zodat alleen door ZekerFlex uitgegeven links werken —
// de publieke pagina kan de userId niet vinden door te raden/enumereren. Het
// token onthult de userId niet in leesbare vorm aan wie 'm niet al heeft.
// ---------------------------------------------------------------------------

function secret(): string {
  return env.AUTH_SECRET ?? "dev-secret";
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(`passport:${data}`).digest("base64url").slice(0, 24);
}

export function passportToken(userId: string): string {
  const data = Buffer.from(userId, "utf8").toString("base64url");
  return `${data}.${sign(data)}`;
}

export function userIdFromToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = sign(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const id = Buffer.from(data, "base64url").toString("utf8");
    return id.length > 0 && id.length < 64 ? id : null;
  } catch {
    return null;
  }
}
