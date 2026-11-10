// De werkkopie van de ZekerFlex Bouwer: een eigen git-kopie van GitHub main in
// /werk/repo, met de gereedschappen die het model mag gebruiken. Lezen mag bijna
// overal; schrijven niet in de beveiliging, de pakketlijst, de uitrol-scripts of
// bestaande migraties. Die blijven mensenwerk. Het databaseschema mag alleen
// uitbreiden, via het gereedschap "migratie" (maakMigratie).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const WERK = process.env.BOUWER_WERK || "/werk";
export const REPO_DIR = path.join(WERK, "repo");
export const GITHUB_REPO = process.env.BOUWER_GITHUB_REPO || "briando979-netizen/zekerflex-finale";
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}.git`;
const MAX_UIT = 2_000_000;

// ---------------------------------------------------------------------------
// Waar de code vandaan komt: GitHub en onze eigen Git-server (Forgejo, deploy/forgejo),
// een privé spiegel van GitHub. Voor "main" wint GitHub altijd zolang hij bereikbaar is
// (wat live gaat, vertrouwt nooit op de spiegel; review 6d); valt GitHub weg, dan gaat
// het via Forgejo. Een losse vastlegging mag eerst bij Forgejo (git controleert de
// inhoud via de sha). "origin" blijft GitHub: daar pusht en
// rebaset server.mjs. De leestokens (alleen lezen) staan alleen in de omgeving:
// BOUWER_FORGEJO_TOKEN (gebruiker bouwer-lezen) en BOUWER_GITHUB_LEES_TOKEN (een
// fine-grained token, alleen deze repo, Contents read-only; nodig zodra de repo op
// GitHub privé is). Ze gaan via een credential helper naar git: nooit in een URL, log
// of .git/config, en nooit naar processen die door de AI gewijzigde code draaien.
// Zonder token: anoniem, zoals bij een openbare repo.
// ---------------------------------------------------------------------------
export const FORGEJO_URL = process.env.BOUWER_FORGEJO_URL || "https://git.37-97-226-24.sslip.io/zekerflex/zekerflex-finale.git";
const BRONNEN = [
  ["forgejo", FORGEJO_URL],
  ["github", GITHUB_URL],
];
const BRON_NAAM = { forgejo: "onze eigen Git-server", github: "GitHub" };
/** Per bron: de omgevingsvariabele met het leestoken en de gebruikersnaam die erbij hoort. */
const BRON_LOGIN = {
  forgejo: { url: FORGEJO_URL, env: "BOUWER_FORGEJO_TOKEN", gebruiker: "bouwer-lezen" },
  github: { url: GITHUB_URL, env: "BOUWER_GITHUB_LEES_TOKEN", gebruiker: "x-access-token" },
};

/** De geheimen die nooit naar door de AI gewijzigde code mogen. */
const SLEUTELS = new Set(["BOUWER_TOKEN", "BOUWER_FORGEJO_TOKEN", "BOUWER_GITHUB_LEES_TOKEN"]);

/** De omgeving zonder sleutels: voor processen die door de AI gewijzigde code draaien. */
export function omgevingZonderSleutel() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !SLEUTELS.has(k)));
}

/**
 * git-opties voor een bron: de credential helper voor die host. In de opdracht staat
 * alleen de NAAM van de omgevingsvariabele; het token zelf leest de helper uit de
 * omgeving van dat ene git-proces. Zonder token: geen opties (anoniem).
 */
export function bronOpties(bron) {
  const b = BRON_LOGIN[bron];
  if (!b || !process.env[b.env]) return [];
  const host = new URL(b.url).origin;
  return [
    "-c",
    `credential.${host}.helper=`,
    "-c",
    `credential.${host}.helper=!f() { if [ "$1" = get ]; then printf 'username=${b.gebruiker}\\npassword=%s\\n' "$${b.env}"; fi; }; f`,
  ];
}

/** Eerste keer klonen: eerst Forgejo, anders GitHub. Daarna wijst origin altijd naar GitHub. */
export async function kloon(doelMap, cwd, diepte, log) {
  for (const [bron, url] of BRONNEN) {
    await fs.rm(doelMap, { recursive: true, force: true });
    const r = await sh("git", [...bronOpties(bron), "clone", "-q", "--depth", String(diepte), "--branch", "main", url, doelMap], { cwd, timeout: 900_000 });
    if (r.code === 0) {
      await sh("git", ["remote", "set-url", "origin", GITHUB_URL], { cwd: doelMap, timeout: 30_000 });
      log?.("info", `Codebase opgehaald bij ${BRON_NAAM[bron]}`);
      return bron;
    }
    log?.("warn", `Klonen bij ${BRON_NAAM[bron]} mislukte: ${r.uit.trim().slice(-160)}`);
  }
  throw new Error("De codebase is niet op te halen: onze eigen Git-server en GitHub zijn allebei niet bereikbaar");
}

const isVoorouder = async (cwd, a, b) => (await sh("git", ["merge-base", "--is-ancestor", a, b], { cwd, timeout: 30_000 })).code === 0;

/**
 * Haalt main en zet refs/remotes/origin/main. Wat live gaat, vertrouwt nooit op de
 * spiegel zolang GitHub te bereiken is (review 6d): een pull-spiegel loopt nooit vóór
 * op GitHub; doet hij dat toch, dan heeft iemand in Forgejo geschreven (een beheerder,
 * of een gekaapt account achter de openbare inlogpagina).
 *   - GitHub bereikbaar: altijd GitHub. Wijkt Forgejo af en loopt hij niet gewoon
 *     achter (Forgejo geen voorouder van GitHub): een waarschuwing, Forgejo niet gebruikt.
 *   - GitHub onbereikbaar: Forgejo, met een duidelijke regel.
 * Geeft { sha, bron, afwijking }.
 */
export async function haalMain(cwd, diepte, log) {
  const gevonden = {};
  for (const [bron, url] of BRONNEN) {
    const r = await sh("git", [...bronOpties(bron), "fetch", "-q", "--depth", String(diepte), url, `+refs/heads/main:refs/remotes/${bron}/main`], { cwd, timeout: 600_000 });
    if (r.code === 0) gevonden[bron] = (await sh("git", ["rev-parse", `refs/remotes/${bron}/main`], { cwd, timeout: 30_000 })).uit.trim();
    else log?.("warn", `Main ophalen bij ${BRON_NAAM[bron]} mislukte: ${r.uit.trim().slice(-160)}`);
  }
  const f = gevonden.forgejo;
  const g = gevonden.github;
  if (!f && !g) throw new Error("Main is niet op te halen: onze eigen Git-server en GitHub zijn allebei niet bereikbaar");
  let sha;
  let bron;
  let afwijking = false;
  if (g) {
    sha = g;
    bron = "github";
    if (f && f !== g && !(await isVoorouder(cwd, f, g))) {
      afwijking = true;
      log?.("warn", `Onze eigen Git-server wijkt af van GitHub (${f.slice(0, 7)} tegenover ${g.slice(0, 7)}) en loopt niet gewoon achter: niet gebruikt. Kijk of iemand in Forgejo heeft geschreven.`);
    }
  } else {
    sha = f;
    bron = "forgejo";
    log?.("warn", "GitHub is niet bereikbaar: main via onze eigen Git-server");
  }
  await sh("git", ["update-ref", "refs/remotes/origin/main", sha], { cwd, timeout: 30_000 });
  log?.("info", `Main ${sha.slice(0, 7)} via ${bron === "forgejo" ? "onze eigen Git-server (GitHub onbereikbaar)" : "GitHub"}`);
  return { sha, bron, afwijking };
}

/** Eén vastlegging ophalen: eerst Forgejo, anders GitHub. Geeft de bron. */
export async function haalVastlegging(cwd, sha, diepte) {
  for (const [bron, url] of BRONNEN) {
    const r = await sh("git", [...bronOpties(bron), "fetch", "-q", "--depth", String(diepte), url, sha], { cwd, timeout: 600_000 });
    if (r.code === 0) return bron;
  }
  throw new Error(`Vastlegging ${sha} niet gevonden bij onze eigen Git-server of GitHub`);
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
  log("info", "Eerste keer: de codebase ophalen (eigen Git-server, GitHub als reserve)");
  await fs.mkdir(WERK, { recursive: true });
  await kloon(REPO_DIR, WERK, 200, log);
}

/** Verse branch bouwer/<id> op de nieuwste main; eerste keer klonen. */
export async function nieuweWerkkopie(id, log) {
  await zorgVoorKloon(log);
  await haalMain(REPO_DIR, 200, log);
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
  await haalMain(REPO_DIR, 200, log);
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

// ---- één zware stap tegelijk in deze container ---------------------------------------
// tsc vraagt ~2 GB; een opdracht van de Bouwer én een controle vóór het live zetten
// (controle.mjs) passen samen niet in de 3 GB van de container. Een slotbestand met
// wie en wanneer; ouder dan 40 minuten geldt als vergeten (afgebroken proces).
const ZWAAR_SLOT = path.join(WERK, "zwaar.lock");
const ZWAAR_VERLOPEN_MS = 40 * 60_000;

export async function verkrijgZwaarSlot(wie, log, maxWachtMs = 30 * 60_000) {
  const eind = Date.now() + maxWachtMs;
  let gemeld = false;
  for (;;) {
    try {
      const fh = await fs.open(ZWAAR_SLOT, "wx");
      await fh.writeFile(JSON.stringify({ wie, pid: process.pid, op: new Date().toISOString() }));
      await fh.close();
      return;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    const st = await fs.stat(ZWAAR_SLOT).catch(() => null);
    if (!st || Date.now() - st.mtimeMs > ZWAAR_VERLOPEN_MS) {
      await fs.rm(ZWAAR_SLOT, { force: true });
      continue;
    }
    if (Date.now() > eind) throw new Error("Een andere zware stap (controle of opdracht) houdt de Bouwer al een half uur bezet");
    if (!gemeld) {
      log?.("info", "Wachten tot een andere zware stap in de Bouwer klaar is");
      gemeld = true;
    }
    await new Promise((klaar) => setTimeout(klaar, 10_000));
  }
}

export async function geefZwaarSlotVrij() {
  await fs.rm(ZWAAR_SLOT, { force: true });
}

/** De gouden regels uit AGENTS.md: tsc op het hele project + eslint op de gewijzigde bestanden, plus de tests die erbij horen. */
export async function controleer(log) {
  await verkrijgZwaarSlot("opdracht", log);
  try {
    return await controleerZonderSlot(log);
  } finally {
    await geefZwaarSlotVrij();
  }
}

async function controleerZonderSlot(log) {
  const bestanden = (await gewijzigdeBestanden()).filter((b) => b.status !== "D").map((b) => b.pad);
  await wachtOpUitrol(log);
  // na bijwerken met main (of een eigen schemawijziging) moet de Prisma-client mee
  await zorgVoorPakketten(log);
  // een schemawijziging zonder migratie zou op de echte site kolommen missen
  let database;
  if (bestanden.includes("prisma/schema.prisma")) {
    log("info", "Controle: hoort er bij elke schemawijziging een migratie");
    const verschil = await schemaVerschil().catch((e) => ({ fout: e instanceof Error ? e.message : String(e) }));
    database =
      typeof verschil === "string"
        ? verschil
          ? { ok: false, uit: `Het schema wijkt af van de migraties. Roep "migratie" aan. Nog nodig:\n${verschil.slice(0, 3000)}` }
          : { ok: true, uit: "" }
        : { ok: false, uit: verschil.fout };
  }
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
    ok: tsc.code === 0 && eslint.code === 0 && tests.code === 0 && (database?.ok ?? true),
    tsc: { ok: tsc.code === 0, uit: kort(tsc.uit) },
    eslint: { ok: eslint.code === 0, uit: kort(eslint.uit) },
    tests: { ok: tests.code === 0, uit: staart(tests.uit) },
    ...(database ? { database } : {}),
    op: new Date().toISOString(),
  };
}

/** De omgeving voor tests: de wegwerp-database van het voorbeeld, zonder kleurcodes. Ook voor controle.mjs. */
export function testOmgeving() {
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
  // het schema mag (alleen uitbreiden, zie maakMigratie); migraties maakt alleen het gereedschap
  /^prisma\/(?!schema\.prisma$)/,
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
    naam: "migratie",
    beschrijving:
      "Na een wijziging in prisma/schema.prisma: maak de databasewijziging (migratie), pas hem toe op de demodatabase en werk de Prisma-client bij. Alleen uitbreiden: nieuwe tabellen, nieuwe kolommen die optioneel zijn of een standaardwaarde hebben, nieuwe indexen. Weghalen, hernoemen, van type veranderen of verplicht maken weigert hij. De eigenaar keurt de SQL goed bij het live zetten.",
    params: { naam: { type: "string", description: "Korte naam met underscores, bv. 'klant_notities'" } },
    verplicht: ["naam"],
  },
  {
    naam: "vraag",
    beschrijving:
      "Stel de eigenaar één korte vraag in gewone taal, en pauzeer tot het antwoord. Gebruik dit als de opdracht onduidelijk is (welke pagina, welke tekst) of om bij groot werk eerst je plan te laten goedkeuren. Niet voor dingen die je zelf in de code kunt opzoeken.",
    params: { vraag: { type: "string", description: "De vraag (en eventueel je plan in een paar zinnen)" } },
    verplicht: ["vraag"],
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
    case "migratie": {
      const korteNaam = String(args.naam ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60);
      if (!korteNaam) throw new Error("Geef de migratie een korte naam, bv. 'klant_notities'");
      return await maakMigratie(korteNaam, log);
    }
    default:
      throw new Error(`Onbekend gereedschap: ${naam}`);
  }
}

// ---- databasewijzigingen ----------------------------------------------------------

// Wat een migratie van de Bouwer nooit mag: alles wat gegevens kan kwijtraken of op
// een gevulde productietabel mislukt. De live-zetter vraagt daarna nog akkoord op de SQL.
const VERBODEN_SQL = [
  [/\bDROP\s+(TABLE|COLUMN|SCHEMA|TYPE|INDEX|CONSTRAINT|VIEW|DEFAULT)\b/i, "iets weghalen"],
  [/\b(TRUNCATE|DELETE\s+FROM|UPDATE\s+"|INSERT\s+INTO)\b/i, "gegevens wissen, wijzigen of toevoegen"],
  [/\bRENAME\b/i, "iets hernoemen"],
  [/\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i, "een kolom van type veranderen"],
  [/\bSET\s+NOT\s+NULL\b/i, "een bestaande kolom verplicht maken"],
];

/** Waarom deze SQL niet mag (lege lijst = in orde). Exporteert voor de tests. */
export function bezwarenTegenSql(sql) {
  const bezwaren = VERBODEN_SQL.filter(([re]) => re.test(sql)).map(([, wat]) => wat);
  // een verplichte nieuwe kolom zonder standaardwaarde mislukt op een tabel met rijen
  for (const stmt of sql.split(";")) {
    if (!/^\s*ALTER\s+TABLE/i.test(stmt.replace(/^\s*--.*$/gm, ""))) continue;
    for (const deel of stmt.split(/,\s*\n/)) {
      if (/\bADD\s+COLUMN\b/i.test(deel) && /\bNOT\s+NULL\b/i.test(deel) && !/\bDEFAULT\b/i.test(deel)) {
        bezwaren.push("een verplichte kolom zonder standaardwaarde toevoegen aan een bestaande tabel");
        break;
      }
    }
  }
  return [...new Set(bezwaren)];
}

/** Lege hulpdatabase op de demoserver waarin Prisma de bestaande migraties naspeelt. */
function schaduwUrl(db) {
  const u = new URL(db);
  u.pathname = "/schaduw";
  return u.toString();
}

async function prismaSql(url, sql) {
  const bestand = path.join(WERK, "bouwer-sql.sql");
  await fs.writeFile(bestand, sql);
  return sh("npx", ["prisma", "db", "execute", "--url", url, "--file", bestand], { timeout: 120_000, zonderSleutel: true });
}

/**
 * De SQL die nog nodig is om van de bestaande migraties naar prisma/schema.prisma te
 * komen ("" = niets). Prisma speelt de migraties daarvoor na in de schaduwdatabase.
 */
async function schemaVerschil() {
  const db = testOmgeving().DATABASE_URL;
  if (!db) throw new Error("Er is geen demodatabase ingesteld (BOUWER_VOORBEELD_DB); een databasewijziging kan hier niet.");
  // bestaat de schaduw al, dan meldt Postgres dat alleen; Prisma maakt hem zelf leeg
  await prismaSql(db, "CREATE DATABASE schaduw;");
  // aparte uitvoer: de SQL op stdout, meldingen (en de updatemelding) niet
  const uitBestand = path.join(WERK, "bouwer-diff.sql");
  const diff = await sh(
    "sh",
    [
      "-c",
      'npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$1" --script > "$2"',
      "sh",
      schaduwUrl(db),
      uitBestand,
    ],
    { timeout: 300_000, zonderSleutel: true, env: { PRISMA_HIDE_UPDATE_MESSAGE: "1" } },
  );
  if (diff.code !== 0) throw new Error(`Het schema klopt niet: ${diff.uit.trim().slice(-1500)}`);
  const sql = (await fs.readFile(uitBestand, "utf8")).trim();
  return !sql || /^--\s*This is an empty migration\.?$/im.test(sql) ? "" : sql;
}

async function maakMigratie(naam, log) {
  const env = testOmgeving();
  await wachtOpUitrol(log);
  log?.("info", "Databasewijziging berekenen");
  const sql = await schemaVerschil();
  if (!sql) return "Er is geen databasewijziging nodig: het schema is gelijk aan de bestaande migraties.";
  const bezwaren = bezwarenTegenSql(sql);
  if (bezwaren.length)
    throw new Error(
      `Deze wijziging mag niet (${bezwaren.join(", ")}). Alleen uitbreiden: nieuwe tabellen, optionele kolommen of kolommen met een standaardwaarde, nieuwe indexen. Pas prisma/schema.prisma aan en probeer opnieuw.\n\n${sql.slice(0, 3000)}`,
    );

  // map met tijdstempel ná de laatste bestaande migratie
  const mappen = (await fs.readdir(path.join(REPO_DIR, "prisma", "migrations"))).filter((m) => /^\d{14}_/.test(m)).sort();
  const laatste = Number((mappen.at(-1) ?? "0").slice(0, 14));
  const nu = Number(new Date().toISOString().replace(/\D/g, "").slice(0, 14));
  const map = `${Math.max(nu, laatste + 1)}_${naam}`;
  const abs = path.join(REPO_DIR, "prisma", "migrations", map);
  await fs.mkdir(abs, { recursive: true });
  await fs.writeFile(path.join(abs, "migration.sql"), `${sql}\n`);
  log?.("bestand", `nieuw prisma/migrations/${map}/migration.sql`);

  const toepassen = await sh("npx", ["prisma", "migrate", "deploy"], { env, timeout: 300_000, zonderSleutel: true });
  if (toepassen.code !== 0) {
    await fs.rm(abs, { recursive: true, force: true });
    throw new Error(`De wijziging lukte niet op de demodatabase (weer weggehaald): ${toepassen.uit.trim().slice(-1200)}`);
  }
  const gen = await sh("npx", ["prisma", "generate"], { timeout: 300_000 });
  if (gen.code !== 0) throw new Error(`prisma generate mislukt: ${gen.uit.slice(-600)}`);
  // de volgende opdracht (weer op main) ziet zo dat de client opnieuw moet
  const schema = await fs.readFile(path.join(REPO_DIR, "prisma", "schema.prisma"));
  await fs.writeFile(path.join(WERK, "schema.hash"), createHash("sha256").update(schema).digest("hex"));
  return `Migratie prisma/migrations/${map} gemaakt, toegepast op de demodatabase en de Prisma-client is bijgewerkt. De SQL:\n${sql.slice(0, 3000)}`;
}
