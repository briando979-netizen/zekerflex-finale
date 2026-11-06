#!/usr/bin/env node
// Bouwt de 3D-paskamer (/shop/paskamer) uit de CC0-bestanden van MakeHuman:
// het basismodel met vormen (man, vrouw, kind, slank/zwaar), huid, ogen,
// wenkbrauwen, wimpers, haar, kleding en schoenen. Eenmalig te draaien; de
// uitvoer (klein, binaire arrays + webp) staat in public/paskamer/3d en wordt
// meegecommit. De browser past lichaam en kleding live op de maten van de klant
// (lib/shop/paspop3d).
//
// Bronnen (CC0 1.0, zie public/paskamer/3d/LICENTIE.txt):
//   --mh   map met base.obj en targets/ uit github.com/makehumancommunity/makehuman (makehuman/data)
//   --sys  uitgepakte makehuman_system_assets_cc0.zip (clothes/, hair/, skins/, eyes/, eyebrows/, eyelashes/)
//   --uit  doelmap (standaard public/paskamer/3d)
//
// Gebruik: node scripts/paskamer/bouw-3d.mjs --mh <map> --sys <map> [--uit public/paskamer/3d] [--info]

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const arg = (naam, std) => {
  const i = process.argv.indexOf(`--${naam}`);
  return i > 0 ? process.argv[i + 1] : std;
};
const MH = arg("mh");
const SYS = arg("sys");
const UIT = arg("uit", "public/paskamer/3d");
const INFO = process.argv.includes("--info");
if (!MH || !SYS) {
  console.error("gebruik: node scripts/paskamer/bouw-3d.mjs --mh <map> --sys <map> [--uit <map>]");
  process.exit(1);
}
fs.mkdirSync(UIT, { recursive: true });

// ---------------------------------------------------------------------------
// Inlezen
// ---------------------------------------------------------------------------

function leesObj(bestand) {
  const v = [];
  const vt = [];
  const faces = [];
  let groep = "";
  for (const regel of fs.readFileSync(bestand, "utf8").split(/\r?\n/)) {
    if (regel.startsWith("v ")) {
      const [, x, y, z] = regel.trim().split(/\s+/);
      v.push(+x, +y, +z);
    } else if (regel.startsWith("vt ")) {
      const [, u, w] = regel.trim().split(/\s+/);
      vt.push(+u, +w);
    } else if (regel.startsWith("g ")) {
      groep = regel.slice(2).trim();
    } else if (regel.startsWith("f ")) {
      const hoeken = regel
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((h) => {
          const [a, b] = h.split("/");
          return { v: +a - 1, t: b ? +b - 1 : -1 };
        });
      faces.push({ groep, hoeken });
    }
  }
  return { v, vt, faces };
}

function leesTarget(bestand) {
  const m = new Map();
  for (const regel of fs.readFileSync(bestand, "utf8").split(/\r?\n/)) {
    if (!regel || regel.startsWith("#")) continue;
    const [i, x, y, z] = regel.trim().split(/\s+/);
    if (z === undefined) continue;
    m.set(+i, [+x, +y, +z]);
  }
  return m;
}

function leesMhclo(bestand) {
  const tekst = fs.readFileSync(bestand, "utf8").split(/\r?\n/);
  const r = { obj: "", scale: {}, verts: [], del: [] };
  let sectie = "";
  for (const ruw of tekst) {
    const regel = ruw.trim();
    if (!regel || regel.startsWith("#")) continue;
    const t = regel.split(/\s+/);
    if (t[0] === "verts") {
      sectie = "verts";
      continue;
    }
    if (t[0] === "delete_verts") {
      sectie = "del";
      continue;
    }
    if (sectie === "verts" && /^-?\d/.test(t[0])) {
      if (t.length >= 9) r.verts.push({ r: [+t[0], +t[1], +t[2]], w: [+t[3], +t[4], +t[5]], o: [+t[6], +t[7], +t[8]] });
      else r.verts.push({ r: [+t[0], +t[0], +t[0]], w: [1, 0, 0], o: [0, 0, 0] });
      continue;
    }
    if (sectie === "del" && /^\d/.test(t[0])) {
      for (let i = 0; i < t.length; i++) {
        if (t[i + 1] === "-") {
          for (let k = +t[i]; k <= +t[i + 2]; k++) r.del.push(k);
          i += 2;
        } else if (t[i] !== "-") r.del.push(+t[i]);
      }
      continue;
    }
    // kopregels (ook tussen "verts 0" en de getallen, zoals material) beëindigen een sectie niet
    if (t[0] === "obj_file") r.obj = t[1];
    if (t[0] === "x_scale" || t[0] === "y_scale" || t[0] === "z_scale") r.scale[t[0][0]] = [+t[1], +t[2], +t[3]];
  }
  return r;
}

