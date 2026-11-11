import type { Block, Page } from "@/lib/sites/types";
import { kickerVoor, kopMaat, splitKop, tickerWoorden, type BelevingCtx } from "@/lib/sites/beleving-render";

// ---------------------------------------------------------------------------
// De stijl "3D" (id "diepte", 11 nov 2026). De eigenaar vroeg om voorbeeldsites
// die veel uitbundiger zijn: "echte 3D, geen nep. Dat er iets uitspringt, knalt
// en op je afkomt." Zo'n site is beleving (lib/sites/beleving-render.ts) met een
// echte 3D-ruimte erbij. Een klantsite heeft geen scripts (sandbox-CSP), dus
// alles is CSS: perspectief, transform-style: preserve-3d en animaties die het
// scrollen volgen (animation-timeline). Niets is een filmpje of een getekende
// illusie; de browser rekent elke foto en elke letter echt in 3D uit.
// - De opening is een vlucht. Je kijkt een tunnel in met de foto's van het
//   bedrijf op verschillende diepten, met lichtstrepen. Scrol je, dan vlieg je
//   erdoorheen: de kop komt op je af en schiet langs, de foto's zwiepen voorbij
//   en de foto van de opening vult aan het eind het hele scherm.
// - De koppen hebben diepte: tien lagen achter elkaar, zoals echte 3D-letters.
// - De galerij is een ring van foto's die meedraait als je scrolt.
// - Kaarten, stappen, foto's en de afsluiter springen uit de diepte naar voren.
// Alles beweegt alleen als je zelf scrolt. Niets beweegt vanzelf (WCAG 2.2.2).
// Wie minder beweging wil (systeeminstelling), of een browser die het niet kan,
// ziet dezelfde 3D-ruimte stil.
// ---------------------------------------------------------------------------

/** Minstens zoveel foto's voor de vlucht (één eindpunt plus twee onderweg); anders de opening van beleving. */
export const MIN_VLUCHT_FOTOS = 3;
const MAX_VLUCHT_FOTOS = 9;
/** Minstens zoveel foto's voor de ring; minder geeft de gewone galerij (met diepte). */
export const MIN_RING_FOTOS = 5;
const MAX_RING_FOTOS = 12;
/** Lagen achter een kop. */
const ECHO_KOP = 10;
const ECHO_BAND = 8;
const ECHO_CIJFER = 6;

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const rad = (graden: number) => (graden * Math.PI) / 180;

/**
 * De foto's voor de vlucht. De eerste is die van de opening (het eindpunt).
 * Daarna komen de andere foto's van deze pagina en dan die van andere pagina's.
 */
export function vluchtFotos(heroFoto: string | null, page: Page, pages: Page[]): string[] {
  const ids: string[] = [];
  const add = (id: string | null | undefined) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  const uit = (p: Page) => {
    for (const b of p.blocks) {
      if (b.type === "hero") add(b.props.foto);
      else if (b.type === "tekstFoto") add(b.props.foto);
      else if (b.type === "galerij") b.props.fotos.forEach(add);
      else if (b.type === "diensten") b.props.items.forEach((it) => add(it.foto ?? null));
    }
  };
  add(heroFoto);
  uit(page);
  for (const p of pages) if (p.id !== page.id) uit(p);
  return ids.slice(0, MAX_VLUCHT_FOTOS);
}

/** Een foto onderweg: plek (x in vw, y in vh, z in px), kanteling en wanneer hij helder wordt en verdwijnt. */
export interface GangFoto {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  /** de helderheid aan het begin (ver weg is mistig) */
  mist: number;
  /** tot waar in de vlucht (procent) hij helder wordt */
  m1: number;
  /** van waar tot waar (procent) hij vlak voor je verdwijnt */
  w0: number;
  w1: number;
}

export interface Streep {
  x: number;
  y: number;
  z: number;
  /** draaiing om de kijkrichting, zodat de streep naar het midden wijst */
  r: number;
  lengte: number;
  w0: number;
  w1: number;
}

