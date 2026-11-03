// ZekerFlex Android-bouwer — HTTP-dienst in een eigen container
// (docker-compose.vps.yml, service "android-bouwer"). Bouwt de Android-app
// (.aab, Trusted Web Activity) van een rijschool; de app (lib/rijschool/app)
// is de enige klant en zet het resultaat zelf in Google Play. Alleen op het
// interne netwerk, alleen met ANDROID_BOUWER_TOKEN. Geen database en geen
// geheimen: de uploadsleutel komt per opdracht mee en blijft niet bewaard.
//
//   GET  /gezond          → leeft hij, wat staat er in de rij
//   POST /bouw            → { manifest, icoon, maskeerbaar?, sleutel } → { id }
//   GET  /bouw/:id        → { staat: wacht|bezig|klaar|mislukt, log, fout?, resultaat? }
//   GET  /bouw/:id/aab    → het ondertekende app-bestand
import http from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WERK, bouw, bouwMap } from "./bouw.mjs";

const POORT = Number(process.env.ANDROID_BOUWER_POORT || 4300);
const TOKEN = process.env.ANDROID_BOUWER_TOKEN || "";
const BEWAAR_MS = 6 * 3_600_000;
const MAX_BODY = 6_000_000;

/** @type {Map<string, { id: string, staat: string, log: string[], fout?: string, resultaat?: object, begon: string, klaar?: string }>} */
const taken = new Map();
/** @type {{ id: string, opdracht: object }[]} */
const rij = [];
let bezig = false;

const staatBestand = (id) => path.join(bouwMap(id), "staat.json");

async function bewaar(t) {
  await fs.mkdir(bouwMap(t.id), { recursive: true });
  await fs.writeFile(staatBestand(t.id), JSON.stringify(t));
}

async function leesTaak(id) {
  if (!/^a_[a-z0-9]+$/.test(id)) return null;
  const t = taken.get(id);
  if (t) return t;
  try {
    return JSON.parse(await fs.readFile(staatBestand(id), "utf8"));
  } catch {
    return null;
  }
}

async function opruimen() {
  const map = path.join(WERK, "bouw");
  for (const naam of await fs.readdir(map).catch(() => [])) {
    const t = await leesTaak(naam);
    const oud = !t || Date.now() - Date.parse(t.klaar ?? t.begon) > BEWAAR_MS;
    if (oud && !(t && (t.staat === "wacht" || t.staat === "bezig"))) {
      await fs.rm(path.join(map, naam), { recursive: true, force: true });
      taken.delete(naam);
    }
  }
}

async function volgende() {
  if (bezig) return;
  const werk = rij.shift();
  if (!werk) return;
  bezig = true;
  const t = taken.get(werk.id);
  try {
    t.staat = "bezig";
    await bewaar(t);
    t.resultaat = await bouw(werk.id, werk.opdracht, (regel) => {
      t.log.push(regel);
      if (t.log.length > 200) t.log.splice(0, t.log.length - 200);
    });
    t.staat = "klaar";
  } catch (e) {
    t.staat = "mislukt";
    t.fout = e instanceof Error ? e.message : String(e);
    console.error(`[android-bouwer] ${werk.id} mislukt:`, t.fout);
  } finally {
    t.klaar = new Date().toISOString();
    // de nieuwe sleutel alleen in het geheugen tot de app hem ophaalt; niet op schijf
    const { resultaat, ...opslag } = t;
    await bewaar(resultaat ? { ...opslag, resultaat: { ...resultaat, nieuweSleutel: undefined } } : opslag).catch(() => {});
    bezig = false;
    void volgende();
  }
}

// ---- controle van de opdracht ------------------------------------------------------

const PAKKET = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,7}$/;
const KLEUR = /^#[0-9a-fA-F]{6}$/;
const PNG = (b64) => typeof b64 === "string" && b64.length > 100 && Buffer.from(b64.slice(0, 12), "base64").subarray(1, 4).toString() === "PNG";

