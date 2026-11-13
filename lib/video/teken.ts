import {
  FORMATEN,
  STIJL_VLAK,
  bewegingOp,
  clipsOpSpoor,
  einde,
  filterTekst,
  glitchStap,
  karaokeWoord,
  klem,
  mengKleur,
  tekstAnimatie,
  toeval,
  vervaagFactor,
  woordenVan,
  zaad,
  zacht,
  zichtbareRegels,
  type BeeldClip,
  type Project,
  type TekstClip,
  type TekstStand,
} from "@/lib/video/model";

// ---------------------------------------------------------------------------
// Tekent één beeldje van een project op een canvas. Gedeeld door het voorbeeld
// en de export, dus wat je ziet is precies wat er in de video komt. Bronnen
// (foto's, video-elementen) komen van buitenaf; deze module laadt zelf niets.
// ---------------------------------------------------------------------------

export type Bron = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap;

export interface Bronnen {
  /** Foto op adres. */
  foto(adres: string): Bron | null;
  /** Video-element van een clip (al op de juiste tijd gezet door de speler). */
  video(clipId: string): HTMLVideoElement | null;
}

function maat(b: Bron): { w: number; h: number } {
  if (b instanceof HTMLVideoElement) return { w: b.videoWidth, h: b.videoHeight };
  if (b instanceof HTMLImageElement) return { w: b.naturalWidth, h: b.naturalHeight };
  return { w: b.width, h: b.height };
}

function klaar(b: Bron | null): b is Bron {
  if (!b) return false;
  if (b instanceof HTMLVideoElement) return b.readyState >= 2 && b.videoWidth > 0;
  if (b instanceof HTMLImageElement) return b.complete && b.naturalWidth > 0;
  return true;
}

// ---- Glitch --------------------------------------------------------------------

// Werklagen voor de glitch (even groot als het beeld, hergebruikt per beeldje).
const lagen: (HTMLCanvasElement | undefined)[] = [];

/** Een lege werklaag van W×H, of null buiten de browser. */
function werkLaag(i: number, W: number, H: number): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  let c = lagen[i];
  if (!c) {
    c = document.createElement("canvas");
    lagen[i] = c;
  }
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.clearRect(0, 0, W, H);
  return ctx;
}

/**
 * Zet een getekende laag met glitch op het beeld: rood en groen/blauw schuiven
 * uit elkaar (RGB-split) en horizontale plakjes springen opzij. Zaad en stap
 * bepalen alles, dus voorbeeld en export zijn gelijk.
 */
function glitchOp(doel: CanvasRenderingContext2D, bron: HTMLCanvasElement, sterkte: number, z: number, stap: number, W: number, H: number) {
  const kanaal = werkLaag(1, W, H);
  const samen = werkLaag(2, W, H);
  let beeld: HTMLCanvasElement = bron;
  if (kanaal && samen) {
    const verschil = Math.max(1, Math.round(sterkte * W * 0.012));
    // Rood naar links, groen+blauw naar rechts; waar ze samenvallen staat het gewone beeld.
    for (const [kleur, dx] of [["#FF0000", -verschil], ["#00FFFF", verschil]] as const) {
      kanaal.globalCompositeOperation = "source-over";
      kanaal.clearRect(0, 0, W, H);
      kanaal.drawImage(bron, 0, 0);
      kanaal.globalCompositeOperation = "multiply";
      kanaal.fillStyle = kleur;
      kanaal.fillRect(0, 0, W, H);
      kanaal.globalCompositeOperation = "destination-in";
      kanaal.drawImage(bron, 0, 0);
      samen.globalCompositeOperation = "lighter";
      samen.drawImage(kanaal.canvas, dx, 0);
    }
    kanaal.globalCompositeOperation = "source-over";
    samen.globalCompositeOperation = "source-over";
    beeld = samen.canvas;
  }
  doel.save();
  doel.setTransform(1, 0, 0, 1, 0, 0);
  doel.globalAlpha = 1;
  doel.globalCompositeOperation = "source-over";
  doel.filter = "none";
  // Plakjes van wisselende hoogte; een deel schiet opzij.
  const basis = stap * 1009;
  for (let y = 0, i = 0; y < H; i++) {
    const h = Math.min(H - y, Math.max(2, Math.round(H * (0.012 + toeval(z, basis + i * 3) * 0.05))));
    const opzij = toeval(z, basis + i * 3 + 1) < 0.5 * sterkte;
    const dx = opzij ? Math.round((toeval(z, basis + i * 3 + 2) - 0.5) * 2 * sterkte * W * 0.08) : 0;
    doel.drawImage(beeld, 0, y, W, h, dx, y, W, h);
    y += h;
  }
  doel.restore();
}

