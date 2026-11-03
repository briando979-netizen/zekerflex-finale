// De werkkopie van de ZekerFlex Bouwer: een eigen git-kopie van GitHub main in
// /werk/repo, met de gereedschappen die het model mag gebruiken. Lezen mag bijna
// overal; schrijven niet in de beveiliging, de database, de pakketlijst of de
// uitrol-scripts. Die blijven mensenwerk.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const WERK = process.env.BOUWER_WERK || "/werk";
export const REPO_DIR = path.join(WERK, "repo");
export const GITHUB_REPO = process.env.BOUWER_GITHUB_REPO || "briando979-netizen/zekerflex-finale";
const REPO_URL = `https://github.com/${GITHUB_REPO}.git`;
const MAX_UIT = 2_000_000;

/** De omgeving zonder BOUWER_TOKEN: voor processen die door de AI gewijzigde code draaien. */
export function omgevingZonderSleutel() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "BOUWER_TOKEN"));
}

/** Draai een commando; geeft code + (afgekapte) uitvoer, gooit nooit. */
export function sh(cmd, args, { cwd = REPO_DIR, timeout = 600_000, env = {}, signal, zonderSleutel = false } = {}) {
  return new Promise((resolve) => {
    // geen stdin en geen wachtwoordvraag: niets mag ooit op invoer blijven wachten
    const basis = zonderSleutel ? omgevingZonderSleutel() : process.env;
    const p = spawn(cmd, args, { cwd, env: { ...basis, GIT_TERMINAL_PROMPT: "0", ...env }, signal, stdio: ["ignore", "pipe", "pipe"] });
    let uit = "";
    const neem = (b) => {
      if (uit.length < MAX_UIT) uit += b.toString();
    };
    p.stdout.on("data", neem);
    p.stderr.on("data", neem);
    const klok = setTimeout(() => p.kill("SIGKILL"), timeout);
    p.on("error", (e) => {
      clearTimeout(klok);
      resolve({ code: -1, uit: `${uit}\n${e.message}` });
    });
    p.on("close", (code) => {
      clearTimeout(klok);
      resolve({ code: code ?? -1, uit });
    });
  });
}

async function git(args, opts) {
  const r = await sh("git", args, opts);
  if (r.code !== 0) throw new Error(`git ${args.slice(0, 2).join(" ")}: ${r.uit.trim().slice(-400)}`);
  return r.uit.trim();
}

const bestaat = (p) => fs.access(p).then(() => true, () => false);

// De uitrol-vergrendeling van de server (alleen-lezen gemount). Een uitrol draait
// next build (2–3 GB) op dezelfde 8 GB: zware stappen wachten tot die klaar is.
const SLOT = "/zf-slot/deploy.lock";

export async function wachtOpUitrol(log) {
  if (!(await bestaat(SLOT))) return;
  let gemeld = false;
  const eind = Date.now() + 30 * 60_000;
  while (Date.now() < eind) {
    // flock -n: 0 = vrij, 1 = een uitrol houdt hem vast, anders (bv. niet te openen) = niet blokkeren
    const r = await sh("flock", ["-n", "-s", SLOT, "true"], { cwd: WERK, timeout: 10_000 });
    if (r.code !== 1) return;
    if (!gemeld) {
      log("info", "Er loopt een uitrol op de server; even wachten zodat het geheugen niet krap wordt");
      gemeld = true;
    }
    await new Promise((klaar) => setTimeout(klaar, 15_000));
  }
}

async function zorgVoorKloon(log) {
  if (await bestaat(path.join(REPO_DIR, ".git"))) return;
  log("info", "Eerste keer: de codebase ophalen van GitHub");
  await fs.mkdir(WERK, { recursive: true });
  await git(["clone", "--depth", "200", "--branch", "main", REPO_URL, REPO_DIR], { cwd: WERK, timeout: 900_000 });
}

/** Verse branch bouwer/<id> op de nieuwste main; eerste keer klonen. */
export async function nieuweWerkkopie(id, log) {
  await zorgVoorKloon(log);
  await git(["fetch", "--depth", "200", "origin", "main"]);
  await git(["checkout", "-f", "-B", `bouwer/${id}`, "origin/main"]);
  await git(["clean", "-fd"]);
  const basis = await git(["rev-parse", "HEAD"]);
  log("info", `Werkkopie klaar op main ${basis.slice(0, 7)}`);
  await zorgVoorPakketten(log);
  return basis;
}

