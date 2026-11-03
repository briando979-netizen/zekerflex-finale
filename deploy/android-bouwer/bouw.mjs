// Eén Android-bouw voor de Android-bouwer (server.mjs): een Bubblewrap-project
// (Trusted Web Activity) uit de gegevens van de app → gradle bundleRelease →
// ondertekenen met de uploadsleutel van de rijschool. De sleutel komt per
// opdracht van de app (verzegeld bewaard) en staat alleen tijdens de bouw op
// schijf; bestaat hij nog niet, dan maakt de bouw er een en geeft hem terug.
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { X509Certificate } from "node:crypto";
import core from "@bubblewrap/core";

const { TwaGenerator, TwaManifest, fetchUtils } = core;
// De iconen komen van een tijdelijke server op 127.0.0.1 (gewone http)
fetchUtils.setFetchEngine("node-fetch");

export const WERK = process.env.ANDROID_BOUWER_WERK || "/werk";
const SLOT = "/zf-slot/deploy.lock";
const ALIAS = "upload";
const JAVA_HOME = process.env.JAVA_HOME || "/opt/java/openjdk";

export const bouwMap = (id) => path.join(WERK, "bouw", id);

/** Een opdracht draaien; wachtwoorden alleen via env, nooit als argument. */
export function sh(cmd, args, { cwd, env, timeout = 120_000, invoer } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    let uit = "";
    const lees = (b) => {
      uit += b.toString();
      if (uit.length > 400_000) uit = uit.slice(-200_000);
    };
    p.stdout.on("data", lees);
    p.stderr.on("data", lees);
    const klok = setTimeout(() => p.kill("SIGKILL"), timeout);
    p.on("error", (e) => {
      clearTimeout(klok);
      resolve({ code: -1, uit: `${uit}\n${e.message}` });
    });
    p.on("close", (code) => {
      clearTimeout(klok);
      resolve({ code: code ?? -1, uit });
    });
    if (invoer) p.stdin.end(invoer);
    else p.stdin.end();
  });
}

const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

/** Gradle is zwaar: niet tegelijk met een uitrol (vps-update.sh houdt het slot exclusief vast). */
async function wachtOpUitrol(log) {
  const begin = Date.now();
  for (;;) {
    try {
      await fs.access(SLOT);
    } catch {
      return; // geen slot (bv. bij het opwarmen tijdens de image-bouw)
    }
    const r = await sh("flock", ["-n", "-s", "-E", "75", SLOT, "true"], { timeout: 10_000 });
    if (r.code !== 75) return;
    if (Date.now() - begin > 30 * 60_000) throw new Error("Er loopt al 30 minuten een uitrol; probeer het later opnieuw.");
    log("Er loopt een uitrol van ZekerFlex; de bouw wacht even.");
    await slaap(15_000);
  }
}

const laatsteRegels = (tekst, n = 40) => tekst.split(/\r?\n/).filter(Boolean).slice(-n).join("\n");
const veiligeNaam = (s) => String(s).replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 60) || "Rijschool";

/**
 * @param {string} id
 * @param {{ manifest: Record<string, any>, icoon: string, maskeerbaar?: string, sleutel: { wachtwoord: string, keystore?: string } }} opdracht
 * @param {(regel: string) => void} log
 */