/** Glitch-overgang: flikkert tussen het vorige en het nieuwe beeld, met RGB-split en verspringende plakjes. */
function tekenGlitchOvergang(ctx: CanvasRenderingContext2D, vorig: BeeldClip, nu: BeeldClip, t: number, p: number, W: number, H: number, bronnen: Bronnen) {
  const z = zaad(nu.id);
  const stap = glitchStap(t);
  // Hoe verder de overgang, hoe vaker het nieuwe beeld; het laatste stuk staat het vast.
  const nieuw = p > 0.85 || toeval(z, stap) < p;
  const clip = nieuw ? nu : vorig;
  const tc = nieuw ? t : Math.min(t, einde(vorig) - 0.001);
  const laag = werkLaag(0, W, H);
  if (!laag) {
    tekenBeeld(ctx, clip, tc, W, H, bronnen, null);
    return;
  }
  tekenBeeld(laag, clip, tc, W, H, bronnen, null);
  glitchOp(ctx, laag.canvas, 0.25 + 0.75 * Math.sin(Math.PI * p), z, stap, W, H);
}

/** Tekent een beeldclip; p = voortgang van een overgang (1 = geen overgang). */
function tekenBeeld(ctx: CanvasRenderingContext2D, c: BeeldClip, t: number, W: number, H: number, bronnen: Bronnen, overgang: { soort: BeeldClip["overgang"]; p: number; rol: "in" | "uit" } | null) {
  const voortgang = c.duur > 0 ? klem((t - c.start) / c.duur, 0, 1) : 0;
  let dekking = c.dekking * vervaagFactor(c, t);
  const kb = bewegingOp(c.beweging, voortgang);
  let extraSchaal = 1;
  let dx = 0;
  let dy = 0;
  let draai = 0;
  let wis: number | null = null;

  if (overgang && overgang.soort !== "geen") {
    const p = zacht(overgang.p);
    const q = overgang.rol === "in" ? p : 1 - p; // hoe ver de NIEUWE clip binnen is
    switch (overgang.soort) {
      case "vervagen":
        if (overgang.rol === "in") dekking *= q;
        break;
      case "schuiven":
        dx = overgang.rol === "in" ? (1 - q) * W : -q * W;
        break;
      case "zoom":
        if (overgang.rol === "in") {
          extraSchaal = 1.35 - 0.35 * q;
          dekking *= q;
        } else extraSchaal = 1 + 0.25 * q;
        break;
      case "wissen":
        if (overgang.rol === "in") wis = q;
        break;
      case "draaien":
        if (overgang.rol === "in") {
          draai = (1 - q) * -12;
          extraSchaal = 1.2 - 0.2 * q;
          dekking *= q;
        }
        break;
      default:
        break;
    }
  }
  if (dekking <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = klem(dekking, 0, 1);
  if (wis !== null) {
    ctx.beginPath();
    ctx.rect(0, 0, W * wis, H);
    ctx.clip();
  }
  const schaalPx = W / 1080;
  const filter = filterTekst(c.filters, schaalPx);
  if (filter) ctx.filter = filter;

  const cx = W / 2 + (c.plaatsing.x + kb.dx) * (W / 2) + dx;
  const cy = H / 2 + (c.plaatsing.y + kb.dy) * (H / 2) + dy;
  ctx.translate(cx, cy);
  const rad = ((c.plaatsing.draai + draai) * Math.PI) / 180;
  if (rad) ctx.rotate(rad);
  const s = c.plaatsing.schaal * kb.schaal * extraSchaal;

  if (c.soort === "kleur") {
    const w = W * s;
    const h = H * s;
    if (c.kleur2) {
      const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      g.addColorStop(0, c.kleur);
      g.addColorStop(1, c.kleur2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = c.kleur;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  } else {
    const bron = c.soort === "video" ? bronnen.video(c.id) : bronnen.foto(c.bron);
    if (klaar(bron)) {
      const m = maat(bron);
      const pas = c.passen === "vullen" ? Math.max(W / m.w, H / m.h) : Math.min(W / m.w, H / m.h);
      const w = m.w * pas * s;
      const h = m.h * pas * s;
      ctx.drawImage(bron, -w / 2, -h / 2, w, h);
    }
  }
  ctx.restore();
}

function tekstRegels(ctx: CanvasRenderingContext2D, tekst: string, maxB: number): string[] {
  const regels: string[] = [];
  for (const alinea of tekst.split("\n")) {
    const woorden = alinea.split(/\s+/).filter(Boolean);
    let regel = "";
    for (const w of woorden) {
      const proef = regel ? `${regel} ${w}` : w;
      if (ctx.measureText(proef).width > maxB && regel) {
        regels.push(regel);
        regel = w;
      } else regel = proef;
    }
    regels.push(regel);
  }
  return regels;
}

function afgerondVlak(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function tekenTekst(ctx: CanvasRenderingContext2D, c: TekstClip, t: number, W: number, H: number) {
  const anim = tekstAnimatie(c, t);
  if (anim.dekking <= 0.001) return;
  if (anim.glitch > 0.01) {
    // Eerst op een eigen laag, dan met glitch erop.
    const laag = werkLaag(0, W, H);
    if (laag) {
      tekenTekstInhoud(laag, c, t, W, H, anim);
      glitchOp(ctx, laag.canvas, anim.glitch, zaad(c.id), glitchStap(t), W, H);
      return;
    }
  }
  tekenTekstInhoud(ctx, c, t, W, H, anim);
}

function tekenTekstInhoud(ctx: CanvasRenderingContext2D, c: TekstClip, t: number, W: number, H: number, anim: TekstStand) {
  const px = Math.max(8, (c.grootte / 1000) * W);
  ctx.save();
  ctx.globalAlpha = klem(anim.dekking, 0, 1);
  // 3D-letters zo zwaar als het lettertype kan.
  ctx.font = `${c.stijl === "3d" ? 800 : c.vet ? 700 : 500} ${px}px "${c.lettertype}", "Bricolage Grotesque", Arial, sans-serif`;
  ctx.textBaseline = "middle";
  const maxB = c.breedte * W;
  ctx.translate(c.x * W, c.y * H + anim.dy * H);
  if (anim.schaal !== 1) ctx.scale(anim.schaal, anim.schaal);
  if (c.stijl === "bubbel-blauw" || c.stijl === "bubbel-groen") tekenBubbel(ctx, c, anim, px, maxB);
  else if (c.stijl === "venster") tekenVenster(ctx, c, t, anim, px, maxB);
  else tekenLosseTekst(ctx, c, t, anim, px, maxB);
  ctx.restore();
}

/** Chatbubbel (zoals iMessage): afgerond vlak met een staartje dat meegroeit met de tekst. */
function tekenBubbel(ctx: CanvasRenderingContext2D, c: TekstClip, anim: TekstStand, px: number, maxB: number) {
  const padX = px * 0.62;
  const padY = px * 0.36;
  const lh = px * 1.2;
  const stand = zichtbareRegels(tekstRegels(ctx, c.tekst, Math.max(px * 2, maxB - padX * 2)), c, anim);
  // Breedte van wat er al staat; het woord dat binnenkomt laat het vlak meegroeien.
  const breedtes = stand.map((r) => {
    const vol = r.vol ? ctx.measureText(r.vol).width : 0;
    if (!r.nieuw) return vol;
    const met = ctx.measureText(r.vol ? `${r.vol} ${r.nieuw}` : r.nieuw).width;
    return vol + (met - vol) * zacht(r.f);
  });
  const regelsInBeeld = Math.max(1, stand.reduce((n, r, i) => (r.vol || r.nieuw ? i + 1 : n), 0));
  const w = Math.max(px * 0.5, ...breedtes) + padX * 2;
  const h = regelsInBeeld * lh + padY * 2;
  const x = c.uitlijning === "links" ? -maxB / 2 : c.uitlijning === "rechts" ? maxB / 2 - w : -w / 2;
  const y = -h / 2;
  const kleur = c.achtergrond || STIJL_VLAK[c.stijl] || "#1E86FF";

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = px * 0.5;
  ctx.shadowOffsetY = px * 0.12;
  const verloop = ctx.createLinearGradient(0, y, 0, y + h);
  verloop.addColorStop(0, mengKleur(kleur, "#FFFFFF", 0.14));
  verloop.addColorStop(1, kleur);
  ctx.fillStyle = verloop;
  bubbelVorm(ctx, x, y, w, h, Math.min(h / 2, px * 0.85), c.uitlijning === "links", px);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "left";
  ctx.fillStyle = c.kleur;
  const basis = ctx.globalAlpha;
  stand.forEach((r, i) => {
    const ty = y + padY + lh * (i + 0.5);
    const tx = x + padX;
    if (r.vol) ctx.fillText(r.vol, tx, ty);
    if (r.nieuw) {
      ctx.globalAlpha = basis * zacht(r.f);
      ctx.fillText(r.nieuw, tx + (r.vol ? ctx.measureText(`${r.vol} `).width : 0), ty + (1 - zacht(r.f)) * px * 0.25);
      ctx.globalAlpha = basis;
    }
  });
}

/** Afgerond vlak plus staartje onderaan in één pad (zelfde draairichting, dus één vorm). */
function bubbelVorm(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, links: boolean, px: number) {
  afgerondVlak(ctx, x, y, w, h, r);
  const s = px * 0.5;
  const by = y + h;
  if (links) {
    const bx = x;
    ctx.moveTo(bx + s * 1.1, by - s * 0.2);
    ctx.quadraticCurveTo(bx + s * 0.2, by + s * 0.05, bx - s * 0.45, by + s * 0.28);
    ctx.quadraticCurveTo(bx + s * 0.1, by - s * 0.2, bx + s * 0.15, by - s * 0.9);
  } else {
    const bx = x + w;
    ctx.moveTo(bx - s * 0.15, by - s * 0.9);
    ctx.quadraticCurveTo(bx - s * 0.1, by - s * 0.2, bx + s * 0.45, by + s * 0.28);
    ctx.quadraticCurveTo(bx - s * 0.2, by + s * 0.05, bx - s * 1.1, by - s * 0.2);
  }
  ctx.closePath();
}

/** Venster: blauwe afgeronde kaart met titelbalk (drie stipjes); de tekst wordt regel voor regel getypt. */
function tekenVenster(ctx: CanvasRenderingContext2D, c: TekstClip, t: number, anim: TekstStand, px: number, maxB: number) {
  const pad = px * 0.7;
  const balk = px * 1.15;
  const lh = px * 1.22;
  const regels = tekstRegels(ctx, c.tekst, Math.max(px * 2, maxB - pad * 2));
  const stand = zichtbareRegels(regels, c, anim);
  // De kaart heeft meteen de maat van de hele tekst: typen laat hem niet groeien.
  const w = maxB;
  const h = balk + regels.length * lh + pad * 1.1;
  const x = -w / 2;
  const y = -h / 2;
  const kleur = c.achtergrond || STIJL_VLAK.venster || "#1F63F0";

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = px * 0.8;
  ctx.shadowOffsetY = px * 0.18;
  const verloop = ctx.createLinearGradient(0, y, 0, y + h);
  verloop.addColorStop(0, mengKleur(kleur, "#FFFFFF", 0.14));
  verloop.addColorStop(1, mengKleur(kleur, "#000000", 0.12));
  ctx.fillStyle = verloop;
  afgerondVlak(ctx, x, y, w, h, px * 0.75);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(1, px * 0.03);
  afgerondVlak(ctx, x, y, w, h, px * 0.75);
  ctx.stroke();

  // Titelbalk: drie stipjes en een dun lijntje eronder.
  const basis = ctx.globalAlpha;
  const r = px * 0.13;
  [0.9, 0.6, 0.35].forEach((a, i) => {
    ctx.beginPath();
    ctx.arc(x + pad + i * r * 3.2, y + balk / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fill();
  });
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(x + pad * 0.5, y + balk - px * 0.02, w - pad, Math.max(1, px * 0.03));

  // Tekst links, regel voor regel.
  ctx.textAlign = "left";
  ctx.fillStyle = c.kleur;
  let cursor = { x: x + pad, y: y + balk + pad * 0.45 + lh * 0.5 };
  for (const [i, rg] of stand.entries()) {
    const ty = y + balk + pad * 0.45 + lh * (i + 0.5);
    const tx = x + pad;
    if (rg.vol) ctx.fillText(rg.vol, tx, ty);
    let eind = tx + (rg.vol ? ctx.measureText(rg.vol).width : 0);
    if (rg.nieuw) {
      const nx = tx + (rg.vol ? ctx.measureText(`${rg.vol} `).width : 0);
      ctx.globalAlpha = basis * zacht(rg.f);
      ctx.fillText(rg.nieuw, nx, ty + (1 - zacht(rg.f)) * px * 0.25);
      ctx.globalAlpha = basis;
      eind = nx + ctx.measureText(rg.nieuw).width;
    }
    if (rg.vol || rg.nieuw) cursor = { x: eind, y: ty };
  }
  // Knipperende cursor: vast zolang er getypt wordt, daarna aan en uit.
  if (c.animatieIn === "typen" || c.animatieIn === "woorden") {
    const bezig = c.animatieIn === "typen" ? anim.tekens < c.tekst.length : anim.woorden < woordenVan(c.tekst).length;
    if (bezig || Math.floor((t - c.start) * 2.2) % 2 === 0) {
      ctx.globalAlpha = basis * 0.85;
      ctx.fillRect(cursor.x + px * 0.06, cursor.y - px * 0.45, px * 0.08, px * 0.9);
      ctx.globalAlpha = basis;
    }
  }
}

/** Gewone tekst (alle stijlen zonder eigen vlak, ook 3D). */
function tekenLosseTekst(ctx: CanvasRenderingContext2D, c: TekstClip, t: number, anim: TekstStand, px: number, maxB: number) {
  // Regels afbreken op de HELE tekst, zodat typen niet verspringt.
  const regels = tekstRegels(ctx, c.tekst, maxB);
  const lh = px * 1.18;
  const hoogte = regels.length * lh;
  const breedsteRegel = Math.max(...regels.map((r) => ctx.measureText(r).width));
  const ankerX = c.uitlijning === "links" ? -maxB / 2 : c.uitlijning === "rechts" ? maxB / 2 : 0;
  ctx.textAlign = c.uitlijning === "links" ? "left" : c.uitlijning === "rechts" ? "right" : "center";

  if (c.achtergrond || c.stijl === "kader") {
    const pad = px * 0.35;
    const bx = c.uitlijning === "links" ? ankerX - pad : c.uitlijning === "rechts" ? ankerX - breedsteRegel - pad : -breedsteRegel / 2 - pad;
    ctx.fillStyle = c.achtergrond || "rgba(0,0,0,0.55)";
    afgerondVlak(ctx, bx, -hoogte / 2 - pad * 0.6, breedsteRegel + pad * 2, hoogte + pad * 1.2, px * 0.28);
    ctx.fill();
  }

  // Per regel tekenen; bij typen alleen de tekens die al "getypt" zijn.
  const stand = zichtbareRegels(regels, c, anim);
  const woordTijd = c.karaoke ? karaokeWoord(c, t) : -1;
  let woordTeller = 0;
  const basis = ctx.globalAlpha;
  regels.forEach((regel, i) => {
    const y = -hoogte / 2 + lh * (i + 0.5);
    const r = stand[i];
    if (!r) return;
    if (c.animatieIn === "woorden") {
      // Woorden staan meteen op hun eindplek, dan verspringt de regel niet.
      const heel = ctx.measureText(regel).width;
      const x0 = ctx.textAlign === "center" ? ankerX - heel / 2 : ctx.textAlign === "right" ? ankerX - heel : ankerX;
      const oud = ctx.textAlign;
      ctx.textAlign = "left";
      if (r.vol) tekenStijl(ctx, c, r.vol, x0, y, px, c.kleur);
      if (r.nieuw) {
        ctx.globalAlpha = basis * zacht(r.f);
        tekenStijl(ctx, c, r.nieuw, x0 + (r.vol ? ctx.measureText(`${r.vol} `).width : 0), y + (1 - zacht(r.f)) * px * 0.25, px, c.kleur);
        ctx.globalAlpha = basis;
      }
      ctx.textAlign = oud;
      return;
    }
    const deel = r.vol;
    if (!deel) return;
    if (c.karaoke && woordTijd >= 0) {
      // Woord voor woord: het huidige woord krijgt de accentkleur.
      const woorden = deel.split(" ");
      const totaal = ctx.measureText(deel).width;
      let x = ctx.textAlign === "center" ? ankerX - totaal / 2 : ctx.textAlign === "right" ? ankerX - totaal : ankerX;
      const oud = ctx.textAlign;
      ctx.textAlign = "left";
      for (const w of woorden) {
        const nu = woordTeller === woordTijd;
        tekenStijl(ctx, c, w, x, y, px, nu ? "#4FE0A0" : c.kleur);
        x += ctx.measureText(`${w} `).width;
        woordTeller++;
      }
      ctx.textAlign = oud;
    } else tekenStijl(ctx, c, deel, ankerX, y, px, c.kleur);
  });
}

function tekenStijl(ctx: CanvasRenderingContext2D, c: TekstClip, s: string, x: number, y: number, px: number, kleur: string) {
  if (c.stijl === "omlijnd") {
    ctx.lineJoin = "round";
    ctx.lineWidth = px * 0.16;
    ctx.strokeStyle = "#000000";
    ctx.strokeText(s, x, y);
  } else if (c.stijl === "schaduw") {
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = px * 0.25;
    ctx.shadowOffsetY = px * 0.06;
  } else if (c.stijl === "neon") {
    ctx.shadowColor = kleur;
    ctx.shadowBlur = px * 0.6;
  } else if (c.stijl === "3d") {
    // Diepte: dezelfde tekst in lagen naar rechtsonder, achteraan het donkerst,
    // met een zachte slagschaduw onder de achterste laag.
    const lagen = 10;
    const stap = px * 0.011;
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = px * 0.3;
    ctx.shadowOffsetY = px * 0.08;
    ctx.fillStyle = mengKleur(kleur, "#000000", 0.75);
    ctx.fillText(s, x + lagen * stap, y + lagen * stap);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    for (let i = lagen - 1; i >= 1; i--) {
      ctx.fillStyle = mengKleur(kleur, "#000000", 0.42 + 0.33 * (i / lagen));
      ctx.fillText(s, x + i * stap, y + i * stap);
    }
  }
  ctx.fillStyle = kleur;
  ctx.fillText(s, x, y);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** Teken het hele project op tijdstip t. Het canvas bepaalt de resolutie. */
export function tekenFrame(ctx: CanvasRenderingContext2D, p: Project, t: number, bronnen: Bronnen) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.fillStyle = p.achtergrond;
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = "high";

  for (const spoor of p.sporen) {
    if (spoor.verborgen || spoor.soort === "audio") continue;
    const clips = clipsOpSpoor(p, spoor.id);
    if (spoor.soort === "tekst") {
      for (const c of clips) if (c.soort === "tekst" && t >= c.start && t < einde(c)) tekenTekst(ctx, c, t, W, H);
      continue;
    }
    const i = clips.findIndex((c) => t >= c.start && t < einde(c));
    const nu = clips[i];
    if (!nu || nu.soort === "tekst" || nu.soort === "audio") continue;
    const vorige = clips[i - 1];
    const vorigBeeld = vorige && (vorige.soort === "video" || vorige.soort === "foto" || vorige.soort === "kleur") ? vorige : null;
    if (vorigBeeld && nu.overgang !== "geen" && t - nu.start < nu.overgangDuur && Math.abs(einde(vorigBeeld) - nu.start) < 0.05) {
      const pr = klem((t - nu.start) / nu.overgangDuur, 0, 1);
      if (nu.overgang === "glitch") {
        tekenGlitchOvergang(ctx, vorigBeeld, nu, t, pr, W, H, bronnen);
        continue;
      }
      // De vorige clip blijft staan op zijn laatste beeld terwijl de nieuwe binnenkomt.
      tekenBeeld(ctx, vorigBeeld, Math.min(t, einde(vorigBeeld) - 0.001), W, H, bronnen, { soort: nu.overgang, p: pr, rol: "uit" });
      tekenBeeld(ctx, nu, t, W, H, bronnen, { soort: nu.overgang, p: pr, rol: "in" });
    } else tekenBeeld(ctx, nu, t, W, H, bronnen, null);
  }
  ctx.restore();
}

/** Resolutie van het canvas voor een project (schaal 1 = volle export-resolutie). */
export function canvasMaat(p: Pick<Project, "formaat">, schaal: number): { w: number; h: number } {
  const f = FORMATEN[p.formaat];
  // Even getallen: H.264 wil dat.
  return { w: Math.round((f.w * schaal) / 2) * 2, h: Math.round((f.h * schaal) / 2) * 2 };
}