export interface VluchtPlan {
  /** hoe ver de wereld naar je toe komt, in px */
  reis: number;
  gang: GangFoto[];
  eindZ: number;
  strepen: Streep[];
}

/** De eerste foto staat zo diep, en elke volgende zoveel verder. */
const EERSTE = 650;
const STAP = 620;
/** Het eindpunt staat nog iets verder weg en komt tot net voorbij het scherm, zodat het alles vult. */
const EIND_EXTRA = 350;
const EIND_TOT = 150;
/** Een foto verdwijnt tussen deze diepten (het perspectief is 1000 px, op een telefoon 760 px). */
const WEG_VAN = 150;
const WEG_TOT = 520;
/** Verder weg dan dit is een foto in het begin mistig. */
const HELDER = -1500;
const GULDEN_HOEK = 137.508;
const AANTAL_STREPEN = 26;

/** Het moment (procent van de vlucht) waarop iets op diepte `z` bij diepte `doel` is. */
const moment = (z: number, doel: number, reis: number) => r1(Math.max(0, ((doel - z) / reis) * 100));

/**
 * Waar alles in de tunnel staat. De foto's liggen in een spiraal (gulden hoek) rond
 * de kijkrichting en zijn naar het midden gedraaid, zoals de wanden van een gang.
 * De lichtstrepen liggen in de lengte van de gang. Alles staat vast (geen toeval),
 * zodat dezelfde site er altijd hetzelfde uitziet.
 */
export function vluchtPlan(aantalGang: number): VluchtPlan {
  const k = Math.max(0, Math.min(MAX_VLUCHT_FOTOS - 1, aantalGang));
  const eindZ = -(EERSTE + k * STAP + EIND_EXTRA);
  const reis = -eindZ + EIND_TOT;
  const gang: GangFoto[] = Array.from({ length: k }, (_, i) => {
    const hoek = rad(-20 + i * GULDEN_HOEK);
    const cos = Math.cos(hoek);
    const sin = Math.sin(hoek);
    const z = -(EERSTE + i * STAP);
    const mist = z < HELDER ? r2(Math.max(0.3, 1 - (HELDER - z) / 3600)) : 1;
    return {
      x: r1((34 + 6 * i) * cos),
      y: r1((27 + 4 * i) * sin),
      z,
      rx: r1(sin * 14),
      ry: r1(-cos * 24),
      mist,
      m1: mist < 1 ? moment(z, HELDER, reis) : 0.1,
      w0: moment(z, WEG_VAN, reis),
      w1: moment(z, WEG_TOT, reis),
    };
  });
  const strepen: Streep[] = Array.from({ length: AANTAL_STREPEN }, (_, j) => {
    const graden = j * GULDEN_HOEK + 11;
    const hoek = rad(graden);
    const straal = 16 + ((j * 29) % 36);
    const z = -(300 + ((j * 397) % Math.max(1200, reis - 300)));
    return {
      x: r1(straal * Math.cos(hoek)),
      y: r1(straal * 0.75 * Math.sin(hoek)),
      z,
      r: r1(graden % 360),
      lengte: 90 + ((j * 53) % 140),
      w0: moment(z, WEG_VAN, reis),
      w1: moment(z, WEG_TOT, reis),
    };
  });
  return { reis, gang, eindZ, strepen };
}

const tel = (bc: BelevingCtx) => (bc.bedrijf.telefoon ? `tel:${bc.bedrijf.telefoon.replace(/[^\d+]/g, "")}` : "");

/** De kop als HTML: het gewone deel en het laatste woord in de accentkleur (zoals beleving). */
function kopHtml(kop: string, esc: BelevingCtx["esc"]): string {
  const { rest, hl } = splitKop(kop);
  return `${esc(rest)}${hl ? `${rest ? " " : ""}<span class="hl">${esc(hl)}</span>` : ""}`;
}

/**
 * Lagen achter een kop: alleen voor het oog, steeds een stukje dieper. De tekst staat in een
 * data-attribuut en komt er via CSS (::before) in, zodat hij niet tien keer in de pagina staat
 * (schermlezers en zoekmachines lezen de kop één keer).
 */