export async function bouw(id, opdracht, log) {
  const map = bouwMap(id);
  const project = path.join(map, "project");
  const keystore = path.join(map, "upload.keystore");
  await fs.rm(project, { recursive: true, force: true });
  await fs.mkdir(project, { recursive: true });
  const m = opdracht.manifest;
  const env = { ...process.env, JAVA_HOME, ZF_SLEUTEL_WW: opdracht.sleutel.wachtwoord };

  // 1. Iconen tijdelijk aanbieden: Bubblewrap haalt ze op via een adres
  const iconen = {
    "/icoon.png": Buffer.from(opdracht.icoon, "base64"),
    "/maskeerbaar.png": Buffer.from(opdracht.maskeerbaar || opdracht.icoon, "base64"),
  };
  const server = http.createServer((req, res) => {
    const b = iconen[req.url ?? ""];
    if (!b) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": "image/png", "content-length": b.length }).end(b);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const basis = `http://127.0.0.1:${server.address().port}`;

  try {
    log("Android-project maken…");
    const twa = new TwaManifest({
      packageId: m.pakketnaam,
      host: m.host,
      name: m.naam,
      launcherName: m.korteNaam,
      display: "standalone",
      themeColor: m.kleur,
      themeColorDark: m.kleur,
      navigationColor: m.kleur,
      navigationColorDark: m.kleur,
      navigationDividerColor: m.kleur,
      navigationDividerColorDark: m.kleur,
      backgroundColor: m.achtergrond,
      enableNotifications: false,
      startUrl: m.startUrl,
      iconUrl: `${basis}/icoon.png`,
      maskableIconUrl: `${basis}/maskeerbaar.png`,
      splashScreenFadeOutDuration: 300,
      signingKey: { path: keystore, alias: ALIAS },
      appVersion: m.versieNaam,
      appVersionCode: m.versie,
      shortcuts: [],
      generatorApp: "zekerflex",
      fallbackType: "customtabs",
      features: {},
      alphaDependencies: { enabled: false },
      enableSiteSettingsShortcut: true,
      isChromeOSOnly: false,
      isMetaQuest: false,
      fullScopeUrl: `https://${m.host}${m.scope}`,
      minSdkVersion: 24,
      orientation: "portrait",
      fingerprints: [],
      additionalTrustedOrigins: [],
      retainedBundles: [],
      displayOverride: [],
    });
    const stil = { debug() {}, info() {}, warn: (t) => log(`let op: ${t}`), error: (t) => log(`fout: ${t}`), setVerbose() {} };
    await new TwaGenerator().createTwaProject(project, twa, stil);
  } finally {
    server.close();
  }

  // 2. Bouwen
  await wachtOpUitrol(log);
  log("App bouwen (gradle, een paar minuten)…");
  const g = await sh("./gradlew", ["bundleRelease", "--no-daemon", "--console=plain", "--warning-mode=none"], {
    cwd: project,
    env,
    timeout: 25 * 60_000,
  });
  if (g.code !== 0) {
    log(laatsteRegels(g.uit));
    throw new Error("De Android-bouw is mislukt (gradle).");
  }

  // 3. Uploadsleutel: die van de rijschool, of een nieuwe
  let nieuweSleutel = null;
  if (opdracht.sleutel.keystore) {
    await fs.writeFile(keystore, Buffer.from(opdracht.sleutel.keystore, "base64"), { mode: 0o600 });
  } else {
    log("Uploadsleutel maken…");
    const naam = veiligeNaam(m.naam);
    const k = await sh(
      "keytool",
      ["-genkeypair", "-keystore", keystore, "-storetype", "PKCS12", "-alias", ALIAS, "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-dname", `CN=${naam}, O=${naam}, C=NL`, "-storepass:env", "ZF_SLEUTEL_WW", "-keypass:env", "ZF_SLEUTEL_WW"],
      { env },
    );
    if (k.code !== 0) throw new Error(`Sleutel maken mislukt: ${laatsteRegels(k.uit, 5)}`);
    nieuweSleutel = (await fs.readFile(keystore)).toString("base64");
  }

  // 4. Ondertekenen
  log("Ondertekenen…");
  const ongetekend = path.join(project, "app/build/outputs/bundle/release/app-release.aab");
  const aab = path.join(map, "app.aab");
  const j = await sh(
    "jarsigner",
    ["-keystore", keystore, "-storepass:env", "ZF_SLEUTEL_WW", "-keypass:env", "ZF_SLEUTEL_WW", "-sigalg", "SHA256withRSA", "-digestalg", "SHA-256", "-signedjar", aab, ongetekend, ALIAS],
    { env },
  );
  if (j.code !== 0) throw new Error(`Ondertekenen mislukt: ${laatsteRegels(j.uit, 5)}`);
  const c = await sh("keytool", ["-exportcert", "-rfc", "-keystore", keystore, "-alias", ALIAS, "-storepass:env", "ZF_SLEUTEL_WW"], { env });
  if (c.code !== 0) throw new Error("Vingerafdruk lezen mislukt.");
  const vingerafdruk = new X509Certificate(c.uit.slice(c.uit.indexOf("-----BEGIN"))).fingerprint256;

  // Alleen het resultaat blijft bewaard; het project en de sleutel gaan weg
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(keystore, { force: true });
  const grootte = (await fs.stat(aab)).size;
  log(`Klaar: versie ${m.versieNaam} (${(grootte / 1_000_000).toFixed(1)} MB).`);
  return { vingerafdruk, grootte, ...(nieuweSleutel ? { nieuweSleutel } : {}) };
}
