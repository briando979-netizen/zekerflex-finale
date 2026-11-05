// De controle vóór het live zetten: de eigen "CI" van ZekerFlex, op de eigen server.
// Een tweede, losse git-kopie van GitHub main in /werk/controle/repo (met eigen
// node_modules), waarop voor één vastlegging de gouden regels uit AGENTS.md draaien:
// TypeScript op het hele project, eslint op de gewijzigde bestanden en de bestaande
// tests die die bestanden raken (vitest related, op de demodatabase van het voorbeeld).
// De uitslag staat in /werk/controle/uitslagen/<sha>.json; de nieuwste 60 blijven.
//
// Wie roept dit aan?
//   - de live-zetter (deploy/bouwer/zf-live.py), vóór hij bouwt:
//       docker exec zekerflex-bouwer-1 node /opt/bouwer/controle.mjs --sha <doel> --vanaf <live> --geen-wacht
//     Faalt de controle, dan gaat die versie niet live (tenzij "zonder controle").
//   - de app elke 10 minuten (cron → /api/internal/controles/tick → POST /controles in
//     server.mjs): de nieuwste main wordt alvast gecontroleerd, zodat de uitslag er al
//     ligt als iemand op "Live zetten" drukt, en Admin ziet of main schoon is.
// Eén zware stap tegelijk in deze container (verkrijgZwaarSlot in werkkopie.mjs), en
// buiten de live-zetter om wacht hij op een lopende uitrol (wachtOpUitrol).
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GITHUB_REPO, WERK, geefZwaarSlotVrij, sh, testOmgeving, verkrijgZwaarSlot, wachtOpUitrol } from "./werkkopie.mjs";

export const CONTROLE_DIR = path.join(WERK, "controle");
const REPO = path.join(CONTROLE_DIR, "repo");
const UITSLAGEN = path.join(CONTROLE_DIR, "uitslagen");
const LAATSTE = path.join(CONTROLE_DIR, "laatste.sha");
const REPO_URL = `https://github.com/${GITHUB_REPO}.git`;
const BEWAAR = 60;
// meer gewijzigde bestanden dan dit (bv. een grote hernoeming): dan alleen tsc
const MAX_LINT = 250;

const bestaat = (p) => fs.access(p).then(() => true, () => false);
const hashVan = (buf) => createHash("sha256").update(buf).digest("hex");
const kortTekst = (t, n = 80) => t.trim().split("\n").slice(0, n).join("\n");
const staartTekst = (t, n = 80) => t.trim().split("\n").slice(-n).join("\n");
const isSha = (s) => /^[0-9a-f]{7,40}$/.test(String(s ?? ""));

async function git(args, opts = {}) {
  const r = await sh("git", args, { cwd: REPO, timeout: 300_000, ...opts });
  if (r.code !== 0) throw new Error(`git ${args.filter((a) => !a.startsWith("-")).slice(0, 2).join(" ")}: ${r.uit.trim().slice(-400)}`);
  return r.uit.trim();
}

async function zorgVoorKloon(log) {
  if (await bestaat(path.join(REPO, ".git"))) return;
  log("info", "Eerste keer: eigen kopie van de codebase voor de controle ophalen");
  await fs.mkdir(CONTROLE_DIR, { recursive: true });
  const r = await sh("git", ["clone", "--depth", "300", "--branch", "main", REPO_URL, REPO], { cwd: CONTROLE_DIR, timeout: 900_000 });
  if (r.code !== 0) throw new Error(`git clone mislukt: ${r.uit.trim().slice(-400)}`);
}