const echo = (tag: "div" | "i", klasse: string, n: number, a: string, b = "") =>
  Array.from({ length: n }, (_, k) => `<${tag} class="${klasse}" aria-hidden="true" style="--e:${k + 1}" data-a="${a}" data-b="${b}"></${tag}>`).join("");

/** De opening: de vlucht door de tunnel. null = te weinig foto's (dan de opening van beleving). */
function opening(b: Extract<Block, { type: "hero" }>, bc: BelevingCtx): string | null {
  const { esc } = bc;
  const p = b.props;
  const fotos = vluchtFotos(p.foto, bc.page, bc.pages)
    // het eindpunt vertelt iets; de foto's onderweg staan verderop nog eens (sier: lege alt)
    .map((id, i) => bc.img(id, i === 0 ? "100vw" : "(min-width: 760px) 60vw, 90vw", i === 0, i === 0 ? undefined : ""))
    .filter(Boolean);
  const [eind, ...gang] = fotos;
  if (!eind || fotos.length < MIN_VLUCHT_FOTOS) return null;
  const plan = vluchtPlan(gang.length);
  const strepen = plan.strepen
    .map((s) => `<i class="d3-s" style="--x:${s.x};--y:${s.y};--z:${s.z};--r:${s.r};--l:${s.lengte}px;--w0:${s.w0}%;--w1:${s.w1}%"></i>`)
    .join("");
  const onderweg = plan.gang
    .map((g, i) => `<div class="d3-f" style="--x:${g.x};--y:${g.y};--z:${g.z};--rx:${g.rx};--ry:${g.ry};--mist:${g.mist};--m1:${g.m1}%;--w0:${g.w0}%;--w1:${g.w1}%">${gang[i]}</div>`)
    .join("");
  const kop = kopHtml(p.kop, esc);
  const { rest, hl } = splitKop(p.kop);
  const acts = [
    p.knop && `<a class="btn" href="${esc(bc.href(p.knopLink))}">${esc(p.knop)}</a>`,
    tel(bc) && `<a class="btn ghost" href="${esc(bc.href(tel(bc)))}">Bel ${esc(bc.bedrijf.telefoon)}</a>`,
  ].filter(Boolean);
  const woorden = tickerWoorden(bc.page, bc.pages);
  const rij = woorden.length ? [...woorden, ...woorden, ...woorden].slice(0, Math.max(12, woorden.length * 2)) : [];
  const ticker = rij.length ? `<div class="ticker" aria-hidden="true"><div class="tk">${rij.map((w) => `<span>${esc(w)}</span><i>✦</i>`).join("")}</div></div>` : "";
  return `<section class="d3-open" style="--reis:${plan.reis}px"><div class="d3-plak"><div class="d3-ruimte"><div class="d3-wereld">${strepen}${onderweg}<div class="d3-f d3-eind" style="--z:${plan.eindZ}">${eind}</div></div></div><div class="d3-sluier" aria-hidden="true"></div><div class="d3-tekstlaag"><div class="wrap"><div class="d3-tekst"><div class="d3-kopblok" style="--n:${kopMaat(p.kop)}"><h1>${kop}</h1>${echo("div", "d3-echo", ECHO_KOP, esc(rest), esc(hl))}</div>${bc.paras(p.tekst)}${acts.length ? `<p class="hero-acts">${acts.join("")}</p>` : ""}</div></div></div><p class="d3-hint" aria-hidden="true">Scrol en vlieg erin</p></div></section>${ticker}`;
}

/** Het label en de kop van een blok, zoals bij beleving. */
const kopVan = (b: Block, kop: string, bc: BelevingCtx) => {
  const t = kickerVoor(b, bc.bedrijf);
  return `${t ? `<p class="kicker">${bc.esc(t)}</p>` : ""}<h2>${bc.esc(kop)}</h2>`;
};

/** Hoe ver een foto in de ring van het midden staat, als deel van zijn breedte: 1 / (2·tan(180°/n)). */
export const ringFactor = (n: number) => r2(1 / (2 * Math.tan(Math.PI / Math.max(3, n))));

