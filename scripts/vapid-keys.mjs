// Generate a VAPID keypair for self-hosted Web Push.
//   node scripts/vapid-keys.mjs
// Copy the two lines into your .env (never commit the private key).
import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();

const publicKey = ecdh.getPublicKey().toString("base64url"); // 65 bytes
const privateKey = ecdh.getPrivateKey().toString("base64url"); // 32 bytes

console.log("# Web Push VAPID keypair - add to .env");
console.log(`WEBPUSH_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`WEBPUSH_VAPID_PRIVATE_KEY=${privateKey}`);
console.log("");
console.log("# The public key also goes to the browser client:");
console.log(`#   applicationServerKey = "${publicKey}"`);
