// Hulp voor de uitlegvideo's: stem (Piper op de VPS), schermopname per scene (Playwright) en samenvoegen (ffmpeg). Geen geheimen.
const { chromium } = require("playwright-core");
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const D = __dirname;
const W = path.join(__dirname, ".werk"); // tussenbestanden (niet in git)
fs.mkdirSync(W, { recursive: true });
const FF = process.env.FFMPEG_DIR ? process.env.FFMPEG_DIR.replace(/[\\/]*$/, "/") : ""; // map met ffmpeg en ffprobe; leeg = uit het pad
const BASIS = "https://zekerflex.com";
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

/** Spreekt een tekst in met onze eigen stem (Piper, nl-vrouw) en geeft het pad van de wav terug. */
function stem(tekst, naam) {
  const uit = `${W}/${naam}.wav`;
  const body = JSON.stringify({ model: "tts-1", input: tekst, voice: "nl-vrouw", response_format: "wav" });
  const r = spawnSync("ssh", ["-i", process.env.UITLEG_SSH_SLEUTEL, "-o", "ConnectTimeout=15", process.env.UITLEG_SSH_HOST, "curl -s -m 90 -X POST http://127.0.0.1:5000/v1/audio/speech -H 'Content-Type: application/json' -d @- -o -"], { input: body, maxBuffer: 100 * 1024 * 1024 });
  if (r.status !== 0 || r.stdout.length < 2000) throw new Error("stem mislukt voor " + naam + ": " + String(r.stdout.slice(0, 200)));
  fs.writeFileSync(uit, r.stdout);
  return uit;
}
function duur(bestand) {
  const o = execFileSync(FF + "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", bestand]).toString().trim();
  return Number(o);
}

/** Smooth scrollen naar y in ms. */
async function glij(page, y, ms) {
  await page.evaluate(([doel, t]) => new Promise((klaar) => {
    const van = window.scrollY; const begin = performance.now();
    const stap = (nu) => { const k = Math.min(1, (nu - begin) / t); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; window.scrollTo(0, van + (doel - van) * e); k < 1 ? requestAnimationFrame(stap) : klaar(); };
    requestAnimationFrame(stap);
  }), [y, ms]);
}
/** Beweegt de muis zichtbaar naar een element en klikt. */
async function klik(page, loc, ms = 700) {
  const el = typeof loc === "string" ? page.locator(loc).first() : loc;
  await el.scrollIntoViewIfNeeded();
  const bb = await el.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: Math.max(8, Math.round(ms / 25)) });
  await wacht(250);
  await el.click();
}
const CSS = `
  button[aria-label="Chat openen"], [data-chat-widget] { display: none !important; }
  #zf-muis { position: fixed; z-index: 2147483647; width: 22px; height: 22px; border-radius: 50%; background: rgba(79,224,160,.55); border: 2px solid #0c0e12; pointer-events: none; transform: translate(-50%,-50%); transition: transform .08s; }
`;

/**
 * Neemt één scene op: opent de pagina, haalt de cookiebalk weg (voor de opname telt), voert actie(page, seconden) uit en geeft
 * het pad van de webm en de seconden die voor de opname gebruikt zijn om op te starten (die knippen we er later af).
 */
