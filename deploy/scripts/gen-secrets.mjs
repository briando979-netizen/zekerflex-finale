#!/usr/bin/env node
// Generate the production secrets and print them ready to paste into
// .env.production. Writes nothing, touches nothing.
//
//   node deploy/scripts/gen-secrets.mjs

import { randomBytes } from "node:crypto";
import { webcrypto } from "node:crypto";

const b64 = (n) => randomBytes(n).toString("base64");
const b64url = (buf) => Buffer.from(buf).toString("base64url");

async function vapid() {
  const kp = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pubRaw = await webcrypto.subtle.exportKey("raw", kp.publicKey);
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.privateKey);
  return { publicKey: b64url(pubRaw), privateKey: jwk.d };
}

const v = await vapid();

console.log(`
# --- paste into .env.production -------------------------------------------
AUTH_SECRET=${b64(48)}
INTERNAL_CRON_TOKEN=${b64(24)}
POSTGRES_PASSWORD=${b64(24).replace(/[+/=]/g, "").slice(0, 28)}
WEBPUSH_VAPID_PUBLIC_KEY=${v.publicKey}
WEBPUSH_VAPID_PRIVATE_KEY=${v.privateKey}
# -------------------------------------------------------------------------

Reminder: also set DATABASE_URL with the same POSTGRES_PASSWORD, and paste your
CLOUDFLARE_TUNNEL_TOKEN from the Cloudflare dashboard.
`);
