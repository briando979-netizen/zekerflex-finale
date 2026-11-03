// ZekerFlex Bouwer — HTTP-dienst in een eigen container (docker-compose.vps.yml,
// service "bouwer"). Alleen bereikbaar op het interne netwerk en alleen met
// BOUWER_TOKEN; de app (Admin → ZekerFlex AI → Bouwer) is de enige klant.
// Geen database, geen app-geheimen: het model en de GitHub-sleutel komen per
// opdracht mee van de app.
//
//   GET  /gezond                     → leeft hij, is hij bezig
//   GET  /taken                      → recente opdrachten
//   POST /taken                      → { opdracht, door, llm }
//   GET  /taken/:id                  → opdracht + stappen + diff
//   POST /taken/:id/bijsturen        → { bericht, door, llm }
//   POST /taken/:id/goedkeuren       → { door, githubToken, liveZetten } commit → bijwerken → controle → push (achtergrond)
//   POST /taken/:id/live-verzocht    → de app heeft de live-uitrol aangevraagd
//   POST /taken/:id/weggooien
//   POST /taken/:id/stop
//   POST /terminal                   → { opdracht } één shell-commando in de werkkopie (max 2 min)
//   GET  /voorbeeld, POST /voorbeeld/start, POST /voorbeeld/stop → live voorbeeld (voorbeeld.mjs)
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { GITHUB_REPO, REPO_DIR, WERK, controleer, gewijzigdeBestanden, huidigeDiff, nieuweWerkkopie, sh } from "./werkkopie.mjs";
import { controleTekst, draai, systeemPrompt } from "./agent.mjs";
import { startVoorbeeld, startVoorbeeldProxy, stopVoorbeeld, voorbeeldStand } from "./voorbeeld.mjs";

const POORT = Number(process.env.BOUWER_POORT || 4100);
const TOKEN = process.env.BOUWER_TOKEN || "";
const TAKEN = path.join(WERK, "taken");
const VERSIE = 1;
const OPEN = new Set(["bezig", "klaar", "mislukt", "conflict", "goedkeuren"]);

/** @type {{ id: string, abort: AbortController } | null} */
let actief = null;

// ---- opslag ---------------------------------------------------------------------

const bestand = (id, soort = "json") => path.join(TAKEN, `${id}.${soort}`);

async function leesTaak(id) {
  if (!/^b_[a-z0-9]+$/.test(id)) return null;
  try {
    return JSON.parse(await fs.readFile(bestand(id), "utf8"));
  } catch {
    return null;
  }
}