// ---------------------------------------------------------------------------
// Binair wegschrijven: één .bin per onderdeel, de manifest kent de stukken
// ---------------------------------------------------------------------------

class Bin {
  constructor() {
    this.delen = [];
    this.lengte = 0;
    this.index = {};
  }
  zet(naam, typed) {
    const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (this.lengte % 4)) % 4;
    if (pad) this.delen.push(Buffer.alloc(pad)), (this.lengte += pad);
    this.index[naam] = { o: this.lengte, n: typed.length, t: typed.constructor.name.replace("Array", "") };
    this.delen.push(buf);
    this.lengte += buf.length;
  }
  schrijf(bestand) {
    fs.writeFileSync(path.join(UIT, bestand), Buffer.concat(this.delen));
    return { bin: bestand, stukken: this.index, bytes: this.lengte };
  }
}

/** Unieke (v, vt)-paren → weergavepunten; driehoeken uit vierhoeken (waaier). */
function weergave(obj, faces, uvFlipV = false) {
  const sleutel = new Map();
  const naarBron = [];
  const uv = [];
  const idx = [];
  for (const f of faces) {
    const ids = f.hoeken.map((h) => {
      const k = `${h.v}/${h.t}`;
      let i = sleutel.get(k);
      if (i === undefined) {
        i = naarBron.length;
        sleutel.set(k, i);
        naarBron.push(h.v);
        const u = h.t >= 0 ? obj.vt[h.t * 2] : 0;
        const w = h.t >= 0 ? obj.vt[h.t * 2 + 1] : 0;
        uv.push(u, uvFlipV ? 1 - w : w);
      }
      return i;
    });
    for (let k = 1; k + 1 < ids.length; k++) idx.push(ids[0], ids[k], ids[k + 1]);
  }
  const groot = naarBron.length > 65535;
  return { naarBron: Uint16Array.from(naarBron), uv: Float32Array.from(uv), idx: groot ? Uint32Array.from(idx) : Uint16Array.from(idx), aantal: naarBron.length };
}

// ---------------------------------------------------------------------------
// Basismodel en vormen
// ---------------------------------------------------------------------------

const base = leesObj(path.join(MH, "base.obj"));
const B = base.v;
const nBase = B.length / 3;
const lichaamFaces = base.faces.filter((f) => f.groep === "body");
const lichaam = weergave(base, lichaamFaces);

const groepPunten = (naam) => [...new Set(base.faces.filter((f) => f.groep === naam).flatMap((f) => f.hoeken.map((h) => h.v)))];
const zwaartepunt = (ids) => {
  const s = [0, 0, 0];
  for (const i of ids) for (let k = 0; k < 3; k++) s[k] += B[i * 3 + k];
  return s.map((x) => x / ids.length);
};
const GEWRICHTEN = ["head", "neck", "pelvis", "l-shoulder", "r-shoulder", "l-elbow", "r-elbow", "l-hand", "r-hand", "l-knee", "r-knee", "l-ankle", "r-ankle"];
const gewrichten = Object.fromEntries(GEWRICHTEN.map((g) => [g, groepPunten(`joint-${g}`)]));
const oogL = groepPunten("joint-l-eye");
const oogR = groepPunten("joint-r-eye");
const lichaamIds = [...new Set(lichaamFaces.flatMap((f) => f.hoeken.map((h) => h.v)))];
let ymin = Infinity;
let ymax = -Infinity;
for (const i of lichaamIds) (ymin = Math.min(ymin, B[i * 3 + 1])), (ymax = Math.max(ymax, B[i * 3 + 1]));
const ogen = zwaartepunt([...oogL, ...oogR]);
// kin: het laagste punt vooraan in het midden van het gezicht
let kin = -1;
for (const i of lichaamIds) {
  const x = B[i * 3];
  const y = B[i * 3 + 1];
  const z = B[i * 3 + 2];
  // de kin: het laagste punt vóór op het gezicht dat nog duidelijk vooruitsteekt (de keel ligt dieper)
  if (Math.abs(x) < 0.12 && z > ogen[2] + 0.1 && y < ogen[1] - 0.6 && y > ogen[1] - 1.6 && (kin < 0 || y < B[kin * 3 + 1])) kin = i;
}
let kruin = -1;
for (const i of lichaamIds) if (kruin < 0 || B[i * 3 + 1] > B[kruin * 3 + 1]) kruin = i;