/**
 * De blokken met een eigen 3D-opmaak. null = de opmaak van beleving. De diepte van
 * kaarten, stappen en reviews komt alleen uit het stijlblad (diepteCss).
 */
export function diepteBlok(b: Block, alt: string, bc: BelevingCtx): string | null {
  const { esc } = bc;
  switch (b.type) {
    case "hero":
      return opening(b, bc);
    case "galerij": {
      const pics = b.props.fotos
        .slice(0, MAX_RING_FOTOS)
        .map((f) => bc.img(f, "(min-width: 760px) 300px, 60vw"))
        .filter(Boolean);
      if (pics.length < MIN_RING_FOTOS) return null;
      return `<section class="d3-ringsec" style="--n:${pics.length};--f:${ringFactor(pics.length)}"><div class="wrap">${kopVan(b, b.props.kop, bc)}</div><div class="d3-podium"><div class="d3-ring">${pics
        .map((pic, i) => `<figure class="d3-rf" style="--i:${i}">${pic}<span class="d3-rug" aria-hidden="true"></span></figure>`)
        .join("")}</div></div></section>`;
    }
    case "stappen":
      // grote cijfers met diepte, zoals echte 3D-letters
      return `<section${alt}><div class="wrap">${kopVan(b, b.props.kop, bc)}<ol class="steps bel" role="list">${b.props.items
        .map((it, i) => `<li><span class="stap-nr d3-nr"><span>${i + 1}</span>${echo("i", "d3-nr-e", ECHO_CIJFER, String(i + 1))}</span><div><h3>${esc(it.titel)}</h3>${bc.paras(it.tekst)}</div></li>`)
        .join("")}</ol></div></section>`;
    case "cta": {
      const p = b.props;
      const acts = [
        p.knop && `<a class="btn dark" href="${esc(bc.href(p.knopLink))}">${esc(p.knop)}</a>`,
        tel(bc) && `<a class="btn line" href="${esc(bc.href(tel(bc)))}">Bel ${esc(bc.bedrijf.telefoon)}</a>`,
      ].filter(Boolean);
      const kop = esc(p.kop);
      // de afsluiter: de kop komt in 3D-letters uit de diepte op je af
      return `<section class="band bel d3-band"><div class="wrap"><div class="d3-bandkop"><h2>${kop}</h2>${echo("div", "d3-echo", ECHO_BAND, kop)}</div>${bc.paras(p.tekst)}${acts.length ? `<p class="band-acts">${acts.join("")}</p>` : ""}</div></section>`;
    }
    default:
      return null;
  }
}

/** Een kleur als "r,g,b" voor rgba(). */
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
/** `t` van de weg van kleur a naar zwart. */
const donkerder = (hex: string, t: number) =>
  `#${[1, 3, 5]
    .map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t)))
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
    .join("")}`;

/** De tinten waar de 3D-opmaak mee rekent (uit premiumTokens). */
export interface DiepteTokens {
  night: string;
  moss: string;
}

/**
 * Het stijlblad van de 3D-stijl, na dat van beleving. De ruimte staat er altijd
 * (ook stil), de beweging alleen binnen @supports (animation-timeline) en
 * prefers-reduced-motion: no-preference, en alleen gestuurd door het scrollen.
 */