async function schrijfAtomisch(p, data) {
  const tmp = `${p}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, p);
}

const wachtrij = new Map();
function bewaar(taak, direct = false) {
  taak.bijgewerkt = new Date().toISOString();
  const schrijf = () => {
    wachtrij.delete(taak.id);
    return schrijfAtomisch(bestand(taak.id), JSON.stringify(taak)).catch((e) => console.error("[bouwer] opslaan mislukt", e));
  };
  if (direct) {
    clearTimeout(wachtrij.get(taak.id));
    return schrijf();
  }
  if (!wachtrij.has(taak.id)) wachtrij.set(taak.id, setTimeout(schrijf, 600));
  return Promise.resolve();
}

async function alleTaken() {
  const namen = (await fs.readdir(TAKEN).catch(() => [])).filter((n) => /^b_[a-z0-9]+\.json$/.test(n));
  const taken = await Promise.all(namen.map((n) => leesTaak(n.slice(0, -5))));
  return taken.filter(Boolean).sort((a, b) => b.begon.localeCompare(a.begon));
}

/** De opdracht die de werkkopie bezet: nog niet gepusht of weggegooid. */
async function openTaak() {
  return (await alleTaken()).find((t) => OPEN.has(t.staat)) ?? null;
}

function logger(taak) {
  return (soort, tekst) => {
    taak.stappen.push({ t: new Date().toISOString(), soort, tekst: String(tekst).slice(0, 4000) });
    if (taak.stappen.length > 600) taak.stappen.splice(0, taak.stappen.length - 600);
    void bewaar(taak);
  };
}

// ---- het werk -------------------------------------------------------------------

function geldigLlm(llm) {
  return llm && typeof llm.baseUrl === "string" && /^https?:\/\//.test(llm.baseUrl) && typeof llm.model === "string" && llm.model.length > 0;
}

async function werk(taak, llm, messages, afbeelding = null) {
  const abort = new AbortController();
  actief = { id: taak.id, abort };
  const log = logger(taak);
  // tsc en next dev passen samen niet in het geheugen van deze container
  if (voorbeeldStand().staat !== "uit") {
    stopVoorbeeld();
    log("info", "Live voorbeeld gestopt zolang de Bouwer werkt");
  }
  try {
    if (!messages) {
      taak.basis = await nieuweWerkkopie(taak.id, log);
      const tekst = `Opdracht van ${taak.door}:\n${taak.opdracht}`;
      messages = [
        { role: "system", content: await systeemPrompt() },
        afbeelding
          ? {
              role: "user",
              content: [
                { type: "text", text: `${tekst}\n\n(Bij deze opdracht hoort de schermafbeelding hieronder.)` },
                { type: "image_url", image_url: { url: afbeelding } },
              ],
            }
          : { role: "user", content: tekst },
      ];
      if (afbeelding) log("info", "Met schermafbeelding");
    }
    log("info", `Model: ${llm.model}`);
    const r = await draai({
      llm,
      messages,
      log,
      signal: abort.signal,
      zetControle: (c) => {
        taak.controle = c;
        void bewaar(taak);
      },
    });
    taak.samenvatting = r.samenvatting;
    taak.commitbericht = r.commitbericht || taak.commitbericht || "feat: wijziging door de ZekerFlex Bouwer";
    taak.staat = "klaar";
    taak.fout = null;
    log("klaar", r.samenvatting || "Klaar.");
  } catch (e) {
    taak.staat = "mislukt";
    taak.fout = e instanceof Error ? e.message : String(e);
    log("fout", taak.fout);
  } finally {
    taak.bestanden = await gewijzigdeBestanden().catch(() => []);
    taak.diff = await huidigeDiff().catch(() => "");
    await schrijfAtomisch(bestand(taak.id, "gesprek.json"), JSON.stringify(messages ?? [])).catch(() => {});
    actief = null;
    await bewaar(taak, true);
  }
}

async function goedkeuren(taak, { door, githubToken }) {
  const log = logger(taak);
  const git = (args, opts) => sh("git", args, opts);
  actief = { id: taak.id, abort: new AbortController() };
  if (voorbeeldStand().staat !== "uit") stopVoorbeeld();
  // een herhaalde poging (na een mislukte push) controleert altijd opnieuw
  let moetControleren = taak.staat !== "klaar";
  taak.staat = "goedkeuren";
  taak.goedgekeurdDoor = door;
  await bewaar(taak, true);
  try {
    if ((await gewijzigdeBestanden()).length) {
      await git(["add", "-A"]);
      const bericht = `${taak.commitbericht}\n\nGebouwd door de ZekerFlex Bouwer (${taak.model}), goedgekeurd door ${door}.\nOpdracht: ${taak.opdracht.slice(0, 600)}`;
      const commit = await git(["-c", "user.name=ZekerFlex Bouwer", "-c", "user.email=bouwer@zekerflex.com", "commit", "-q", "-m", bericht]);
      if (commit.code !== 0) throw new Error(`commit mislukt: ${commit.uit.slice(-300)}`);
      log("info", "Vastgelegd, nu bijwerken met de nieuwste main");
    }
    const voor = Number((await git(["rev-list", "--count", "origin/main..HEAD"])).uit.trim()) || 0;
    if (!voor) throw new Error("Er zijn geen wijzigingen om live te zetten");

    for (let poging = 0; poging < 2; poging++) {
      const opgehaald = await git(["fetch", "--depth", "200", "origin", "main"]);
      if (opgehaald.code !== 0) throw new Error(`ophalen mislukt: ${opgehaald.uit.slice(-300)}`);
      const rebase = await git(["rebase", "origin/main"]);
      if (rebase.code !== 0) {
        await git(["rebase", "--abort"]);
        taak.staat = "conflict";
        taak.fout = "Iemand anders wijzigde dezelfde regels op main. Gooi deze opdracht weg en geef hem opnieuw, dan bouwt de Bouwer op de nieuwste versie.";
        log("fout", taak.fout);
        return;
      }
      const mainNu = (await git(["rev-parse", "origin/main"])).uit.trim();
      if (mainNu !== taak.basis || moetControleren) {
        log("info", mainNu !== taak.basis ? "Main is intussen veranderd: opnieuw controleren" : "Opnieuw controleren");
        moetControleren = false;
        taak.controle = await controleer(log);
        if (!taak.controle.ok) {
          taak.staat = "mislukt";
          taak.fout = `Na bijwerken met de nieuwste main faalt de controle.\n${controleTekst(taak.controle)}`;
          log("fout", "Controle faalt na bijwerken");
          return;
        }
        taak.basis = mainNu;
      }
      const push = await git(["push", `https://x-access-token:${githubToken}@github.com/${GITHUB_REPO}.git`, "HEAD:main"], { timeout: 180_000 });
      if (push.code === 0) {
        taak.sha = (await git(["rev-parse", "HEAD"])).uit.trim();
        taak.staat = "gepusht";
        taak.fout = null;
        log("klaar", `Op GitHub main gezet: ${taak.sha.slice(0, 7)}`);
        return;
      }
      const reden = push.uit.replaceAll(githubToken, "***");
      if (!/rejected|non-fast-forward|fetch first/.test(reden) || poging === 1) throw new Error(`push mislukt: ${reden.slice(-300)}`);
      log("info", "Main veranderde tijdens het pushen, nog een keer");
    }
  } catch (e) {
    taak.staat = "mislukt";
    taak.fout = (e instanceof Error ? e.message : String(e)).replaceAll(githubToken, "***");
    log("fout", taak.fout);
  } finally {
    taak.bestanden = await gewijzigdeBestanden().catch(() => []);
    actief = null;
    await bewaar(taak, true);
  }
}

