// ---------------------------------------------------------------------------
// ZekerFlex WhatsApp-brug: een klein containertje dat als "gekoppeld apparaat" aan een WhatsApp hangt (Baileys, het
// open WhatsApp Web-protocol). Sinds 15 nov 2026 (eigenaar: "de code scannen vanuit je eigen WhatsApp en de gesprekken
// live, zoals WhatsApp Web") is dat ook het eigen nummer van de eigenaar, in Admin → WhatsApp:
//   GET  /gezond                → { ok, verbonden, wachtOpQr, gesprekken }
//   GET  /qr                    → de huidige koppelcode als tekst (alleen zolang er niet gekoppeld is)
//   GET  /gesprekken            → de laatste gesprekken (nieuwste eerst)
//   GET  /gesprekken/<jid>      → de berichten van één gesprek (zet het op gelezen, alleen hier)
//   POST /stuur {jid|naar,tekst} → een bericht versturen
//   POST /uitloggen             → ontkoppelen, gesprekken wissen, nieuwe koppelcode
// Doorsturen naar de spoedoproep (POST APP_URL/api/whatsapp/inkomend) alleen met BRUG_SPOED=1: met het eigen nummer
// zou de spoedlogica anders aan gewone contacten kunnen antwoorden.
// Alles achter één gedeelde sleutel (BRUG_TOKEN), alleen op het interne Docker-netwerk. De sessie en de gesprekken
// staan in DATA_DIR (volume); geen berichtteksten of nummers in het log.
// ---------------------------------------------------------------------------

import http from "node:http";
import { mkdirSync, promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, useMultiFileAuthState } from "@whiskeysockets/baileys";
import pino from "pino";
import { isGesprekJid, lijstVan, tekstVan, tijdVan, voegToe } from "./inhoud.mjs";

const TOKEN = process.env.BRUG_TOKEN ?? "";
const APP_URL = (process.env.APP_URL ?? "http://app:3000").replace(/\/+$/, "");
const PORT = Number(process.env.PORT ?? 3900);
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const AUTH_DIR = process.env.AUTH_DIR ?? path.join(DATA_DIR, "auth");
const GESPREKKEN_BESTAND = path.join(DATA_DIR, "gesprekken.json");
const SPOED = process.env.BRUG_SPOED === "1";
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
/** contacten: jid → naam (uit het adresboek of de naam die iemand zelf koos) */
const namen = new Map();

// ---- gesprekken (in het geheugen, elke 10 s naar het volume als er iets veranderde) ----
const gesprekken = new Map();
let vuil = false;
try {
  for (const g of JSON.parse(readFileSync(GESPREKKEN_BESTAND, "utf8"))) if (isGesprekJid(g?.jid)) gesprekken.set(g.jid, g);
} catch {
  // nog niets bewaard
}
setInterval(() => {
  if (!vuil) return;
  vuil = false;
  const tmp = `${GESPREKKEN_BESTAND}.tmp`;
  fs.writeFile(tmp, JSON.stringify([...gesprekken.values()]))
    .then(() => fs.rename(tmp, GESPREKKEN_BESTAND))
    .catch((e) => console.warn("gesprekken bewaren mislukt:", e instanceof Error ? e.message : e));
}, 10_000).unref();

function bewaarBericht(m, nieuw) {
  const jid = m?.key?.remoteJid ?? "";
  if (!isGesprekJid(jid)) return;
  const tekst = tekstVan(m.message);
  if (!tekst) return;
  const naam = jid.endsWith("@g.us") ? namen.get(jid) : (namen.get(jid) ?? (!m.key.fromMe ? m.pushName : undefined));
  if (voegToe(gesprekken, { jid, id: m.key.id, vanMij: m.key.fromMe, tekst, tijd: tijdVan(m.messageTimestamp), naam }, nieuw)) vuil = true;
}

function zetNaam(jid, naam) {
  if (!isGesprekJid(jid) || !naam) return;
  namen.set(jid, naam);
  const g = gesprekken.get(jid);
  if (g && g.naam !== naam) {
    g.naam = naam;
    vuil = true;
  }
}

