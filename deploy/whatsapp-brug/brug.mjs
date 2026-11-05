// ---------------------------------------------------------------------------
// ZekerFlex WhatsApp-brug: een klein containertje met een eigen WhatsApp-nummer
// (via Baileys, het open WhatsApp Web-protocol). Twee taken:
//   1. POST /stuur {naar, tekst}  → een bericht versturen (spoedoproepen)
//   2. een binnengekomen bericht → doorgeven aan de app
//      (POST APP_URL/api/whatsapp/inkomend) en het antwoord terugsturen
// Alles achter één gedeelde sleutel (BRUG_TOKEN), alleen op het interne
// Docker-netwerk. Koppelen: de QR-code staat in het log (docker compose logs)
// en op GET /qr. De sessie staat in AUTH_DIR (volume), dus na een herstart
// hoeft er niet opnieuw gescand te worden.
// ---------------------------------------------------------------------------

import http from "node:http";
import { mkdirSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, useMultiFileAuthState } from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

const TOKEN = process.env.BRUG_TOKEN ?? "";
const APP_URL = (process.env.APP_URL ?? "http://app:3000").replace(/\/+$/, "");
const PORT = Number(process.env.PORT ?? 3900);
const AUTH_DIR = process.env.AUTH_DIR ?? "/data/auth";
if (!TOKEN || TOKEN.length < 16) {
  console.error("BRUG_TOKEN ontbreekt of is te kort (minstens 16 tekens).");
  process.exit(1);
}
mkdirSync(AUTH_DIR, { recursive: true });

const log = pino({ level: process.env.LOG_LEVEL ?? "warn" });
let sock = null;
let verbonden = false;
let nummer = null;
let laatsteQr = null;
let gezien = new Set();

const jidVan = (naar) => `${String(naar).replace(/\D/g, "")}@s.whatsapp.net`;
const nummerVan = (jid) => `+${String(jid).split("@")[0].split(":")[0]}`;

async function start() {
  // Baileys noemt dit een "use…"-functie, maar het is geen React-hook.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, log) },
    logger: log,
    printQRInTerminal: false,
    browser: ["ZekerFlex", "Chrome", "1.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (u) => {
    if (u.qr) {
      laatsteQr = u.qr;
      console.log("\nScan deze QR-code met WhatsApp (Instellingen → Gekoppelde apparaten → Apparaat koppelen):\n");
      qrcode.generate(u.qr, { small: true });
    }
    if (u.connection === "open") {
      verbonden = true;
      laatsteQr = null;
      nummer = sock.user?.id ? nummerVan(sock.user.id) : null;
      console.log(`WhatsApp verbonden als ${nummer ?? "onbekend nummer"}.`);
    }
    if (u.connection === "close") {
      verbonden = false;
      const code = u.lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error("WhatsApp heeft dit apparaat uitgelogd. Verwijder het volume en koppel opnieuw.");
        return;
      }
      console.warn(`Verbinding weg (code ${code ?? "?"}), opnieuw verbinden over 5 s…`);
      setTimeout(() => start().catch((e) => console.error("herstart mislukt", e)), 5000);
    }
  });
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      try {
        const jid = m.key?.remoteJid ?? "";
        if (m.key?.fromMe || !jid.endsWith("@s.whatsapp.net")) continue; // geen groepen, geen eigen berichten
        if (m.key?.id && gezien.has(m.key.id)) continue;
        if (m.key?.id) {
          gezien.add(m.key.id);
          if (gezien.size > 2000) gezien = new Set([...gezien].slice(-1000));
        }
        const tekst = m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? "";
        if (!tekst.trim()) continue;
        const res = await fetch(`${APP_URL}/api/whatsapp/inkomend`, {
          method: "POST",
          headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ van: nummerVan(jid), tekst: tekst.slice(0, 2000) }),
          signal: AbortSignal.timeout(20_000),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok && d && typeof d.antwoord === "string" && d.antwoord) {
          await sock.sendMessage(jid, { text: d.antwoord });
        }
      } catch (e) {
        console.warn("inkomend bericht niet verwerkt:", e instanceof Error ? e.message : e);
      }
    }
  });
}

function sleutelKlopt(req) {
  const h = req.headers.authorization ?? "";
  const gegeven = h.startsWith("Bearer ") ? h.slice(7) : "";
  const a = Buffer.from(TOKEN);
  const b = Buffer.from(gegeven);
  return a.length === b.length && timingSafeEqual(a, b);
}

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    if (!sleutelKlopt(req)) return json(res, 403, { fout: "niet toegestaan" });
    const url = new URL(req.url ?? "/", "http://brug");
    if (req.method === "GET" && url.pathname === "/gezond") return json(res, 200, { ok: true, verbonden, nummer, wachtOpQr: Boolean(laatsteQr) });
    if (req.method === "GET" && url.pathname === "/qr") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(laatsteQr ?? (verbonden ? "al verbonden" : "nog geen QR-code; even wachten"));
    }
    if (req.method === "POST" && url.pathname === "/stuur") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 20_000) return json(res, 413, { fout: "te groot" });
      }
      let d;
      try {
        d = JSON.parse(body);
      } catch {
        return json(res, 400, { fout: "geen JSON" });
      }
      const naar = String(d?.naar ?? "").replace(/\D/g, "");
      const tekst = String(d?.tekst ?? "").slice(0, 4000);
      if (naar.length < 9 || !tekst) return json(res, 422, { fout: "naar en tekst zijn verplicht" });
      if (!verbonden || !sock) return json(res, 503, { fout: "WhatsApp is niet verbonden; scan eerst de QR-code" });
      try {
        await sock.sendMessage(jidVan(naar), { text: tekst });
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 502, { fout: e instanceof Error ? e.message : "versturen mislukt" });
      }
    }
    json(res, 404, { fout: "onbekend pad" });
  })
  .listen(PORT, "0.0.0.0", () => console.log(`WhatsApp-brug luistert op :${PORT}`));

start().catch((e) => {
  console.error("start mislukt", e);
  process.exit(1);
});