const T = (n) => leesTarget(path.join(MH, "targets", `${n}.target`));
function mix(delen) {
  const m = new Map();
  for (const [target, w] of delen) for (const [i, d] of target) {
    const o = m.get(i) ?? [0, 0, 0];
    m.set(i, [o[0] + d[0] * w, o[1] + d[1] * w, o[2] + d[2] * w]);
  }
  return m;
}
const ras = (g, a) => ["african", "asian", "caucasian"].map((r) => [T(`${r}-${g}-${a}`), 1 / 3]);
const VORMEN = {
  heren: mix([...ras("male", "young"), [T("male-young-ideal"), 0.5]]),
  dames: mix([...ras("female", "young"), [T("female-young-ideal"), 0.5]]),
  kind: mix([...ras("male", "child").map(([t, w]) => [t, w / 2]), ...ras("female", "child").map(([t, w]) => [t, w / 2])]),
  "heren-zwaar": T("universal-male-young-averagemuscle-maxweight"),
  "heren-slank": T("universal-male-young-averagemuscle-minweight"),
  "dames-zwaar": T("universal-female-young-averagemuscle-maxweight"),
  "dames-slank": T("universal-female-young-averagemuscle-minweight"),
  "kind-zwaar": mix([[T("universal-male-child-averagemuscle-maxweight"), 0.5], [T("universal-female-child-averagemuscle-maxweight"), 0.5]]),
  "kind-slank": mix([[T("universal-male-child-averagemuscle-minweight"), 0.5], [T("universal-female-child-averagemuscle-minweight"), 0.5]]),
};

const lb = new Bin();
lb.zet("basis", Float32Array.from(B));
lb.zet("naarBron", lichaam.naarBron);
lb.zet("uv", lichaam.uv);
lb.zet("idx", lichaam.idx);
const vormInfo = {};
for (const [naam, m] of Object.entries(VORMEN)) {
  const ids = [...m.keys()].sort((a, b) => a - b);
  let max = 0;
  for (const i of ids) for (const d of m.get(i)) max = Math.max(max, Math.abs(d));
  const stap = max / 32000 || 1e-6;
  const q = new Int16Array(ids.length * 3);
  ids.forEach((i, k) => m.get(i).forEach((d, j) => (q[k * 3 + j] = Math.round(d / stap))));
  lb.zet(`v-${naam}-i`, Uint16Array.from(ids));
  lb.zet(`v-${naam}-d`, q);
  vormInfo[naam] = { stap, n: ids.length };
}
const lichaamUit = lb.schrijf("lichaam.bin");

// ---------------------------------------------------------------------------
// Aanhangsels (kleding, haar, ogen …): weergave + binding aan het basismodel
// ---------------------------------------------------------------------------

/** Waar een punt van een aanhangsel op het basismodel zit. */
const opBasis = (clo, pi) => {
  const b = clo.verts[pi];
  return [0, 1, 2].map((as) => b.r.reduce((s, r, j) => s + b.w[j] * B[r * 3 + as], 0) + b.o[as]);
};