export function diepteCss(t: DiepteTokens, accent: string, display: string, text: string): string {
  const a = rgb(accent);
  const n = rgb(t.night);
  const moss = rgb(t.moss);
  const diep = donkerder(accent, 0.45);
  const diepst = donkerder(accent, 0.72);
  const kopFont = `font-family:${display};font-weight:700;letter-spacing:-.03em`;
  return `
.d3-open{--vx:64%;--vy:50%;--ux:1vw;--uy:1vh;--pw:clamp(200px,30vw,520px);position:relative;padding:0;background:var(--night);color:var(--cream)}
@media (max-width:759px){.d3-open{--vx:50%;--vy:62%;--ux:1.25vw;--pw:min(58vw,300px)}}
.d3-plak{position:relative;height:clamp(600px,94vh,900px);overflow:hidden;perspective:1000px;perspective-origin:var(--vx) var(--vy);background:radial-gradient(40% 45% at var(--vx) var(--vy),rgba(${a},.3),rgba(${a},0) 70%),radial-gradient(110% 90% at var(--vx) var(--vy),rgba(${moss},.6),rgba(${moss},0) 75%),var(--night)}
@media (max-width:759px){.d3-plak{perspective:760px}}
.d3-ruimte{position:absolute;inset:0;overflow:hidden;perspective:1000px;perspective-origin:var(--vx) var(--vy)}@media (max-width:759px){.d3-ruimte{perspective:760px}}
.d3-wereld{position:absolute;left:var(--vx);top:var(--vy);width:0;height:0;transform-style:preserve-3d}
.d3-f{position:absolute;left:0;top:0;width:var(--pw);height:calc(var(--pw)*.75);margin:calc(var(--pw)*-.375) 0 0 calc(var(--pw)*-.5);border-radius:18px;opacity:var(--mist,1);transform:translate3d(calc(var(--x,0)*var(--ux)),calc(var(--y,0)*var(--uy)),calc(var(--z)*1px)) rotateX(calc(var(--rx,0)*1deg)) rotateY(calc(var(--ry,0)*1deg))}
.d3-f img{width:100%;height:100%;object-fit:cover;border-radius:inherit;box-shadow:0 40px 80px -30px rgba(0,0,0,.75),0 0 0 1px rgba(255,255,255,.12)}
.d3-eind{width:130vw;height:130vh;margin:-65vh 0 0 -65vw;border-radius:8px;transform:translate3d(calc(-16*var(--ux)),0,calc(var(--z)*1px))}@media (max-width:759px){.d3-eind{transform:translate3d(0,0,calc(var(--z)*1px))}}
.d3-eind img{box-shadow:0 0 0 4px var(--a),0 0 180px 40px rgba(${a},.5)}
.d3-s{position:absolute;left:0;top:0;width:var(--l);height:3px;margin:-1.5px 0 0 calc(var(--l)/-2);border-radius:3px;background:linear-gradient(90deg,rgba(${a},0),rgba(${a},.95),rgba(${a},0));transform:translate3d(calc(var(--x)*var(--ux)),calc(var(--y)*var(--uy)),calc(var(--z)*1px)) rotateZ(calc(var(--r)*1deg)) rotateY(90deg)}
.d3-s:nth-child(3n){background:linear-gradient(90deg,rgba(255,246,234,0),rgba(255,246,234,.9),rgba(255,246,234,0))}
.d3-sluier{position:absolute;inset:0;pointer-events:none;background:radial-gradient(60% 75% at 20% 50%,rgba(${n},.88),rgba(${n},0) 72%)}@media (max-width:759px){.d3-sluier{background:radial-gradient(95% 55% at 50% 28%,rgba(${n},.9),rgba(${n},0) 75%)}}
.d3-tekstlaag{position:absolute;inset:0;display:flex;align-items:center;padding:80px 0 72px}.d3-tekstlaag .wrap{width:100%}@media (max-width:759px){.d3-tekstlaag{align-items:flex-start;padding-top:104px}}
.d3-tekst{max-width:46rem;container-type:inline-size;perspective:900px;perspective-origin:95% 20%}
.d3-kopblok{display:grid;transform-style:preserve-3d;transform:rotateY(-10deg) rotateX(8deg);transform-origin:0 60%}
.d3-kopblok>*{grid-area:1/1;margin:0;${kopFont};font-size:clamp(3.2rem,11vw,7.5rem);line-height:.9;overflow-wrap:anywhere}
@supports (width:1cqi){.d3-kopblok>*{font-size:min(clamp(3.2rem,11vw,7.5rem),calc(100cqi / var(--n,6)))}}
.d3-kopblok h1{color:var(--cream);text-shadow:0 0 40px rgba(${n},.5)}.d3-kopblok .hl{display:block;color:var(--sun)}
.d3-echo{color:${diep};transform:translateZ(calc(var(--e)*-4px))}.d3-echo::before{content:attr(data-a) "\\A" attr(data-b);white-space:pre-line}.d3-echo[data-b=""]::before{content:attr(data-a)}
@supports (color:color-mix(in srgb,red 50%,blue)){.d3-kopblok .d3-echo{color:color-mix(in srgb,${diep} calc(100% - var(--e)*7%),${diepst})}}
.d3-tekst>p{margin:28px 0 0;max-width:34rem;font-size:1.125rem;line-height:1.65;color:rgba(255,246,234,.85)}
.d3-open .hero-acts{margin-top:32px}.d3-open .btn{padding:16px 28px;box-shadow:0 14px 40px -12px rgba(${a},.8)}.d3-open .btn.ghost{box-shadow:none}.d3-open :focus-visible{outline-color:var(--sun)}
.d3-hint{display:none;position:absolute;left:0;right:0;bottom:20px;margin:0;justify-content:center;gap:10px;font:700 .75rem/1 ${text};letter-spacing:.22em;text-transform:uppercase;color:rgba(255,246,234,.75)}.d3-hint::after{content:"↓";letter-spacing:0}
.d3-ringsec{position:relative;overflow:hidden;padding:96px 0 48px;background:radial-gradient(60% 40% at 50% 85%,rgba(${a},.28),rgba(${a},0) 70%),var(--night);color:var(--cream)}.d3-ringsec h2{color:#fff}.d3-ringsec .kicker{color:var(--sun)}
.d3-podium{--rw:clamp(170px,22vw,290px);position:relative;display:grid;place-items:center;height:calc(var(--rw)*2.1 + 80px);perspective:1300px;perspective-origin:50% 15%}
.d3-ring{position:relative;width:var(--rw);aspect-ratio:3/4;transform-style:preserve-3d;transform:rotateX(-12deg) rotateY(-16deg)}
.d3-rf{position:absolute;inset:0;margin:0;transform-style:preserve-3d;transform:rotateY(calc(var(--i)*1turn/var(--n))) translateZ(calc(var(--rw)*var(--f) + 28px))}
.d3-rf img,.d3-rug{backface-visibility:hidden}.d3-rug{position:absolute;inset:0;border-radius:1.25rem;transform:rotateY(180deg);background:linear-gradient(160deg,rgba(${a},.42),rgba(${n},.92) 70%);box-shadow:inset 0 0 0 1px rgba(${a},.55)}
.d3-rf img{width:100%;height:100%;object-fit:cover;border-radius:1.25rem;box-shadow:0 30px 60px -25px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.12);-webkit-box-reflect:below 10px linear-gradient(transparent 62%,rgba(255,255,255,.22))}
.steps.bel li{perspective:700px}.d3-nr{display:grid;transform-style:preserve-3d;transform:rotateY(-26deg) rotateX(12deg)}.d3-nr>*{grid-area:1/1}.steps.bel .d3-nr>span{color:var(--night)}.d3-nr-e{font-style:normal;color:${accent};transform:translateZ(calc(var(--e)*-3px))}
@supports (color:color-mix(in srgb,red 50%,blue)){.d3-nr-e{color:color-mix(in srgb,${accent} calc(100% - var(--e)*12%),${diep})}}.d3-nr-e::before{content:attr(data-a)}
.d3-band .wrap{perspective:1000px}.d3-bandkop{display:grid;margin:0 0 28px;transform-style:preserve-3d;transform:rotateX(12deg)}
.band.bel .d3-bandkop>*{grid-area:1/1;margin:0;${kopFont};font-size:clamp(2.4rem,6vw,4.5rem);line-height:.98}.d3-band .d3-echo{color:${diep};transform:translateZ(calc(var(--e)*-4px))}
@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){
main{overflow-x:clip}
.d3-open{height:300vh;height:300svh;view-timeline:--d3 block}
.d3-plak{position:sticky;top:0;height:100vh;height:100svh}
.d3-wereld{animation:d3-vlieg linear both;animation-timeline:--d3;animation-range:contain 0% contain 100%}
.d3-f{animation:d3-helder linear both;animation-timeline:--d3;animation-range:contain 0% contain var(--m1,1%)}
.d3-f img,.d3-s{animation:d3-weg linear both;animation-timeline:--d3;animation-range:contain var(--w0,100%) contain var(--w1,120%)}
.d3-eind,.d3-eind img{animation:none}
.d3-tekstlaag,.d3-sluier{animation:d3-tekst linear both;animation-timeline:--d3;animation-range:contain 0% contain 16%}
.d3-hint{display:flex;animation:d3-weg linear both;animation-timeline:--d3;animation-range:contain 0% contain 5%}
.d3-ringsec{view-timeline:--d3r block}.d3-ring{animation:d3-draai linear both;animation-timeline:--d3r;animation-range:cover 0% cover 100%}
.tegels,.cards.bel,.rev-list,.gallery.bel{perspective:1100px}
.tegel,.card.bel,.gallery.bel img{animation:d3-spring linear both;animation-timeline:view();animation-range:entry 5% entry 100%}
.tegel:nth-child(3n+2),.card.bel:nth-child(3n+2),.gallery.bel img:nth-child(3n+2){animation-range:entry 18% entry 100%}
.tegel:nth-child(3n),.card.bel:nth-child(3n),.gallery.bel img:nth-child(3n){animation-range:entry 30% entry 100%}
.steps.bel li{transform-origin:0 50%;animation:d3-zwaai linear both;animation-timeline:view();animation-range:entry 0% entry 100%}
.rv{transform-origin:50% 0;animation:d3-klap linear both;animation-timeline:view();animation-range:entry 0% entry 100%}.rv:nth-child(2n){animation-range:entry 15% entry 100%}
.lijst{animation:d3-lijst linear both;animation-timeline:view();animation-range:entry 0% entry 90%}.split.bel.flip .lijst{animation-name:d3-lijst-r}
.paneel{transform-origin:50% 100%;animation:d3-kantel linear both;animation-timeline:view();animation-range:entry 0% entry 75%}
.d3-bandkop{animation:d3-knal linear both;animation-timeline:view();animation-range:entry 0% entry 100%}.d3-band .wrap>p{animation:d3-in linear both;animation-timeline:view();animation-range:entry 40% entry 100%}
}}
@keyframes d3-vlieg{to{transform:translateZ(var(--reis))}}
@keyframes d3-helder{to{opacity:1}}
@keyframes d3-weg{to{opacity:0;visibility:hidden}}
@keyframes d3-tekst{to{transform:translateZ(700px);opacity:0;visibility:hidden}}
@keyframes d3-draai{from{transform:rotateX(-8deg) rotateY(50deg)}to{transform:rotateX(-8deg) rotateY(-250deg)}}
@keyframes d3-spring{0%{opacity:0;transform:translate3d(0,120px,-520px) rotateX(55deg)}45%{opacity:1}75%{transform:translate3d(0,-10px,60px) rotateX(-6deg)}100%{opacity:1;transform:none}}
@keyframes d3-zwaai{from{opacity:0;transform:perspective(900px) rotateY(-75deg) translateZ(-160px)}to{opacity:1;transform:none}}
@keyframes d3-klap{from{opacity:0;transform:rotateX(-70deg) translateZ(-120px)}to{opacity:1;transform:none}}
@keyframes d3-lijst{from{opacity:0;transform:perspective(1200px) rotateY(-34deg) translateZ(-280px)}to{opacity:1;transform:none}}
@keyframes d3-lijst-r{from{opacity:0;transform:perspective(1200px) rotateY(34deg) translateZ(-280px)}to{opacity:1;transform:none}}
@keyframes d3-in{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes d3-kantel{from{opacity:.25;transform:perspective(1600px) translateY(60px) rotateX(38deg) scale(.94)}to{opacity:1;transform:none}}
@keyframes d3-knal{0%{transform:translateZ(-1500px) rotateX(70deg)}70%{transform:translateZ(90px) rotateX(6deg)}100%{transform:rotateX(12deg)}}`;
}