function controleer(o) {
  const m = o?.manifest ?? {};
  const fouten = [];
  if (!PAKKET.test(m.pakketnaam ?? "") || m.pakketnaam.length > 150) fouten.push("pakketnaam");
  if (!/^[a-z0-9.-]+$/.test(m.host ?? "")) fouten.push("host");
  if (typeof m.naam !== "string" || !m.naam.trim() || m.naam.length > 50) fouten.push("naam");
  if (typeof m.korteNaam !== "string" || !m.korteNaam.trim() || m.korteNaam.length > 30) fouten.push("korteNaam");
  if (!KLEUR.test(m.kleur ?? "") || !KLEUR.test(m.achtergrond ?? "")) fouten.push("kleur");
  if (typeof m.startUrl !== "string" || !m.startUrl.startsWith("/")) fouten.push("startUrl");
  if (typeof m.scope !== "string" || !m.scope.startsWith("/")) fouten.push("scope");
  if (!Number.isInteger(m.versie) || m.versie < 1 || m.versie > 2_100_000_000) fouten.push("versie");
  if (typeof m.versieNaam !== "string" || !/^[0-9][0-9.]{0,20}$/.test(m.versieNaam)) fouten.push("versieNaam");
  if (!PNG(o?.icoon) || (o.maskeerbaar !== undefined && !PNG(o.maskeerbaar))) fouten.push("icoon");
  if (typeof o?.sleutel?.wachtwoord !== "string" || o.sleutel.wachtwoord.length < 16) fouten.push("sleutel");
  if (o?.sleutel?.keystore !== undefined && typeof o.sleutel.keystore !== "string") fouten.push("sleutel");
  return fouten;
}

// ---- HTTP ---------------------------------------------------------------------------

function json(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(data));
}

function geautoriseerd(req) {
  const kop = req.headers.authorization ?? "";
  if (!TOKEN || !kop.startsWith("Bearer ")) return false;
  const a = Buffer.from(kop.slice(7));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function leesLichaam(req) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const delen = [];
    req.on("data", (d) => {
      n += d.length;
      if (n > MAX_BODY) {
        reject(new Error("te groot"));
        req.destroy();
      } else delen.push(d);
    });
    req.on("end", () => resolve(Buffer.concat(delen).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://bouwer");
    if (url.pathname === "/gezond") return json(res, 200, { ok: true, bezig, inRij: rij.length });
    if (!geautoriseerd(req)) return json(res, 401, { fout: "Geen toegang." });

    if (req.method === "POST" && url.pathname === "/bouw") {
      let opdracht;
      try {
        opdracht = JSON.parse(await leesLichaam(req));
      } catch {
        return json(res, 400, { fout: "Ongeldige opdracht." });
      }
      const fouten = controleer(opdracht);
      if (fouten.length) return json(res, 422, { fout: `Ongeldige velden: ${[...new Set(fouten)].join(", ")}` });
      if (rij.length >= 10) return json(res, 503, { fout: "Er staan al veel bouwopdrachten klaar; probeer het zo opnieuw." });
      await opruimen();
      const id = `a_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
      const t = { id, staat: "wacht", log: [], begon: new Date().toISOString() };
      taken.set(id, t);
      await bewaar(t);
      rij.push({ id, opdracht });
      void volgende();
      return json(res, 202, { id });
    }

    const m = /^\/bouw\/(a_[a-z0-9]+)(\/aab)?$/.exec(url.pathname);
    if (req.method === "GET" && m) {
      const t = await leesTaak(m[1]);
      if (!t) return json(res, 404, { fout: "Onbekende bouw." });
      if (!m[2]) return json(res, 200, { ...t, plaatsInRij: rij.findIndex((w) => w.id === t.id) + 1 });
      if (t.staat !== "klaar") return json(res, 409, { fout: "De bouw is nog niet klaar." });
      const bestand = path.join(bouwMap(t.id), "app.aab");
      const { size } = await fs.stat(bestand);
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": size });
      return void createReadStream(bestand).pipe(res);
    }
    return json(res, 404, { fout: "Onbekend adres." });
  } catch (e) {
    console.error("[android-bouwer]", e);
    if (!res.headersSent) json(res, 500, { fout: "Interne fout in de Android-bouwer." });
  }
});

// Opdrachten die bij een herstart halverwege waren, zijn verloren: eerlijk melden
for (const naam of await fs.readdir(path.join(WERK, "bouw")).catch(() => [])) {
  const t = await leesTaak(naam);
  if (t && (t.staat === "wacht" || t.staat === "bezig")) {
    await bewaar({ ...t, staat: "mislukt", fout: "De Android-bouwer is herstart tijdens de bouw. Probeer het opnieuw.", klaar: new Date().toISOString() });
  }
}

if (!TOKEN) console.warn("[android-bouwer] ANDROID_BOUWER_TOKEN ontbreekt: alle opdrachten worden geweigerd");
server.listen(POORT, () => console.log(`[android-bouwer] luistert op :${POORT}`));
