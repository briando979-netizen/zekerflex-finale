// Maakt de foto per kleur voor de webshop (15 nov 2026): klik je op een kleur, dan toont de productpagina de foto in
// die kleur (lib/shop/kleurfoto.ts zoekt /shop/<basis>-<kleur>.jpg). De productfoto's zijn vlakke tekeningen op wit:
// het kledingstuk is één kleur met schaduw. Hier krijgt alleen het kledingstuk een andere kleur, met dezelfde schaduw;
// de witte achtergrond en het groene ZF-logo (en de groene kraag) blijven zoals ze zijn.
//
// Gebruik: node scripts/shop-kleurfotos.mjs   (vanuit de projectmap; schrijft naar public/shop)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const MAP = path.join(process.cwd(), "public", "shop");

/** Wat er gemaakt wordt: bron, de kleur van het kledingstuk in de bron, doelbestand en doelkleur (RGB). */
const OPDRACHTEN = [
  { bron: "chino-broek-1.jpg", basis: [192, 168, 120], doel: "chino-broek-marineblauw.jpg", kleur: [38, 52, 84] },
  { bron: "fleece-vest-1.jpg", basis: [56, 56, 64], doel: "fleece-vest-zwart.jpg", kleur: [26, 26, 30] },
  // mintgroen ligt zo dicht bij wit dat ook de grijze schaduw en de witte letters zouden meekleuren: hier telt de tint
  // (meer groen dan rood), die hebben schaduw en letters niet
  { bron: "kids-tshirt-1.jpg", basis: [232, 248, 240], doel: "kids-tshirt-zwart.jpg", kleur: [34, 34, 38], tint: (r, g) => g - r },
  { bron: "thermo-bodywarmer-1.jpg", basis: [32, 28, 34], doel: "thermo-bodywarmer-unisex-marineblauw.jpg", kleur: [36, 50, 86] },
];
/** Dezelfde tekening in een andere kleur bestaat al: een kopie onder de naam van het andere product. */
const KOPIEEN = [
  { bron: "business-blouse-1.jpg", doel: "business-overhemd-lichtblauw.jpg" },
  { bron: "business-overhemd-1.jpg", doel: "business-blouse-wit.jpg" },
  { bron: "thermo-bodywarmer-1.jpg", doel: "thermo-bodywarmer-unisex-zwart.jpg" },
];

const helderheid = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const afstandTotWit = (r, g, b) => Math.hypot(255 - r, 255 - g, 255 - b);
/** Het groen van ZekerFlex (logo, kraag, rits): niet verkleuren. */
const isMerkGroen = (r, g, b) => g > r + 25 && g > b + 8 && r < 110;

/** Een masker één pixel laten groeien (4-buren). */
function groei(m, W, H) {
  const uit = m.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (m[p]) continue;
      if ((x > 0 && m[p - 1]) || (x < W - 1 && m[p + 1]) || (y > 0 && m[p - W]) || (y < H - 1 && m[p + W])) uit[p] = 1;
    }
  return uit;
}
/** Een masker vervagen (kastfilter, straal r) tot waarden tussen 0 en 1. */
function vervaag(m, W, H, r) {
  const tmp = new Float32Array(W * H);
  const uit = new Float32Array(W * H);
  const n = 2 * r + 1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let som = 0;
      for (let d = -r; d <= r; d++) som += m[y * W + Math.min(W - 1, Math.max(0, x + d))];
      tmp[y * W + x] = som / n;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let som = 0;
      for (let d = -r; d <= r; d++) som += tmp[Math.min(H - 1, Math.max(0, y + d)) * W + x];
      uit[y * W + x] = som / n;
    }
  return uit;
}

/** En één pixel laten krimpen. */
function krimp(m, W, H) {
  const uit = m.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (!m[p]) continue;
      if ((x > 0 && !m[p - 1]) || (x < W - 1 && !m[p + 1]) || (y > 0 && !m[p - W]) || (y < H - 1 && !m[p + W])) uit[p] = 0;
    }
  return uit;
}

/**
 * Voor een lichte tint (mintgroen): het kledingstuk als één gebied. Pixels met de tint, gaatjes van 2 px dicht
 * (JPEG-ruis); het logo met alles wat het groen insluit (de letters) blijft zoals het is; de lichte rand tussen
 * kledingstuk en logo krijgt de nieuwe kleur; de buitenrand loopt zacht af naar de achtergrond.
 */
