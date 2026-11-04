import {
  FORMATEN,
  bewegingOp,
  clipsOpSpoor,
  einde,
  filterTekst,
  klem,
  tekstAnimatie,
  vervaagFactor,
  zacht,
  type BeeldClip,
  type Project,
  type TekstClip,
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
  const px = Math.max(8, (c.grootte / 1000) * W);
  const zichtbaar = c.tekst.slice(0, anim.tekens);
  ctx.save();
  ctx.globalAlpha = klem(anim.dekking, 0, 1);
  ctx.font = `${c.vet ? 700 : 500} ${px}px "${c.lettertype}", "Bricolage Grotesque", Arial, sans-serif`;
  ctx.textBaseline = "middle";
  const maxB = c.breedte * W;
  // Regels afbreken op de HELE tekst, zodat typen niet verspringt.
  const regels = tekstRegels(ctx, c.tekst, maxB);
  const lh = px * 1.18;
  const hoogte = regels.length * lh;
  const cx = c.x * W;
  const cy = c.y * H + anim.dy * H;
  ctx.translate(cx, cy);
  if (anim.schaal !== 1) ctx.scale(anim.schaal, anim.schaal);
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
  let over = zichtbaar.length;
  const woordTijd = c.karaoke ? karaokeIndex(c, t) : -1;
  let woordTeller = 0;
  regels.forEach((regel, i) => {
    const y = -hoogte / 2 + lh * (i + 0.5);
    const deel = regel.slice(0, Math.max(0, over));
    over -= regel.length + 1;
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
  ctx.restore();
}

function karaokeIndex(c: TekstClip, t: number): number {
  const woorden = c.tekst.split(/\s+/).filter(Boolean);
  if (!woorden.length) return -1;
  const p = klem((t - c.start) / Math.max(0.1, c.duur), 0, 0.9999);
  return Math.floor(p * woorden.length);
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