/** De werkkopie op de nieuwste main, zonder eigen branch: voor het voorbeeld van wat er live gaat. */
export async function werkkopieOpMain(log) {
  await zorgVoorKloon(log);
  await git(["fetch", "--depth", "200", "origin", "main"]);
  await git(["checkout", "-q", "-f", "--detach", "origin/main"]);
  await git(["clean", "-fdq"]);
  const sha = await git(["rev-parse", "HEAD"]);
  log("info", `Werkkopie op de nieuwste main ${sha.slice(0, 7)}`);
  await zorgVoorPakketten(log);
  return sha;
}

/** npm ci + prisma generate, alleen als package-lock.json of het databaseschema veranderde. */
async function zorgVoorPakketten(log) {
  const hashVan = (buf) => createHash("sha256").update(buf).digest("hex");
  const lockHash = hashVan(await fs.readFile(path.join(REPO_DIR, "package-lock.json")));
  // ook het schema: anders blijft de gegenereerde Prisma-client achter bij een nieuwe tabel
  const schemaHash = hashVan(await fs.readFile(path.join(REPO_DIR, "prisma", "schema.prisma")).catch(() => Buffer.alloc(0)));
  const merkLock = path.join(WERK, "pakketten.hash");
  const merkSchema = path.join(WERK, "schema.hash");
  const lees = (p) => fs.readFile(p, "utf8").catch(() => "");
  const pakkettenOk = (await lees(merkLock)) === lockHash && (await bestaat(path.join(REPO_DIR, "node_modules", ".bin", "tsc")));
  if (pakkettenOk && (await lees(merkSchema)) === schemaHash) return;
  await wachtOpUitrol(log);
  if (!pakkettenOk) {
    log("info", "Pakketten installeren (npm ci, eenmalig enkele minuten)");
    const ci = await sh("npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"], { timeout: 1_200_000 });
    if (ci.code !== 0) throw new Error(`npm ci mislukt: ${ci.uit.slice(-600)}`);
  } else {
    log("info", "Databaseschema veranderd: Prisma-client bijwerken");
  }
  const gen = await sh("npx", ["prisma", "generate"], { timeout: 300_000 });
  if (gen.code !== 0) throw new Error(`prisma generate mislukt: ${gen.uit.slice(-600)}`);
  await fs.writeFile(merkLock, lockHash);
  await fs.writeFile(merkSchema, schemaHash);
}

export async function gewijzigdeBestanden() {
  // niet trimmen: de eerste kolom van --porcelain is vaak een spatie (" M pad")
  const r = await sh("git", ["status", "--porcelain", "--untracked-files=all"]);
  if (r.code !== 0) throw new Error(`git status: ${r.uit.trim().slice(-300)}`);
  return r.uit
    .split("\n")
    .filter((regel) => regel.length > 3)
    .map((regel) => ({
      status: regel.slice(0, 2).trim(),
      // hernoemd: "R  oud -> nieuw"
      pad: regel.slice(3).split(" -> ").pop().replace(/^"|"$/g, ""),
    }));
}

export async function huidigeDiff() {
  await sh("git", ["add", "-N", "."]);
  const r = await sh("git", ["diff", "--no-color", "--no-ext-diff"]);
  return r.uit.length > 400_000 ? `${r.uit.slice(0, 400_000)}\n… (diff ingekort)` : r.uit;
}

/** De gouden regels uit AGENTS.md: tsc op het hele project + eslint op de gewijzigde bestanden, plus de tests die erbij horen. */
export async function controleer(log) {
  const bestanden = (await gewijzigdeBestanden()).filter((b) => b.status !== "D").map((b) => b.pad);
  await wachtOpUitrol(log);
  log("info", "Controle: TypeScript (hele project)");
  const tsc = await sh("npx", ["tsc", "--noEmit", "-p", "."], { timeout: 1_200_000 });
  const lintbaar = bestanden.filter((p) => /\.(tsx?|mjs|js)$/.test(p));
  let eslint = { code: 0, uit: "" };
  if (lintbaar.length) {
    log("info", `Controle: eslint op ${lintbaar.length} bestand(en)`);
    eslint = await sh("npx", ["eslint", ...lintbaar], { timeout: 600_000 });
  }
  // De bestaande tests die de gewijzigde bestanden raken (vitest related). Tests met
  // een database draaien op de wegwerp-database van het voorbeeld (alleen demogegevens).
  let tests = { code: 0, uit: "" };
  if (lintbaar.length) {
    log("info", "Controle: tests die bij de wijziging horen");
    const env = testOmgeving();
    if (env.DATABASE_URL) await sh("npx", ["prisma", "migrate", "deploy"], { env, timeout: 300_000, zonderSleutel: true });
    tests = await sh("npx", ["vitest", "related", "--run", "--passWithNoTests", "--maxWorkers=2", ...lintbaar], {
      env,
      timeout: 900_000,
      zonderSleutel: true,
    });
  }
  const kort = (t) => t.trim().split("\n").slice(0, 80).join("\n");
  // bij tests staat de samenvatting onderaan
  const staart = (t) => t.trim().split("\n").slice(-80).join("\n");
  return {
    ok: tsc.code === 0 && eslint.code === 0 && tests.code === 0,
    tsc: { ok: tsc.code === 0, uit: kort(tsc.uit) },
    eslint: { ok: eslint.code === 0, uit: kort(eslint.uit) },
    tests: { ok: tests.code === 0, uit: staart(tests.uit) },
    op: new Date().toISOString(),
  };
}