/** Ligt een punt (op het basismodel) op een arm? Voor mouwloze stukken. */
const schouder = zwaartepunt(gewrichten["l-shoulder"]);
const elleboog = zwaartepunt(gewrichten["l-elbow"]);
const handG = zwaartepunt(gewrichten["l-hand"]);
function isArm(p) {
  const q = [Math.abs(p[0]), p[1], p[2]];
  const seg = (a, b) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const aq = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
    const t = Math.max(0, Math.min(1, (aq[0] * ab[0] + aq[1] * ab[1] + aq[2] * ab[2]) / l2));
    return { t, d: Math.hypot(aq[0] - t * ab[0], aq[1] - t * ab[1], aq[2] - t * ab[2]) };
  };
  const boven = seg(schouder, elleboog);
  const onder = seg(elleboog, handG);
  return q[0] > schouder[0] * 0.97 && ((boven.t > 0.08 && boven.d < 0.85) || onder.d < 0.8);
}

/** Bij elkaar horende stukken (verbonden via hun punten), met hun gemiddelde hoogte op het basismodel. */
function stukken(obj, clo) {
  const n = obj.v.length / 3;
  const ouder = Int32Array.from({ length: n }, (_, i) => i);
  const zoek = (i) => (ouder[i] === i ? i : (ouder[i] = zoek(ouder[i])));
  for (const f of obj.faces) for (let k = 1; k < f.hoeken.length; k++) ouder[zoek(f.hoeken[k].v)] = zoek(f.hoeken[0].v);
  const yVan = (pi) => {
    const b = clo.verts[pi];
    return b.r.reduce((s, r, j) => s + b.w[j] * B[r * 3 + 1], 0) + b.o[1];
  };
  const groepen = new Map();
  obj.faces.forEach((f, fi) => {
    const g = zoek(f.hoeken[0].v);
    const s = groepen.get(g) ?? { faces: [], ysom: 0, yn: 0, ymin: Infinity, ymax: -Infinity };
    s.faces.push(fi);
    for (const h of f.hoeken) {
      const y = yVan(h.v);
      s.ysom += y;
      s.yn++;
      s.ymin = Math.min(s.ymin, y);
      s.ymax = Math.max(s.ymax, y);
    }
    groepen.set(g, s);
  });
  return [...groepen.values()].map((s) => ({ ...s, y: s.ysom / s.yn }));
}

async function textuur(bron, doel, { max = 1024, q = 85, grijs = false, alpha = false } = {}) {
  if (!bron || !fs.existsSync(bron)) return null;
  let p = sharp(bron).resize(max, max, { fit: "inside", withoutEnlargement: true });
  if (grijs) p = p.grayscale();
  await p.webp({ quality: q, alphaQuality: 90, ...(alpha ? {} : {}) }).toFile(path.join(UIT, doel));
  return doel;
}

/** Haar en wenkbrauwen in grijs met behoud van doorzichtigheid, zodat elke haarkleur kan (kleur × textuur). */
async function grijsMetAlpha(bron, doel, max = 1024) {
  if (!bron || !fs.existsSync(bron)) return null;
  const { data, info } = await sharp(bron).resize(max, max, { fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let som = 0;
  let tel = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue;
    som += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    tel++;
  }
  const gem = tel ? som / tel : 128;
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = Math.max(0, Math.min(255, Math.round((l / gem) * 175)));
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 88, alphaQuality: 95 }).toFile(path.join(UIT, doel));
  return doel;
}

/** Gemiddelde huidkleur van een textuur (lineair 0–1), om de huid op de gezichtsfoto af te stemmen. */
async function gemKleur(bron) {
  const { data } = await sharp(bron).resize(256, 256).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const s = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < data.length; i += 3) {
    if (data[i] + data[i + 1] + data[i + 2] < 60) continue;
    for (let k = 0; k < 3; k++) s[k] += data[i + k];
    n++;
  }
  return s.map((x) => Math.round((x / Math.max(1, n)) * 10) / 10);
}

/** Een grijze detailkaart om kleding in elke kleur te kunnen tonen: AO × (licht gedempte) helderheid van de stof. */
async function detailKaart(diffuse, ao, doel, { stof = 0.45, max = 1024 } = {}) {
  const grootte = max;
  const lees = async (b) => (b && fs.existsSync(b) ? (await sharp(b).resize(grootte, grootte, { fit: "fill" }).grayscale().raw().toBuffer()) : null);
  const d = await lees(diffuse);
  const a = await lees(ao);
  if (!d && !a) return null;
  const n = grootte * grootte;
  let som = 0;
  let tel = 0;
  if (d) for (let i = 0; i < n; i++) if (d[i] > 8) (som += d[i]), tel++;
  const gem = tel ? som / tel : 128;
  const uit = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    const lum = d ? 1 + ((d[i] - gem) / 255) * 2 * stof : 1;
    const occ = a ? 0.35 + (a[i] / 255) * 0.65 : 1;
    uit[i] = Math.max(0, Math.min(255, Math.round(225 * lum * occ)));
  }
  await sharp(uit, { raw: { width: grootte, height: grootte, channels: 1 } }).webp({ quality: 88 }).toFile(path.join(UIT, doel));
  return doel;
}