async function wisSessie() {
  await fs.rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});
  mkdirSync(AUTH_DIR, { recursive: true });
  gesprekken.clear();
  namen.clear();
  vuil = true;
}

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
      console.log("Koppelcode klaar: scan hem in Admin → WhatsApp (WhatsApp → Instellingen → Gekoppelde apparaten).");
    }
    if (u.connection === "open") {
      verbonden = true;
      laatsteQr = null;
      nummer = sock.user?.id ? `+${String(sock.user.id).split("@")[0].split(":")[0]}` : null;
      // alleen land en laatste 2 cijfers in het log (het volledige nummer hoort er niet in)
      console.log(`WhatsApp verbonden als ${nummer ? `${nummer.slice(0, 3)}…${nummer.slice(-2)}` : "onbekend nummer"}.`);
    }
    if (u.connection === "close") {
      verbonden = false;
      const code = u.lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        // ontkoppeld (op de telefoon of via /uitloggen): sessie en gesprekken weg, en meteen een nieuwe koppelcode
        console.warn("WhatsApp heeft dit apparaat uitgelogd; nieuwe koppelcode volgt.");
        nummer = null;
        void wisSessie().then(() => setTimeout(() => start().catch((e) => console.error("herstart mislukt", e)), 1000));
        return;
      }
      console.warn(`Verbinding weg (code ${code ?? "?"}), opnieuw verbinden over 5 s…`);
      setTimeout(() => start().catch((e) => console.error("herstart mislukt", e)), 5000);
    }
  });
  sock.ev.on("contacts.upsert", (lijst) => {
    for (const c of lijst ?? []) zetNaam(c.id, c.name || c.notify || c.verifiedName);
  });
  sock.ev.on("contacts.update", (lijst) => {
    for (const c of lijst ?? []) if (c.name || c.notify) zetNaam(c.id, c.name || c.notify);
  });
  sock.ev.on("chats.upsert", (lijst) => {
    for (const c of lijst ?? []) if (c.name) zetNaam(c.id, c.name);
  });
  sock.ev.on("groups.upsert", (lijst) => {
    for (const g of lijst ?? []) if (g.subject) zetNaam(g.id, g.subject);
  });
  // de recente geschiedenis die WhatsApp na het koppelen meestuurt
  sock.ev.on("messaging-history.set", ({ chats, contacts, messages }) => {
    for (const c of contacts ?? []) zetNaam(c.id, c.name || c.notify);
    for (const c of chats ?? []) if (c.name) zetNaam(c.id, c.name);
    for (const m of messages ?? []) bewaarBericht(m, false);
  });
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const m of messages) {
      bewaarBericht(m, type === "notify");
      if (!SPOED || type !== "notify") continue;
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
          body: JSON.stringify({ van: `+${jid.split("@")[0]}`, tekst: tekst.slice(0, 2000) }),
          signal: AbortSignal.timeout(20_000),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok && d && typeof d.antwoord === "string" && d.antwoord) await sock.sendMessage(jid, { text: d.antwoord });
      } catch (e) {
        console.warn("inkomend bericht niet doorgegeven:", e instanceof Error ? e.message : e);
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
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

async function lichaam(req, max = 20_000) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > max) throw Object.assign(new Error("te groot"), { status: 413 });
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw Object.assign(new Error("geen JSON"), { status: 400 });
  }
}

http
  .createServer(async (req, res) => {
    if (!sleutelKlopt(req)) return json(res, 403, { fout: "niet toegestaan" });
    const url = new URL(req.url ?? "/", "http://brug");
    try {
      if (req.method === "GET" && url.pathname === "/gezond")
        return json(res, 200, { ok: true, verbonden, nummer, wachtOpQr: Boolean(laatsteQr), gesprekken: gesprekken.size });
      if (req.method === "GET" && url.pathname === "/qr") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(laatsteQr ?? (verbonden ? "al verbonden" : "nog geen QR-code; even wachten"));
      }
      if (req.method === "GET" && url.pathname === "/gesprekken") return json(res, 200, { gesprekken: lijstVan(gesprekken) });
      if (req.method === "GET" && url.pathname.startsWith("/gesprekken/")) {
        const jid = decodeURIComponent(url.pathname.slice("/gesprekken/".length));
        const g = isGesprekJid(jid) ? gesprekken.get(jid) : null;
        if (!g) return json(res, 404, { fout: "gesprek niet gevonden" });
        if (g.ongelezen) {
          g.ongelezen = 0;
          vuil = true;
        }
        return json(res, 200, { jid: g.jid, naam: g.naam, groep: g.jid.endsWith("@g.us"), berichten: g.berichten });
      }
      if (req.method === "POST" && url.pathname === "/stuur") {
        const d = await lichaam(req);
        const jid = d?.jid ? String(d.jid) : `${String(d?.naar ?? "").replace(/\D/g, "")}@s.whatsapp.net`;
        const tekst = String(d?.tekst ?? "").slice(0, 4000);
        if (!isGesprekJid(jid) || !tekst.trim()) return json(res, 422, { fout: "ontvanger en tekst zijn verplicht" });
        if (!verbonden || !sock) return json(res, 503, { fout: "WhatsApp is niet verbonden; scan eerst de koppelcode" });
        const r = await sock.sendMessage(jid, { text: tekst });
        if (r?.key?.id) {
          voegToe(gesprekken, { jid, id: r.key.id, vanMij: true, tekst, tijd: Date.now(), naam: namen.get(jid) });
          vuil = true;
        }
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/uitloggen") {
        if (sock && verbonden) await sock.logout().catch(() => {});
        else {
          await wisSessie();
          setTimeout(() => start().catch((e) => console.error("herstart mislukt", e)), 500);
        }
        return json(res, 200, { ok: true });
      }
      json(res, 404, { fout: "onbekend pad" });
    } catch (e) {
      const status = e && typeof e === "object" && "status" in e ? Number(e.status) : 502;
      json(res, status, { fout: e instanceof Error ? e.message : "mislukt" });
    }
  })
  .listen(PORT, "0.0.0.0", () => console.log(`WhatsApp-brug luistert op :${PORT}${SPOED ? " (spoedoproepen aan)" : ""}`));

start().catch((e) => {
  console.error("start mislukt", e);
  process.exit(1);
});