function testOmgeving() {
  const db = process.env.BOUWER_VOORBEELD_DB || "";
  return {
    NODE_ENV: "test",
    // geen kleurcodes: de uitvoer komt als platte tekst in Admin
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    ...(db ? { DATABASE_URL: db, DATABASE_URL_UNPOOLED: db } : {}),
    ...(process.env.BOUWER_VOORBEELD_REDIS ? { REDIS_URL: process.env.BOUWER_VOORBEELD_REDIS } : {}),
  };
}

// ---- gereedschappen voor het model ------------------------------------------------

const ALLEEN_LEZEN = [
  /^\.git(\/|$)/,
  /^node_modules(\/|$)/,
  /(^|\/)\.env/,
  /^prisma\//,
  /^package(-lock)?\.json$/,
  /^deploy\//,
  /^\.github\//,
  /^Dockerfile/,
  /^docker-compose/,
  /^middleware\.ts$/,
  /^next\.config\./,
  /^lib\/auth\//,
  /^lib\/security\//,
  /^lib\/bouwer\//,
  /^app\/api\/admin\/bouwer\//,
  /^\.gitattributes$/,
];
const GEHEIM = [/(^|\/)\.env/, /^\.git\//];

function veiligPad(rel, schrijven) {
  const schoon = path.posix.normalize(String(rel || ".").replace(/\\/g, "/")).replace(/^\.\/+/, "");
  if (schoon.startsWith("..") || path.posix.isAbsolute(schoon)) throw new Error(`Pad buiten de codebase: ${rel}`);
  if (GEHEIM.some((r) => r.test(schoon))) throw new Error(`Dit bestand is afgeschermd: ${schoon}`);
  if (schrijven && ALLEEN_LEZEN.some((r) => r.test(schoon)))
    throw new Error(`${schoon} mag de bouwer niet wijzigen (beveiliging, database, pakketten of uitrol). Beschrijf de nodige wijziging in je samenvatting.`);
  return { rel: schoon, abs: path.join(REPO_DIR, schoon) };
}

export const GEREEDSCHAP = [
  {
    naam: "zoek",
    beschrijving: "Zoek met een reguliere expressie in de codebase (ripgrep). Geeft pad:regel:tekst.",
    params: {
      patroon: { type: "string", description: "Regex, bv. 'export function kvGet' of 'Live zetten'" },
      pad: { type: "string", description: "Map of bestand om in te zoeken (standaard de hele codebase)" },
      glob: { type: "string", description: "Optioneel bestandsfilter, bv. '*.tsx'" },
    },
    verplicht: ["patroon"],
  },
  {
    naam: "lijst",
    beschrijving: "Toon de inhoud van een map (mappen eindigen op /).",
    params: { pad: { type: "string", description: "Map, bv. 'app/admin' of '.'" } },
    verplicht: ["pad"],
  },
  {
    naam: "lees",
    beschrijving: "Lees een bestand met regelnummers (max 400 regels per keer).",
    params: {
      pad: { type: "string" },
      vanaf: { type: "integer", description: "Eerste regel (1 = begin)" },
      aantal: { type: "integer", description: "Aantal regels (max 400)" },
    },
    verplicht: ["pad"],
  },
  {
    naam: "vervang",
    beschrijving:
      "Vervang in een bestaand bestand precies één keer de tekst `oud` door `nieuw`. `oud` moet letterlijk en uniek in het bestand staan (neem genoeg context mee, zonder regelnummers).",
    params: { pad: { type: "string" }, oud: { type: "string" }, nieuw: { type: "string" } },
    verplicht: ["pad", "oud", "nieuw"],
  },
  {
    naam: "schrijf",
    beschrijving: "Maak een nieuw bestand (of overschrijf een klein bestand helemaal). Gebruik voor bestaande bestanden liever `vervang`.",
    params: { pad: { type: "string" }, inhoud: { type: "string" } },
    verplicht: ["pad", "inhoud"],
  },
  {
    naam: "controleer",
    beschrijving: "Draai de verplichte controles: TypeScript op het hele project, eslint op je gewijzigde bestanden en de bestaande tests die je wijziging raken. Duurt een paar minuten.",
    params: {},
    verplicht: [],
  },
  {
    naam: "klaar",
    beschrijving: "Rond af. Alleen aanroepen als de controle schoon is (of je uitlegt waarom niet).",
    params: {
      samenvatting: { type: "string", description: "Voor de eigenaar, in gewone Nederlandse taal: wat is er veranderd en waar zie je het." },
      commitbericht: { type: "string", description: "Conventionele commit in het Nederlands, bv. 'feat(shop): filter op maat'" },
    },
    verplicht: ["samenvatting", "commitbericht"],
  },
];

const MAX_SCHRIJF = 200_000;

export async function voerUit(naam, args, { log, signal } = {}) {
  switch (naam) {
    case "zoek": {
      const doel = veiligPad(args.pad || ".", false);
      const rgArgs = ["-n", "--no-heading", "-S", "--max-count", "8", "--max-columns", "220", "-g", "!node_modules", "-g", "!.env*", "-g", "!*.lock"];
      if (args.glob) rgArgs.push("-g", String(args.glob));
      rgArgs.push("-e", String(args.patroon ?? ""), doel.rel || ".");
      const r = await sh("rg", rgArgs, { timeout: 60_000, signal });
      const regels = r.uit.trim().split("\n").filter(Boolean);
      if (!regels.length) return "Niets gevonden.";
      return regels.slice(0, 120).join("\n") + (regels.length > 120 ? `\n… en nog ${regels.length - 120} treffers` : "");
    }
    case "lijst": {
      const doel = veiligPad(args.pad || ".", false);
      const items = await fs.readdir(doel.abs, { withFileTypes: true });
      return items
        .filter((d) => d.name !== "node_modules" && d.name !== ".git" && !d.name.startsWith(".env"))
        .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
        .slice(0, 250)
        .map((d) => (d.isDirectory() ? `${d.name}/` : d.name))
        .join("\n");
    }
    case "lees": {
      const doel = veiligPad(args.pad, false);
      const tekst = await fs.readFile(doel.abs, "utf8");
      const regels = tekst.split("\n");
      const vanaf = Math.max(1, Number(args.vanaf) || 1);
      const aantal = Math.min(400, Math.max(1, Number(args.aantal) || 250));
      const stuk = regels.slice(vanaf - 1, vanaf - 1 + aantal).map((r, i) => `${String(vanaf + i).padStart(5)}  ${r}`);
      const rest = regels.length - (vanaf - 1 + stuk.length);
      return `${doel.rel} (${regels.length} regels)\n${stuk.join("\n")}${rest > 0 ? `\n… nog ${rest} regels (lees verder met vanaf=${vanaf + stuk.length})` : ""}`;
    }
    case "vervang": {
      const doel = veiligPad(args.pad, true);
      const tekst = await fs.readFile(doel.abs, "utf8");
      const oud = String(args.oud ?? "");
      if (!oud) throw new Error("`oud` is leeg");
      const keer = tekst.split(oud).length - 1;
      if (keer === 0) throw new Error("`oud` staat niet letterlijk in het bestand. Lees het bestand opnieuw en neem de tekst exact over (spaties en inspringing tellen mee).");
      if (keer > 1) throw new Error(`\`oud\` staat ${keer} keer in het bestand. Neem meer omringende regels mee zodat hij uniek is.`);
      await fs.writeFile(doel.abs, tekst.replace(oud, () => String(args.nieuw ?? "")));
      log?.("bestand", `bewerkt ${doel.rel}`);
      return `Gewijzigd: ${doel.rel}`;
    }
    case "schrijf": {
      const doel = veiligPad(args.pad, true);
      const inhoud = String(args.inhoud ?? "");
      if (inhoud.length > MAX_SCHRIJF) throw new Error("Bestand te groot; splits het op.");
      const nieuw = !(await bestaat(doel.abs));
      await fs.mkdir(path.dirname(doel.abs), { recursive: true });
      await fs.writeFile(doel.abs, inhoud);
      log?.("bestand", `${nieuw ? "nieuw" : "overschreven"} ${doel.rel}`);
      return `${nieuw ? "Aangemaakt" : "Overschreven"}: ${doel.rel}`;
    }
    default:
      throw new Error(`Onbekend gereedschap: ${naam}`);
  }
}