/**
 * Eén aanhangsel uitschrijven. `deel` kiest stukken uit een combinatiepak
 * (bovenstuk of broek) op hun hoogte; `delY` beperkt de verborgen huid tot dat deel.
 */
async function aanhangsel(id, map, naam, opties = {}) {
  const clo = leesMhclo(path.join(map, `${naam}.mhclo`));
  const obj = leesObj(path.join(map, clo.obj || `${naam}.obj`));
  let faces = obj.faces;
  if (opties.deel) {
    const st = stukken(obj, clo);
    const gekozen = st.filter(opties.deel);
    faces = gekozen.flatMap((s) => s.faces).sort((a, b) => a - b).map((fi) => obj.faces[fi]);
  }
  if (opties.vlak) faces = faces.filter((f) => opties.vlak(f.hoeken.map((h) => opBasis(clo, h.v))));
  // alleen de gebruikte punten van het aanhangsel
  const gebruikt = [...new Set(faces.flatMap((f) => f.hoeken.map((h) => h.v)))].sort((a, b) => a - b);
  const nieuw = new Map(gebruikt.map((v, i) => [v, i]));
  const facesN = faces.map((f) => ({ hoeken: f.hoeken.map((h) => ({ v: nieuw.get(h.v), t: h.t })) }));
  const w = weergave(obj, facesN);
  const refs = new Uint16Array(gebruikt.length * 3);
  const wts = new Float32Array(gebruikt.length * 3);
  const off = new Float32Array(gebruikt.length * 3);
  gebruikt.forEach((pv, i) => {
    const b = clo.verts[pv];
    for (let k = 0; k < 3; k++) {
      refs[i * 3 + k] = b.r[k];
      wts[i * 3 + k] = b.w[k];
      off[i * 3 + k] = b.o[k];
    }
  });
  let del = clo.del;
  if (opties.delY) del = del.filter((i) => opties.delY(B[i * 3 + 1]));
  const bin = new Bin();
  bin.zet("naarBron", w.naarBron);
  bin.zet("uv", w.uv);
  bin.zet("idx", w.idx);
  bin.zet("refs", refs);
  bin.zet("wts", wts);
  bin.zet("off", off);
  bin.zet("del", Uint16Array.from(del));
  const geschreven = bin.schrijf(`${id}.bin`);
  const tex = {};
  if (opties.tex) Object.assign(tex, await opties.tex(map, naam, id));
  return { ...geschreven, schaal: clo.scale, punten: gebruikt.length, weergave: w.aantal, tex, ...(opties.meta ?? {}) };
}

const C = (n) => path.join(SYS, "clothes", n);
const H = (n) => path.join(SYS, "hair", n);
const kledingTex = (stof = 0.45) => async (map, naam, id) => ({
  detail: await detailKaart(path.join(map, `${naam}_diffuse.png`), path.join(map, `${naam}_ao.png`), `${id}-detail.webp`, { stof }),
  normaal: await textuur(path.join(map, `${naam}_normal.png`), `${id}-normaal.webp`, { q: 90 }),
});
const eigenTex = async (map, naam, id) => ({
  kleur: await textuur(path.join(map, `${naam}_diffuse.png`), `${id}.webp`, { q: 86 }),
  normaal: await textuur(path.join(map, `${naam}_normal.png`), `${id}-normaal.webp`, { q: 90 }),
});