async function verkleurTint({ bron, basis, doel, kleur, tint }) {
  const { data, info } = await sharp(path.join(MAP, bron)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const C = info.channels;
  const N = W * H;
  const groen = new Uint8Array(N);
  let stof = new Uint8Array(N);
  const basisTint = tint(...basis);
  for (let p = 0; p < N; p++) {
    const i = p * C;
    if (isMerkGroen(data[i], data[i + 1], data[i + 2])) groen[p] = 1;
    else if (tint(data[i], data[i + 1], data[i + 2]) >= basisTint * 0.4) stof[p] = 1;
  }
  stof = krimp(krimp(groei(groei(stof, W, H), W, H), W, H), W, H);
  // wat vanaf de rand bereikbaar is zonder groen te kruisen; de rest (binnen het logo) blijft zoals het is
  const bereik = new Uint8Array(N);
  const stapel = [];
  for (let x = 0; x < W; x++) stapel.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stapel.push(y * W, y * W + W - 1);
  while (stapel.length) {
    const p = stapel.pop();
    if (bereik[p] || groen[p]) continue;
    bereik[p] = 1;
    const x = p % W;
    if (x > 0) stapel.push(p - 1);
    if (x < W - 1) stapel.push(p + 1);
    if (p >= W) stapel.push(p - W);
    if (p < N - W) stapel.push(p + W);
  }
  let bijLogo = groen;
  for (let k = 0; k < 4; k++) bijLogo = groei(bijLogo, W, H);
  // een zachte rand: het masker van het kledingstuk 2 px vervaagd (geen kartels of witte spikkels langs de rand)
  const zacht = vervaag(stof, W, H, 2);
  let stofRuim = stof;
  for (let k = 0; k < 4; k++) stofRuim = groei(stofRuim, W, H);
  const uit = Buffer.from(data);
  const basisHelder = helderheid(basis);
  for (let p = 0; p < N; p++) {
    if (groen[p] || !bereik[p]) continue;
    const i = p * C;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let a;
    let schaduw = 1;
    if (stofRuim[p] && bijLogo[p]) a = 1; // de lichte rand tussen kledingstuk en logo
    else {
      a = zacht[p];
      if (a < 0.05) continue;
    }
    if (stof[p]) schaduw = Math.max(0.6, Math.min(1.2, helderheid([r, g, b]) / basisHelder));
    for (let k = 0; k < 3; k++) uit[i + k] = Math.round((1 - a) * data[i + k] + a * Math.min(255, kleur[k] * schaduw));
  }
  await sharp(uit, { raw: { width: W, height: H, channels: C } }).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(MAP, doel));
  console.log("gemaakt:", doel);
}

async function verkleur({ bron, basis, doel, kleur, tint }) {
  if (tint) return verkleurTint({ bron, basis, doel, kleur, tint });
  const { data, info } = await sharp(path.join(MAP, bron)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const uit = Buffer.from(data);
  const basisAfstand = afstandTotWit(...basis);
  const basisHelder = helderheid(basis);
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isMerkGroen(r, g, b)) continue;
    // hoeveel van deze pixel kledingstuk is (randen mengen met het wit van de achtergrond)
    const a = Math.min(1, afstandTotWit(r, g, b) / basisAfstand);
    if (a < 0.04) continue;
    // de kleur zonder het wit erdoor, en de schaduw ten opzichte van de basiskleur
    const ontmengd = [r, g, b].map((v) => (v - (1 - a) * 255) / a);
    const schaduw = Math.max(0.2, Math.min(1.6, helderheid(ontmengd) / basisHelder));
    for (let k = 0; k < 3; k++) {
      const nieuw = Math.max(0, Math.min(255, kleur[k] * schaduw));
      uit[i + k] = Math.round((1 - a) * 255 + a * nieuw);
    }
  }
  await sharp(uit, { raw: { width: info.width, height: info.height, channels: info.channels } }).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(MAP, doel));
  console.log("gemaakt:", doel);
}

for (const o of OPDRACHTEN) await verkleur(o);
for (const k of KOPIEEN) {
  fs.copyFileSync(path.join(MAP, k.bron), path.join(MAP, k.doel));
  console.log("gekopieerd:", k.doel);
}