// ---- http -------------------------------------------------------------------------

function antwoord(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function magErin(req) {
  const kop = String(req.headers.authorization || "");
  const gegeven = Buffer.from(kop.startsWith("Bearer ") ? kop.slice(7) : "");
  const verwacht = Buffer.from(TOKEN);
  return TOKEN.length >= 24 && gegeven.length === verwacht.length && timingSafeEqual(gegeven, verwacht);
}

async function lichaam(req, max = 1_000_000) {
  let data = "";
  for await (const stuk of req) {
    data += stuk;
    if (data.length > max) throw new Error("Te groot");
  }
  return data ? JSON.parse(data) : {};
}

// Een schermafbeelding bij de opdracht ("dit moet anders"): alleen echte afbeeldingen, max ~4 MB.
const AFBEELDING = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_AFBEELDING = 5_600_000;

const samenvatting = (t) => ({
  id: t.id,
  opdracht: t.opdracht,
  door: t.door,
  model: t.model,
  staat: t.staat,
  begon: t.begon,
  bijgewerkt: t.bijgewerkt,
  sha: t.sha ?? null,
  bestanden: (t.bestanden ?? []).length,
  metAfbeelding: Boolean(t.metAfbeelding),
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://bouwer");
  const delen = url.pathname.split("/").filter(Boolean);
  try {
    if (req.method === "GET" && url.pathname === "/gezond") return antwoord(res, 200, { ok: true, versie: VERSIE, bezig: actief?.id ?? null, sleutel: TOKEN.length >= 24 });
    if (!magErin(req)) return antwoord(res, 401, { fout: "Geen toegang" });

    // Echte shell in de werkkopie (geen database, geen app-geheimen in deze container).
    if (req.method === "POST" && url.pathname === "/terminal") {
      const b = await lichaam(req);
      const opdracht = String(b.opdracht ?? "").trim();
      if (!opdracht || opdracht.length > 2000) return antwoord(res, 400, { fout: "Leeg of te lang commando" });
      const cwd = (await fs.access(path.join(REPO_DIR, ".git")).then(() => true, () => false)) ? REPO_DIR : WERK;
      const r = await sh("bash", ["-lc", opdracht], { cwd, timeout: 120_000 });
      const uit = r.uit.length > 100_000 ? `…\n${r.uit.slice(-100_000)}` : r.uit;
      return antwoord(res, 200, { ok: r.code === 0, code: r.code, uitvoer: uit || (r.code === 0 ? "(geen uitvoer)" : `(afgesloten met code ${r.code})`), map: cwd });
    }

    if (url.pathname === "/voorbeeld" && req.method === "GET") return antwoord(res, 200, voorbeeldStand());
    if (url.pathname === "/voorbeeld/start" && req.method === "POST") {
      if (actief) return antwoord(res, 409, { fout: "De Bouwer is aan het werk; start het voorbeeld als hij klaar is" });
      const b = await lichaam(req);
      const opMain = b.versie === "main";
      // de nieuwste main zetten we in dezelfde werkkopie: alleen als er geen opdracht open staat
      if (opMain && (await openTaak())) return antwoord(res, 409, { fout: "Er staat een opdracht van de Bouwer open. Rond die eerst af (goedkeuren of weggooien), dan kan het voorbeeld de nieuwste versie tonen." });
      try {
        return antwoord(res, 202, startVoorbeeld({ opMain }));
      } catch (e) {
        return antwoord(res, 409, { fout: e instanceof Error ? e.message : "Voorbeeld kan niet starten" });
      }
    }
    if (url.pathname === "/voorbeeld/stop" && req.method === "POST") {
      stopVoorbeeld();
      return antwoord(res, 200, voorbeeldStand());
    }

    if (delen[0] !== "taken") return antwoord(res, 404, { fout: "Onbekend pad" });

    if (delen.length === 1 && req.method === "GET") {
      const taken = await alleTaken();
      return antwoord(res, 200, { bezig: actief?.id ?? null, taken: taken.slice(0, 30).map(samenvatting) });
    }

    if (delen.length === 1 && req.method === "POST") {
      const b = await lichaam(req, 6_000_000);
      const opdracht = String(b.opdracht ?? "").trim();
      if (opdracht.length < 5 || opdracht.length > 6000) return antwoord(res, 400, { fout: "Beschrijf de opdracht in 5 tot 6000 tekens" });
      if (!geldigLlm(b.llm)) return antwoord(res, 400, { fout: "Geen taalmodel ingesteld" });
      const afbeelding = b.afbeelding == null ? null : String(b.afbeelding);
      if (afbeelding && (afbeelding.length > MAX_AFBEELDING || !AFBEELDING.test(afbeelding)))
        return antwoord(res, 400, { fout: "De afbeelding moet een PNG, JPEG of WebP van hooguit 4 MB zijn" });
      if (actief) return antwoord(res, 409, { fout: "De Bouwer is nog bezig met een andere opdracht" });
      const open = await openTaak();
      if (open) return antwoord(res, 409, { fout: "Er staat nog een opdracht open. Zet die live of gooi hem weg.", open: open.id });
      const taak = {
        id: `b_${Date.now().toString(36)}${randomBytes(2).toString("hex")}`,
        opdracht,
        door: String(b.door ?? "onbekend").slice(0, 200),
        model: b.llm.model,
        staat: "bezig",
        begon: new Date().toISOString(),
        bijgewerkt: new Date().toISOString(),
        stappen: [],
        basis: null,
        bestanden: [],
        samenvatting: "",
        commitbericht: "",
        controle: null,
        sha: null,
        fout: null,
        diff: "",
        metAfbeelding: Boolean(afbeelding),
      };
      await bewaar(taak, true);
      void werk(taak, b.llm, null, afbeelding);
      return antwoord(res, 202, samenvatting(taak));
    }

    const taak = await leesTaak(delen[1] ?? "");
    if (!taak) return antwoord(res, 404, { fout: "Opdracht niet gevonden" });

    if (delen.length === 2 && req.method === "GET") {
      // tijdens het werk de diff vers uit de werkkopie, daarna de bewaarde
      const diff = actief?.id === taak.id ? await huidigeDiff().catch(() => taak.diff) : taak.diff;
      const bestanden = actief?.id === taak.id ? await gewijzigdeBestanden().catch(() => taak.bestanden) : taak.bestanden;
      return antwoord(res, 200, { ...taak, diff, bestanden, bezig: actief?.id === taak.id });
    }

    const actie = delen[2];
    if (req.method !== "POST" || delen.length !== 3) return antwoord(res, 404, { fout: "Onbekend pad" });
    if (actie === "stop") {
      if (actief?.id === taak.id) actief.abort.abort();
      return antwoord(res, 200, { ok: true });
    }
    if (actie === "live-verzocht") {
      // de app heeft na de push de live-uitrol aangevraagd: niet nog eens doen
      taak.liveVerzocht = true;
      await bewaar(taak, true);
      return antwoord(res, 200, { ok: true });
    }
    if (actief) return antwoord(res, 409, { fout: "De Bouwer is nog bezig" });
    const open = await openTaak();
    if (!open || open.id !== taak.id) return antwoord(res, 409, { fout: "Deze opdracht staat niet meer open" });

    if (actie === "bijsturen") {
      const b = await lichaam(req);
      const bericht = String(b.bericht ?? "").trim();
      if (!bericht) return antwoord(res, 400, { fout: "Wat moet er anders?" });
      if (!geldigLlm(b.llm)) return antwoord(res, 400, { fout: "Geen taalmodel ingesteld" });
      if (!["klaar", "mislukt", "conflict"].includes(taak.staat)) return antwoord(res, 409, { fout: "Bijsturen kan nu niet" });
      const messages = JSON.parse(await fs.readFile(bestand(taak.id, "gesprek.json"), "utf8").catch(() => "[]"));
      if (!messages.length) return antwoord(res, 409, { fout: "Het gesprek van deze opdracht is niet bewaard; geef een nieuwe opdracht" });
      messages.push({ role: "user", content: `Bijsturing van ${String(b.door ?? "de eigenaar")}:\n${bericht}` });
      taak.staat = "bezig";
      taak.model = b.llm.model;
      logger(taak)("info", `Bijsturing: ${bericht}`);
      await bewaar(taak, true);
      void werk(taak, b.llm, messages);
      return antwoord(res, 202, samenvatting(taak));
    }

    if (actie === "goedkeuren") {
      const b = await lichaam(req);
      const githubToken = String(b.githubToken ?? "");
      if (githubToken.length < 20) return antwoord(res, 400, { fout: "GitHub-sleutel ontbreekt (Bouwer → Instellingen)" });
      // klaar, of opnieuw proberen nadat een eerdere goedkeuring halverwege misliep
      if (taak.staat !== "klaar" && !(taak.staat === "mislukt" && taak.goedgekeurdDoor))
        return antwoord(res, 409, { fout: "Alleen een afgeronde opdracht kan live" });
      taak.liveZetten = Boolean(b.liveZetten);
      void goedkeuren(taak, { door: String(b.door ?? "onbekend"), githubToken });
      return antwoord(res, 202, samenvatting(taak));
    }

    if (actie === "weggooien") {
      await sh("git", ["checkout", "-q", "-f", "--detach", "origin/main"]);
      await sh("git", ["clean", "-fdq"]);
      taak.staat = "weggegooid";
      logger(taak)("info", "Weggegooid");
      await bewaar(taak, true);
      return antwoord(res, 200, samenvatting(taak));
    }

    return antwoord(res, 404, { fout: "Onbekende actie" });
  } catch (e) {
    console.error("[bouwer]", e);
    return antwoord(res, 500, { fout: e instanceof Error ? e.message : "Fout" });
  }
});

// Een herstart breekt lopend werk af: markeer het, zodat de werkkopie vrijkomt voor bijsturen of weggooien.
await fs.mkdir(TAKEN, { recursive: true });
for (const t of await alleTaken()) {
  if (t.staat === "bezig" || t.staat === "goedkeuren") {
    t.staat = "mislukt";
    t.fout = "De Bouwer werd herstart tijdens het werk.";
    await bewaar(t, true);
  }
}
server.listen(POORT, () => console.log(`[bouwer] luistert op ${POORT}${TOKEN.length >= 24 ? "" : " (ZONDER BOUWER_TOKEN: alles geweigerd)"}`));
startVoorbeeldProxy();