if (INFO) {
  // Toon de stukken van de combinatiepakken (hoogte op het basismodel) om de splitsing te kiezen.
  for (const n of ["male_casualsuit06", "male_casualsuit01", "male_casualsuit02", "male_casualsuit03", "male_casualsuit04", "male_casualsuit05", "male_elegantsuit01", "male_worksuit01", "female_casualsuit01", "female_casualsuit02", "female_elegantsuit01", "female_sportsuit01", "shoes03", "shoes06"]) {
    const clo = leesMhclo(path.join(C(n), `${n}.mhclo`));
    const obj = leesObj(path.join(C(n), clo.obj));
    const st = stukken(obj, clo).sort((a, b) => b.y - a.y);
    console.log(n, st.map((s) => `${s.faces.length}f y${s.y.toFixed(2)} [${s.ymin.toFixed(1)}..${s.ymax.toFixed(1)}]`).join(" | "));
  }
  console.log("lichaam y", ymin.toFixed(2), "..", ymax.toFixed(2), "ogen", ogen.map((x) => x.toFixed(2)), "kin", kin, B.slice(kin * 3, kin * 3 + 3).map((x) => x.toFixed(2)), "kruin", kruin);
  process.exit(0);
}

const SPLIT = Number(arg("taille", "0.9")); // hoogte (dm) tussen bovenstuk en broek op het basismodel
const boven = (s) => s.y > SPLIT;
const onder = (s) => s.y <= SPLIT;

const delen = {};
const zet = async (id, map, naam, opties) => {
  delen[id] = await aanhangsel(id, map, naam, opties);
  console.log("klaar", id, delen[id].punten, "punten", delen[id].bytes, "bytes");
};

// kleding: bovenstukken en broeken uit de combinatiepakken (opnieuw in te kleuren)
await zet("shirt-h", C("male_casualsuit06"), "male_casualsuit06", { deel: boven, delY: (y) => y > SPLIT - 0.6, tex: kledingTex(0), meta: { kleurbaar: true } });
await zet("broek-h", C("male_casualsuit06"), "male_casualsuit06", { deel: onder, delY: (y) => y <= SPLIT + 0.6, tex: kledingTex(0.35), meta: { kleurbaar: true } });
await zet("overhemd-h", C("male_casualsuit03"), "male_casualsuit03", { deel: boven, delY: (y) => y > SPLIT - 0.6, tex: kledingTex(0), meta: { kleurbaar: true } });
await zet("lang-h", C("male_casualsuit02"), "male_casualsuit02", { deel: boven, delY: (y) => y > SPLIT - 0.6, tex: kledingTex(0), meta: { kleurbaar: true } });
await zet("jas-h", C("male_casualsuit05"), "male_casualsuit05", { deel: boven, delY: (y) => y > SPLIT - 0.6, tex: kledingTex(0.3), meta: { kleurbaar: true } });
await zet("shirt-d", C("female_casualsuit01"), "female_casualsuit01", { deel: boven, delY: (y) => y > SPLIT - 0.6, tex: kledingTex(0), meta: { kleurbaar: true } });
await zet("broek-d", C("female_casualsuit01"), "female_casualsuit01", { deel: onder, delY: (y) => y <= SPLIT + 0.6, tex: kledingTex(0.35), meta: { kleurbaar: true } });
await zet("blouse-d", C("female_elegantsuit01"), "female_elegantsuit01", { deel: boven, delY: (y) => y > SPLIT - 0.6, tex: kledingTex(0), meta: { kleurbaar: true } });
// mouwloos: hesje uit het T-shirt, bodywarmer uit de jas (de mouwen eraf)
const geenArm = (pts) => !pts.some(isArm);
await zet("hesje", C("male_casualsuit06"), "male_casualsuit06", { deel: boven, vlak: geenArm, delY: () => false, tex: kledingTex(0), meta: { kleurbaar: true } });
await zet("bodywarmer", C("male_casualsuit05"), "male_casualsuit05", { deel: boven, vlak: geenArm, delY: () => false, tex: kledingTex(0.15), meta: { kleurbaar: true } });
// schoenen (eigen kleuren, met sokken)
await zet("werkschoen", C("shoes03"), "shoes03", { tex: eigenTex });
await zet("sneaker", C("shoes06"), "shoes06", { tex: eigenTex });
await zet("sneaker-wit", C("shoes05"), "shoes05", { tex: eigenTex });
await zet("schoen-zwart", C("shoes04"), "shoes04", { tex: eigenTex });
// haar
const haarTex = async (map, naam, id) => ({
  grijs: await grijsMetAlpha(path.join(map, `${naam}_diffuse.png`), `${id}-grijs.webp`),
  normaal: await textuur(path.join(map, `${naam}_normal.png`), `${id}-normaal.webp`, { q: 90 }),
});
await zet("haar-kort", H("short02"), "short02", { tex: haarTex, meta: { haar: true } });
await zet("haar-staart", H("ponytail01"), "ponytail01", { tex: haarTex, meta: { haar: true } });
await zet("haar-bob", H("bob02"), "bob02", { tex: haarTex, meta: { haar: true } });
// ogen, wenkbrauwen, wimpers
await zet("ogen", path.join(SYS, "eyes", "high-poly"), "high-poly", {
  tex: async (_m, _n, id) => ({ bruin: await textuur(path.join(SYS, "eyes", "materials", "brown_eye.png"), `${id}-bruin.webp`, { max: 512 }), blauw: await textuur(path.join(SYS, "eyes", "materials", "blue_eye.png"), `${id}-blauw.webp`, { max: 512 }) }),
});
await zet("wenkbrauwen", path.join(SYS, "eyebrows", "eyebrow001"), "eyebrow001", { tex: async (m, n, id) => ({ grijs: await grijsMetAlpha(path.join(m, `${n}.png`), `${id}-grijs.webp`, 512) }), meta: { haar: true } });
await zet("wimpers", path.join(SYS, "eyelashes", "eyelashes01"), "eyelashes01", { tex: async (m, n, id) => ({ kleur: await textuur(path.join(m, `${n}.png`), `${id}.webp`, { max: 512, alpha: true }) }), meta: { haar: true } });