/** npm ci + prisma generate, alleen als package-lock.json of het databaseschema veranderde (zoals de werkkopie). */
async function zorgVoorPakketten(log) {
  const lockHash = hashVan(await fs.readFile(path.join(REPO, "package-lock.json")));
  const schemaHash = hashVan(await fs.readFile(path.join(REPO, "prisma", "schema.prisma")).catch(() => Buffer.alloc(0)));
  const lees = (p) => fs.readFile(p, "utf8").catch(() => "");
  const merkLock = path.join(CONTROLE_DIR, "pakketten.hash");
  const merkSchema = path.join(CONTROLE_DIR, "schema.hash");
  const pakkettenOk = (await lees(merkLock)) === lockHash && (await bestaat(path.join(REPO, "node_modules", ".bin", "tsc")));
  if (pakkettenOk && (await lees(merkSchema)) === schemaHash) return;
  if (!pakkettenOk) {
    log("info", "Pakketten installeren (npm ci, enkele minuten)");
    const ci = await sh("npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: REPO, timeout: 1_200_000 });
    if (ci.code !== 0) throw new Error(`npm ci mislukt: ${ci.uit.slice(-600)}`);
  } else {
    log("info", "Databaseschema veranderd: Prisma-client bijwerken");
  }
  const gen = await sh("npx", ["prisma", "generate"], { cwd: REPO, timeout: 300_000 });
  if (gen.code !== 0) throw new Error(`prisma generate mislukt: ${gen.uit.slice(-600)}`);
  await fs.writeFile(merkLock, lockHash);
  await fs.writeFile(merkSchema, schemaHash);
}

async function kent(sha) {
  return (await sh("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: REPO, timeout: 30_000 })).code === 0;
}

/** "main" → de nieuwste op GitHub; anders een sha (zo nodig gericht opgehaald). Geeft de volledige sha. */
async function losOp(doel) {
  await git(["fetch", "-q", "--depth", "300", "origin", "main"], { timeout: 600_000 });
  if (doel === "main" || doel === "origin/main") return git(["rev-parse", "origin/main"]);
  if (!isSha(doel)) throw new Error(`Onbekende vastlegging: ${doel}`);
  if (!(await kent(doel))) await git(["fetch", "-q", "--depth", "300", "origin", doel], { timeout: 600_000 });
  return git(["rev-parse", `${doel}^{commit}`]);
}

/** De bestanden die veranderden tussen de basis (live, of de vorige controle) en deze vastlegging. */
async function gewijzigdSinds(vanaf, sha) {
  let basis = isSha(vanaf) && (await kent(vanaf)) ? vanaf : null;
  if (basis && (await sh("git", ["merge-base", "--is-ancestor", basis, sha], { cwd: REPO, timeout: 30_000 })).code !== 0) basis = null;
  const bereik = basis ? `${basis}..${sha}` : `${sha}~1..${sha}`;
  const r = await sh("git", ["diff", "--name-only", "--diff-filter=ACMR", bereik], { cwd: REPO, timeout: 60_000 });
  if (r.code !== 0) return { basis: null, bestanden: [] };
  return { basis: basis ?? `${sha}~1`, bestanden: r.uit.split("\n").map((s) => s.trim()).filter(Boolean) };
}

export async function uitslagVan(sha) {
  try {
    return JSON.parse(await fs.readFile(path.join(UITSLAGEN, `${sha}.json`), "utf8"));
  } catch {
    return null;
  }
}

export async function lijstUitslagen(n = 30) {
  const namen = (await fs.readdir(UITSLAGEN).catch(() => [])).filter((x) => /^[0-9a-f]{40}\.json$/.test(x));
  const alle = (await Promise.all(namen.map((x) => uitslagVan(x.slice(0, -5))))).filter(Boolean);
  return alle.sort((a, b) => b.begon.localeCompare(a.begon)).slice(0, n);
}

export async function laatsteSha() {
  return (await fs.readFile(LAATSTE, "utf8").catch(() => "")).trim() || null;
}

async function bewaarUitslag(u) {
  await fs.mkdir(UITSLAGEN, { recursive: true });
  const tmp = path.join(UITSLAGEN, `${u.sha}.json.tmp`);
  await fs.writeFile(tmp, JSON.stringify(u));
  await fs.rename(tmp, path.join(UITSLAGEN, `${u.sha}.json`));
  await fs.writeFile(LAATSTE, u.sha);
  for (const oud of (await lijstUitslagen(1000)).slice(BEWAAR)) await fs.rm(path.join(UITSLAGEN, `${oud.sha}.json`), { force: true });
}

/**
 * Controleer één vastlegging. Een bestaande uitslag voor dezelfde sha komt terug zonder
 * opnieuw te draaien (tenzij opnieuw). vanaf = de versie die nu live staat; zonder vanaf
 * de vorige gecontroleerde vastlegging, en anders alleen de laatste vastlegging zelf.
 */
export async function controleerVastlegging({ doel = "main", vanaf = null, wacht = true, opnieuw = false, door = "onbekend", log = () => {} }) {
  await zorgVoorKloon(log);
  const sha = await losOp(doel);
  if (!opnieuw) {
    const bekend = await uitslagVan(sha);
    if (bekend) {
      log("info", `Uitslag van ${sha.slice(0, 7)} lag al klaar (${bekend.ok ? "schoon" : "faalt"})`);
      return bekend;
    }
  }
  if (wacht) await wachtOpUitrol(log);
  await verkrijgZwaarSlot("controle", log);
  const begon = new Date();
  try {
    const onderwerp = await git(["log", "-1", "--format=%s", sha]);
    log("info", `Controle van ${sha.slice(0, 7)}: ${onderwerp}`);
    await git(["checkout", "-q", "-f", "--detach", sha]);
    await git(["clean", "-fdq"]);
    await zorgVoorPakketten(log);
    const { basis, bestanden } = await gewijzigdSinds(vanaf ?? (await laatsteSha()), sha);
    log("info", `${bestanden.length} gewijzigd(e) bestand(en) sinds ${basis ? basis.slice(0, 7) : "?"}`);

    log("info", "TypeScript (hele project)");
    const tsc = await sh("npx", ["tsc", "--noEmit", "-p", "."], { cwd: REPO, timeout: 1_500_000 });

    const lintbaar = bestanden.filter((p) => /\.(tsx?|mjs|js)$/.test(p) && !p.startsWith("node_modules/"));
    let eslint = { ok: true, uit: "", overgeslagen: lintbaar.length ? null : "geen gewijzigde code" };
    let tests = { ok: true, uit: "", overgeslagen: lintbaar.length ? null : "geen gewijzigde code" };
    if (lintbaar.length > MAX_LINT) {
      const reden = `${lintbaar.length} gewijzigde bestanden, te veel om per bestand te controleren`;
      eslint = { ok: true, uit: "", overgeslagen: reden };
      tests = { ok: true, uit: "", overgeslagen: reden };
    } else if (lintbaar.length) {
      log("info", `eslint op ${lintbaar.length} bestand(en)`);
      const r = await sh("npx", ["eslint", ...lintbaar], { cwd: REPO, timeout: 900_000 });
      eslint = { ok: r.code === 0, uit: kortTekst(r.uit), overgeslagen: null };
      log("info", "Tests die bij de wijziging horen");
      const env = testOmgeving();
      // tests met een database draaien op de wegwerp-database van het voorbeeld (alleen demogegevens)
      if (env.DATABASE_URL) await sh("npx", ["prisma", "migrate", "deploy"], { cwd: REPO, env, timeout: 300_000, zonderSleutel: true });
      const t = await sh("npx", ["vitest", "related", "--run", "--passWithNoTests", "--maxWorkers=2", ...lintbaar], {
        cwd: REPO,
        env,
        timeout: 1_200_000,
        zonderSleutel: true,
      });
      tests = { ok: t.code === 0, uit: staartTekst(t.uit), overgeslagen: null };
    }
    const klaar = new Date();
    const u = {
      sha,
      kort: sha.slice(0, 7),
      onderwerp,
      vanaf: basis,
      bestanden: bestanden.length,
      ok: tsc.code === 0 && eslint.ok && tests.ok,
      tsc: { ok: tsc.code === 0, uit: kortTekst(tsc.uit) },
      eslint,
      tests,
      door,
      begon: begon.toISOString(),
      klaar: klaar.toISOString(),
      duurSec: Math.round((klaar.getTime() - begon.getTime()) / 1000),
    };
    await bewaarUitslag(u);
    log(u.ok ? "klaar" : "fout", `Controle ${u.ok ? "schoon" : "faalt"} na ${u.duurSec} s`);
    return u;
  } finally {
    await geefZwaarSlotVrij();
  }
}

/** Voor lijsten: zonder de lange uitvoer. */
export function samenvattingControle(u) {
  return {
    sha: u.sha,
    kort: u.kort,
    onderwerp: u.onderwerp,
    ok: u.ok,
    tsc: u.tsc.ok,
    eslint: u.eslint.ok,
    tests: u.tests.ok,
    bestanden: u.bestanden,
    door: u.door,
    begon: u.begon,
    klaar: u.klaar,
    duurSec: u.duurSec,
  };
}

// ---- opdrachtregel (docker exec vanuit de live-zetter) --------------------------------
// Voortgang op stderr, de uitslag als één regel JSON op stdout.
// Afsluitcode 0 = schoon, 1 = faalt, 2 = de controle zelf kon niet draaien.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (naam) => {
    const i = process.argv.indexOf(naam);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const vlag = (naam) => process.argv.includes(naam);
  const log = (soort, tekst) => process.stderr.write(`[controle] ${soort}: ${tekst}\n`);
  controleerVastlegging({
    doel: arg("--sha") ?? "main",
    vanaf: arg("--vanaf") ?? null,
    wacht: !vlag("--geen-wacht"),
    opnieuw: vlag("--opnieuw"),
    door: arg("--door") ?? "opdrachtregel",
    log,
  })
    .then((u) => {
      process.stdout.write(`${JSON.stringify(u)}\n`);
      process.exit(u.ok ? 0 : 1);
    })
    .catch((e) => {
      log("fout", e instanceof Error ? e.message : String(e));
      process.exit(2);
    });
}