async function neemOp({ naam, url, seconden, marks, actie, voor, viewport = { width: 1280, height: 720 }, opslag }) {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctxOpt = { viewport, deviceScaleFactor: 1 };
  if (opslag) ctxOpt.storageState = opslag;
  const ctx = await browser.newContext(ctxOpt);
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      const m = document.createElement("div"); m.id = "zf-muis"; m.style.left = "-50px"; m.style.top = "-50px"; document.body.appendChild(m);
      window.addEventListener("mousemove", (e) => { m.style.left = e.clientX + "px"; m.style.top = e.clientY + "px"; });
    });
  });
  if (voor) await voor(p);
  await p.goto(url.startsWith("http") ? url : BASIS + url, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
  await p.addStyleTag({ content: CSS });
  const ok = p.getByRole("button", { name: "Accepteren" });
  if (await ok.count()) await ok.first().click().catch(() => {});
  await wacht(700);
  // opname: losse beelden met hun tijdstempel, daarna ffmpeg
  const map = `${W}/${naam}-beelden`;
  fs.rmSync(map, { recursive: true, force: true });
  fs.mkdirSync(map, { recursive: true });
  const cdp = await ctx.newCDPSession(p);
  const frames = [];
  cdp.on("Page.screencastFrame", async (fr) => {
    frames.push({ t: fr.metadata.timestamp, data: fr.data });
    cdp.send("Page.screencastFrameAck", { sessionId: fr.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: viewport.width, maxHeight: viewport.height, everyNthFrame: 1 });
  const start = Date.now();
  await actie(p, seconden, marks);
  const rest = seconden * 1000 - (Date.now() - start);
  if (rest > 0) await wacht(rest);
  const eind = Date.now() / 1000;
  await cdp.send("Page.stopScreencast").catch(() => {});
  await ctx.close();
  await browser.close();
  if (frames.length < 2) throw new Error("te weinig beelden opgenomen: " + frames.length);
  const lijst = [];
  frames.forEach((fr, i) => {
    const bestand = `${map}/f${String(i).padStart(5, "0")}.jpg`;
    fs.writeFileSync(bestand, Buffer.from(fr.data, "base64"));
    const volgende = i + 1 < frames.length ? frames[i + 1].t : Math.max(fr.t + 0.04, eind - 0);
    lijst.push(`file '${bestand}'\nduration ${Math.max(0.01, volgende - fr.t).toFixed(4)}`);
  });
  lijst.push(`file '${map}/f${String(frames.length - 1).padStart(5, "0")}.jpg'`);
  const txt = `${map}/lijst.txt`;
  fs.writeFileSync(txt, lijst.join("\n"));
  const webm = `${W}/${naam}-ruw.mkv`;
  const r = spawnSync(FF + "ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", txt, "-vf", "fps=25,format=yuv420p", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", webm], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffmpeg beelden mislukt: " + r.stderr.slice(-400));
  fs.rmSync(map, { recursive: true, force: true });
  return { webm, trim: 0 };
}

/** Voegt de opname en de stem samen tot een mp4-scene van precies `seconden` lang. */
function scene({ webm, trim, wav, seconden, uit }) {
  const args = ["-y", "-ss", String(Math.max(0, trim - 0.1)), "-i", webm, "-i", wav, "-filter_complex",
    `[0:v]fps=25,scale=1280:720:flags=lanczos,format=yuv420p[v];[1:a]adelay=450|450,apad,aresample=44100[a]`,
    "-map", "[v]", "-map", "[a]", "-t", String(seconden), "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-maxrate", "900k", "-bufsize", "1800k", "-c:a", "aac", "-b:a", "56k", "-ac", "1", "-movflags", "+faststart", uit];
  const r = spawnSync(FF + "ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffmpeg scene mislukt: " + r.stderr.slice(-400));
}
function plak(scenes, uit) {
  const lijst = `${W}/${path.basename(uit, ".mp4")}-lijst.txt`;
  fs.writeFileSync(lijst, scenes.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
  const r = spawnSync(FF + "ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", lijst, "-c", "copy", "-movflags", "+faststart", uit], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffmpeg plak mislukt: " + r.stderr.slice(-400));
}
function poster(mp4, seconde, uit) {
  const r = spawnSync(FF + "ffmpeg", ["-y", "-ss", String(seconde), "-i", mp4, "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "4", uit], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("poster mislukt: " + r.stderr.slice(-300));
}

/** Maakt een hele video uit een lijst scenes: { url, tekst, actie }. */
async function maakVideo(slug, scenes, opties = {}) {
  const delen = [];
  for (let i = 0; i < scenes.length; i += 1) {
    const s = scenes[i];
    const naam = `${slug}-${i + 1}`;
    let wav, marks = [];
    if (Array.isArray(s.tekst)) {
      const delen = s.tekst.map((z, k) => stem(z, naam + "-z" + (k + 1)));
      const stilte = W + "/stilte.wav";
      spawnSync(FF + "ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", "0.4", "-c:a", "pcm_s16le", stilte]);
      let t = 0;
      const regels = [];
      delen.forEach((d, k) => { marks.push(t + 0.45); t += duur(d) + 0.4; regels.push("file '" + d.replace(/\\/g, "/") + "'"); regels.push("file '" + stilte.replace(/\\/g, "/") + "'"); });
      fs.writeFileSync(W + "/" + naam + "-z.txt", regels.join("\n"));
      wav = W + "/" + naam + "-alles.wav";
      const r = spawnSync(FF + "ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", W + "/" + naam + "-z.txt", "-c:a", "pcm_s16le", wav], { encoding: "utf8" });
      if (r.status !== 0) throw new Error("stem plakken mislukt: " + r.stderr.slice(-300));
    } else {
      wav = stem(s.tekst, naam);
    }
    const seconden = Math.round((duur(wav) + 1.2) * 10) / 10;
    console.log(`  scene ${i + 1}/${scenes.length}: ${seconden}s  ${s.url}`);
    const { webm, trim } = await neemOp({ naam, url: s.url, seconden: seconden + 0.4, marks, actie: s.actie, voor: s.voor, ...(s.viewport ? { viewport: s.viewport } : {}), ...(s.sessie ? { opslag: process.env.UITLEG_SESSIE } : {}) });
    const mp4 = `${W}/${naam}.mp4`;
    scene({ webm, trim, wav, seconden, uit: mp4 });
    delen.push(mp4);
  }
  const uit = `${W}/${slug}.mp4`;
  plak(delen, uit);
  return uit;
}
module.exports = { W, D, BASIS, wacht, glij, klik, maakVideo, poster, duur, FF };