// huid: licht, midden, donker voor man en vrouw (het kind gebruikt die van de vrouw)
const huid = {};
const huidGem = {};
for (const [id, map, bestand] of [
  ["licht-h", "young_caucasian_male", "young_lightskinned_male_diffuse.png"],
  ["midden-h", "young_asian_male", "young_lightskinned_male_diffuse3.png"],
  ["donker-h", "young_african_male", "young_darkskinned_male_diffuse.png"],
  ["licht-d", "young_caucasian_female", "young_lightskinned_female_diffuse.png"],
  ["midden-d", "young_asian_female", "young_lightskinned_female_diffuse3.png"],
  ["donker-d", "young_african_female", "young_darkskinned_female_diffuse.png"],
]) {
  huid[id] = await textuur(path.join(SYS, "skins", map, bestand), `huid-${id}.webp`, { max: 2048, q: 84 });
  huidGem[id] = await gemKleur(path.join(SYS, "skins", map, bestand));
}

const manifest = {
  versie: 1,
  bron: "MakeHuman (CC0 1.0) — basismodel, vormen, huid, haar, ogen, kleding en schoenen",
  eenheid: "dm",
  lichaam: { ...lichaamUit, vormen: vormInfo, punten: nBase, weergave: lichaam.aantal, ymin, ymax, ogen: { l: oogL, r: oogR }, kin, kruin, gewrichten },
  delen,
  huid,
  huidGem,
};
fs.writeFileSync(path.join(UIT, "manifest.json"), JSON.stringify(manifest));
fs.writeFileSync(
  path.join(UIT, "LICENTIE.txt"),
  "De 3D-onderdelen in deze map (lichaam, vormen, huid, haar, ogen, kleding, schoenen) zijn afgeleid van MakeHuman.\nDie bestanden zijn uitgebracht onder CC0 1.0 Universal (publiek domein): https://creativecommons.org/publicdomain/zero/1.0/\nBron: https://github.com/makehumancommunity/makehuman en makehuman_system_assets_cc0.zip (makehumancommunity.org).\nGebouwd met scripts/paskamer/bouw-3d.mjs.\n",
);
const totaal = fs.readdirSync(UIT).reduce((s, f) => s + fs.statSync(path.join(UIT, f)).size, 0);
console.log(`klaar: ${Object.keys(delen).length} onderdelen, ${Object.keys(huid).length} huiden, ${(totaal / 1024 / 1024).toFixed(1)} MB in ${UIT}`);
