import type { BlockProps, Item } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// De 3D-hamburger (4 nov 2026, opdracht van de eigenaar: "bij een hamburgerzaak
// een broodje hamburger met een 3D- of 4D-effect, een soort video"). Een
// klantsite heeft geen scripts, dus alles is tekening (SVG) en CSS:
// - zeven lagen, elk met eigen licht en schaduw (brioche met sesam, sla,
//   cheddar die smelt, vlees met grillstrepen en structuur, tomaat, ui, bodem);
// - in 3D gestapeld (perspectief, elke laag een eigen diepte) en zacht draaiend;
// - de vierde dimensie is de tijd: tijdens het scrollen zweven de lagen uit
//   elkaar en vallen ze samen tot één burger (scroll-gestuurde animatie); waar
//   de browser dat niet kan, ademt hij rustig open en dicht;
// - stoom en gloeiende vonken als bij een houtskoolgrill;
// - een pauzeknop (WCAG 2.2.2), en wie minder beweging wil (systeeminstelling)
//   ziet hem stil en half open, met de namen erbij.
// Sinds 11 nov 2026 kan het ook echt (`echt`, de standaard voor nieuwe blokken):
// de eigenaar vond de tekening een animatie, geen burger. Dan zijn de lagen
// uitgeknipt uit één foto van een burger waarvan alles los boven elkaar zweeft
// (public/sites/burger/, met CREDITS.md). Dezelfde beweging, maar met echte
// pixels; de site haalt ze van zichzelf op (assets/burger/, lib/sites/serve.ts).
// Puur: HTML en CSS; de opmaak van de site (render.ts) zet het blok neer.
// ---------------------------------------------------------------------------

export type BurgerBlok = BlockProps["burger3d"];

/** De zeven lagen, van boven naar beneden; de namen en zinnen past de zaak zelf aan. */
export const STANDAARD_LAGEN: Item[] = [
  { titel: "Brioche met sesam", tekst: "Elke ochtend vers gebakken, licht zoet en luchtig." },
  { titel: "Knapperige sla", tekst: "Ijsbergsla, koud en fris." },
  { titel: "Belegen cheddar", tekst: "Gesmolten over het vlees, net van de grill." },
  { titel: "Rundvlees, 180 gram", tekst: "Vers gedraaid, op houtskool gegrild." },
  { titel: "Tomaat", tekst: "Rijp en sappig, in dikke plakken." },
  { titel: "Rode ui", tekst: "Dun gesneden, voor een frisse beet." },
  { titel: "Geroosterde bodem", tekst: "Van dezelfde brioche, kort op de plaat." },
];

/** De zeven lagen van de echte burger, in de volgorde van de foto (de namen past de zaak zelf aan). */
export const STANDAARD_FOTO_LAGEN: Item[] = [
  { titel: "Sesambol", tekst: "Elke ochtend vers gebakken, licht en luchtig." },
  { titel: "Cheddar", tekst: "Smelt over het vlees, net van de grill." },
  { titel: "Rundvlees, 180 gram", tekst: "Vers gedraaid, op houtskool gegrild." },
  { titel: "Tomaat", tekst: "Rijp en sappig, in dikke plakken." },
  { titel: "Ui", tekst: "In ringen, voor een frisse beet." },
  { titel: "Krulsla", tekst: "Koud en knapperig." },
  { titel: "Onderkant", tekst: "Van dezelfde bol, kort op de plaat." },
];

/**
 * Waar elke laag in de foto staat (px in de foto van 1200 breed), hoeveel hij zakt om op de laag
 * eronder te liggen (`samen`), en zijn diepte en kanteling als de burger uit elkaar is.
 */
const FOTO_LAGEN = [
  { bestand: "bol.webp", x: 392, y: 62, w: 344, h: 190, samen: 540, z: 70, rz: -3 },
  { bestand: "kaas.webp", x: 359, y: 290, w: 434, h: 160, samen: 442, z: 50, rz: 2 },
  { bestand: "vlees.webp", x: 383, y: 481, w: 378, h: 208, samen: 341, z: 30, rz: -1.5 },
  { bestand: "tomaat.webp", x: 365, y: 717, w: 427, h: 162, samen: 253, z: 10, rz: 2 },
  { bestand: "ui.webp", x: 422, y: 935, w: 292, h: 138, samen: 127, z: -10, rz: -2 },
  { bestand: "sla.webp", x: 243, y: 1107, w: 692, h: 287, samen: 20, z: -30, rz: 1 },
  { bestand: "bodem.webp", x: 20, y: 1335, w: 1032, h: 263, samen: 0, z: -50, rz: 0 },
] as const;
/** De bestanden die een site mag uitleveren (lib/sites/serve.ts). */
export const BURGER_FOTO_BESTANDEN: readonly string[] = FOTO_LAGEN.map((l) => l.bestand);
/** Het stuk van de foto dat de burger beslaat: vanaf links 180 px, 840 breed, vanaf boven 150 px; dat is 400 eenheden breed. */
const FOTO = { links: 180, boven: 150, eenheid: 400 / 840 };
/** Uit elkaar staan de lagen op 80% van de afstand op de foto (anders wordt hij te hoog). */
const UIT_ELKAAR = 0.8;
/** Waar de namen naast de burger staan (eenheden), net rechts van de sla. */
const LABEL_X = 365;

/** Of de site het blok heeft: alleen dan komt de opmaak (met beweging) in het stijlblad; een gewone site beweegt niets. */
export const heeftBurger = (pages: { blocks: { type: string }[] }[]) => pages.some((p) => p.blocks.some((b) => b.type === "burger3d"));

/** Een burger in de naam of het aanbod: dan hoort de 3D-burger erbij. */
export const isBurgerZaak = (tekst: string) => /burger|hamburger|smash|diner\b|grillhouse|bbq|barbecue/i.test(tekst);

const r2 = (n: number) => Math.round(n * 10) / 10;

/** De golvende rand van een slablad: een ellips waarvan de rand op en neer gaat. */
function slaRand(cx: number, cy: number, rx: number, ry: number, golven: number, diepte: number): string {
  const punten: string[] = [];
  const stappen = golven * 6;
  for (let i = 0; i <= stappen; i++) {
    const t = (i / stappen) * Math.PI * 2;
    const g = Math.sin(t * golven) * diepte + Math.sin(t * golven * 2.3 + 1) * diepte * 0.35;
    punten.push(`${r2(cx + Math.cos(t) * (rx + g))},${r2(cy + Math.sin(t) * (ry + g * 0.45))}`);
  }
  return `M${punten.join(" L")}Z`;
}

/** Sesamzaadjes op de bol: vaste plekken (geen toeval), elk een beetje gedraaid. */
const SESAM: [number, number, number][] = [
  [112, 78, -20], [146, 58, 15], [182, 46, -8], [220, 44, 22], [258, 52, -15], [292, 70, 30], [130, 104, 10], [168, 86, -25], [204, 74, 5],
  [242, 82, -30], [280, 98, 18], [318, 102, -10], [96, 120, 25], [150, 128, -5], [196, 112, 28], [236, 116, -18], [272, 130, 8], [310, 136, -26],
  [120, 150, 12], [176, 146, -14], [226, 150, 20], [262, 158, -6], [86, 98, -32], [326, 84, 14],
];

function svgBovenkant(): string {
  const zaad = SESAM.map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="6.2" ry="2.8" transform="rotate(${a} ${x} ${y})"/>`).join("");
  return `<svg viewBox="0 0 400 190" aria-hidden="true" focusable="false"><defs><radialGradient id="b3d-bol" cx=".36" cy=".2" r=".85"><stop offset="0" stop-color="#FFD891"/><stop offset=".32" stop-color="#F0AE4F"/><stop offset=".7" stop-color="#C9772A"/><stop offset="1" stop-color="#8E4814"/></radialGradient><linearGradient id="b3d-bolrand" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#5A2A0A" stop-opacity="0"/><stop offset="1" stop-color="#5A2A0A" stop-opacity=".55"/></linearGradient><radialGradient id="b3d-glans" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><path d="M18,150 C18,58 110,16 200,16 C290,16 382,58 382,150 C382,176 318,186 200,186 C82,186 18,176 18,150Z" fill="url(#b3d-bol)"/><path d="M18,150 C18,58 110,16 200,16 C290,16 382,58 382,150 C382,176 318,186 200,186 C82,186 18,176 18,150Z" fill="url(#b3d-bolrand)"/><ellipse class="b3d-glans" cx="150" cy="62" rx="96" ry="30" fill="url(#b3d-glans)"/><g fill="#FFF4DA" stroke="#B9732E" stroke-opacity=".45" stroke-width="1">${zaad}</g></svg>`;
}

function svgSla(): string {
  const rand = slaRand(210, 34, 200, 24, 11, 9);
  const binnen = slaRand(210, 30, 168, 16, 9, 5);
  return `<svg viewBox="0 0 420 72" aria-hidden="true" focusable="false"><defs><linearGradient id="b3d-sla" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B8E07A"/><stop offset=".55" stop-color="#6DB43C"/><stop offset="1" stop-color="#2E7A22"/></linearGradient></defs><path d="${rand}" fill="url(#b3d-sla)"/><path d="${binnen}" fill="#A6D865" opacity=".55"/><g fill="none" stroke="#E9F7C9" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"><path d="M60,38 C120,44 160,30 210,34"/><path d="M360,36 C300,42 260,28 210,34"/><path d="M140,52 C170,46 190,50 210,40"/><path d="M280,54 C250,46 230,50 210,40"/></g></svg>`;
}

function svgKaas(): string {
  return `<svg viewBox="0 0 400 96" aria-hidden="true" focusable="false"><defs><linearGradient id="b3d-kaas" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE27A"/><stop offset=".5" stop-color="#FDBB2D"/><stop offset="1" stop-color="#E8901A"/></linearGradient></defs><path d="M200,6 L392,36 C396,40 392,46 386,48 C380,50 382,64 376,70 C370,76 364,62 360,52 L236,68 C230,76 232,92 222,94 C212,96 210,80 206,72 L200,72 L22,50 C16,52 18,72 10,74 C2,76 4,58 6,44 C2,40 4,36 10,34 Z" fill="url(#b3d-kaas)"/><path d="M200,6 L392,36 L200,64 L8,36 Z" fill="#FFF0A8" opacity=".35"/><g fill="#E39A1E" opacity=".55"><ellipse cx="150" cy="34" rx="7" ry="3"/><ellipse cx="250" cy="40" rx="5" ry="2.4"/><ellipse cx="300" cy="32" rx="4" ry="2"/></g></svg>`;
}

function svgVlees(): string {
  return `<svg viewBox="0 0 400 104" aria-hidden="true" focusable="false"><defs><radialGradient id="b3d-vlees" cx=".42" cy=".3" r=".8"><stop offset="0" stop-color="#7A4325"/><stop offset=".6" stop-color="#4A2412"/><stop offset="1" stop-color="#2A1308"/></radialGradient><linearGradient id="b3d-vleeskant" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B1C0C"/><stop offset="1" stop-color="#1E0D05"/></linearGradient><filter id="b3d-ruw" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .1  0 0 0 0 .04  0 0 0 0 .02  0 0 0 1.6 -.55"/><feComposite in2="SourceGraphic" operator="in"/></filter><clipPath id="b3d-vleesboven"><ellipse cx="200" cy="40" rx="176" ry="34"/></clipPath></defs><path d="M24,40 A176,34 0 0,0 376,40 L376,66 C376,84 300,98 200,98 C100,98 24,84 24,66 Z" fill="url(#b3d-vleeskant)"/><ellipse cx="200" cy="40" rx="176" ry="34" fill="url(#b3d-vlees)"/><ellipse cx="200" cy="40" rx="176" ry="34" fill="#000" filter="url(#b3d-ruw)"/><g clip-path="url(#b3d-vleesboven)" stroke="#140803" stroke-opacity=".7" stroke-width="7" stroke-linecap="round"><path d="M70,10 L130,72"/><path d="M140,6 L200,74"/><path d="M210,6 L270,74"/><path d="M280,8 L340,70"/></g><g fill="#C98055" opacity=".45"><ellipse cx="120" cy="30" rx="5" ry="2"/><ellipse cx="250" cy="24" rx="4" ry="1.6"/><ellipse cx="300" cy="46" rx="6" ry="2"/><ellipse cx="180" cy="54" rx="4" ry="1.5"/></g><path d="M40,70 C120,92 280,92 360,70" fill="none" stroke="#9C5A33" stroke-opacity=".35" stroke-width="3"/></svg>`;
}

function svgTomaat(): string {
  const plak = (cx: number) =>
    `<g><ellipse cx="${cx}" cy="34" rx="98" ry="22" fill="#A8160F"/><ellipse cx="${cx}" cy="28" rx="98" ry="22" fill="#E43A2C"/><ellipse cx="${cx}" cy="28" rx="80" ry="16" fill="#F2644B"/><g fill="#FFD27A" opacity=".85"><ellipse cx="${cx - 34}" cy="26" rx="7" ry="3"/><ellipse cx="${cx + 30}" cy="30" rx="7" ry="3"/><ellipse cx="${cx}" cy="20" rx="6" ry="2.6"/><ellipse cx="${cx - 6}" cy="36" rx="6" ry="2.6"/></g><ellipse cx="${cx - 30}" cy="20" rx="26" ry="5" fill="#fff" opacity=".25"/></g>`;
  return `<svg viewBox="0 0 400 60" aria-hidden="true" focusable="false">${plak(120)}${plak(282)}</svg>`;
}

function svgUi(): string {
  return `<svg viewBox="0 0 400 50" aria-hidden="true" focusable="false"><g fill="none" stroke-width="7"><ellipse cx="130" cy="26" rx="72" ry="14" stroke="#B26BC8"/><ellipse cx="130" cy="24" rx="72" ry="14" stroke="#F3E6F7"/><ellipse cx="236" cy="28" rx="64" ry="12" stroke="#A55DBB"/><ellipse cx="236" cy="26" rx="64" ry="12" stroke="#EEDDF4"/><ellipse cx="300" cy="22" rx="48" ry="10" stroke="#B26BC8"/><ellipse cx="300" cy="20" rx="48" ry="10" stroke="#F6EBF9"/></g></svg>`;
}

function svgBodem(): string {
  return `<svg viewBox="0 0 400 104" aria-hidden="true" focusable="false"><defs><linearGradient id="b3d-bodemkant" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D98E3C"/><stop offset=".6" stop-color="#B0611F"/><stop offset="1" stop-color="#7A3C10"/></linearGradient><radialGradient id="b3d-snij" cx=".5" cy=".5" r=".55"><stop offset="0" stop-color="#C98443"/><stop offset=".7" stop-color="#EDC184"/><stop offset="1" stop-color="#F6D7A2"/></radialGradient></defs><path d="M22,32 L22,70 C22,92 100,100 200,100 C300,100 378,92 378,70 L378,32 Z" fill="url(#b3d-bodemkant)"/><ellipse cx="200" cy="32" rx="178" ry="26" fill="url(#b3d-snij)"/></svg>`;
}

interface Laag {
  klasse: string;
  svg: string;
  /** plek en breedte in eenheden van 1/400 van de breedte */
  x: number;
  y: number;
  w: number;
  /** hoe ver de laag uit elkaar zweeft (omhoog negatief), de diepte en de kanteling */
  ex: number;
  z: number;
  rz: number;
}

const LAGEN = (): Laag[] => [
  { klasse: "b3d-boven", svg: svgBovenkant(), x: 0, y: 160, w: 400, ex: -100, z: 70, rz: -4 },
  { klasse: "b3d-sla", svg: svgSla(), x: -10, y: 322, w: 420, ex: -62, z: 50, rz: 3 },
  { klasse: "b3d-kaas", svg: svgKaas(), x: 0, y: 336, w: 400, ex: -32, z: 30, rz: -2 },
  { klasse: "b3d-vlees", svg: svgVlees(), x: 0, y: 360, w: 400, ex: -4, z: 10, rz: 1.5 },
  { klasse: "b3d-tomaat", svg: svgTomaat(), x: 0, y: 418, w: 400, ex: 26, z: -10, rz: -3 },
  { klasse: "b3d-ui", svg: svgUi(), x: 0, y: 436, w: 400, ex: 50, z: -30, rz: 4 },
  { klasse: "b3d-bodem", svg: svgBodem(), x: 0, y: 448, w: 400, ex: 80, z: -50, rz: -1 },
];

/** De vonken boven de grill: vaste plekken, snelheden en vertragingen. */
const VONKEN: [number, number, number][] = [
  [8, 6.5, 0], [17, 8, 2.1], [26, 7, 4.4], [35, 9, 1.2], [44, 6, 3.3], [53, 8.5, 0.6], [62, 7.5, 5], [71, 6.8, 2.8], [80, 9.2, 1.7], [89, 7.2, 4], [94, 8, 0.3], [12, 9.5, 5.5],
];

/** De lagen van de echte burger, in dezelfde eenheden (1/400 van de breedte) en met dezelfde beweging als de tekening. */
function fotoLagen(namen: Item[], esc: (s: unknown) => string, adres: (bestand: string) => string): string {
  const e = (n: number) => r2(n * FOTO.eenheid);
  return FOTO_LAGEN.map((l, i) => {
    const titel = namen[i]?.titel ?? "";
    const stijl = `--x:${e(l.x - FOTO.links)};--y:${e(l.y + l.samen - FOTO.boven)};--w:${e(l.w)};--ex:${e(-l.samen * UIT_ELKAAR)};--z:${l.z};--rz:${l.rz}deg;--i:${i};--lab:${LABEL_X};z-index:${FOTO_LAGEN.length - i}`;
    return `<div class="b3d-laag" style="${stijl}"><img src="${esc(adres(l.bestand))}" alt="" width="${l.w}" height="${l.h}" loading="lazy" decoding="async"><span class="b3d-lbl" aria-hidden="true"><b>${i + 1}</b>${esc(titel)}</span></div>`;
  }).join("");
}

/**
 * Het blok als HTML. `id` maakt de pauzeknop uniek; `esc`/`paras`/`href` komen van de site (render.ts),
 * `asset` geeft het adres van een foto van de echte burger (op een gepubliceerde site assets/burger/…).
 */
export function burgerBlokHtml(
  b: BurgerBlok,
  ctx: { esc: (s: unknown) => string; paras: (t: string) => string; href: (raw: string) => string; asset?: (bestand: string) => string },
  id: string,
): string {
  const { esc } = ctx;
  const echt = b.echt === true;
  const namen = (echt ? STANDAARD_FOTO_LAGEN : STANDAARD_LAGEN).map((s, i) => b.lagen[i] ?? s);
  const lagen = echt
    ? fotoLagen(namen, esc, ctx.asset ?? ((bestand) => `/sites/burger/${bestand}`))
    : LAGEN()
        .map((l, i) => {
          const naam = namen[i]!;
          return `<div class="b3d-laag ${l.klasse}" style="--x:${l.x};--y:${l.y};--w:${l.w};--ex:${l.ex};--z:${l.z};--rz:${l.rz}deg;--i:${i}">${l.svg}<span class="b3d-lbl" aria-hidden="true"><b>${i + 1}</b>${esc(naam.titel)}</span></div>`;
        })
        .join("");
  const vonken = VONKEN.map(([l, d, v]) => `<i style="--l:${l}%;--d:${d}s;--v:${v}s"></i>`).join("");
  const stoom = `<svg class="b3d-stoom" viewBox="0 0 400 120" aria-hidden="true" focusable="false"><g fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"><path d="M150,110 C130,80 170,60 150,30"/><path d="M200,114 C180,84 220,62 200,24"/><path d="M250,110 C230,80 270,60 250,30"/></g></svg>`;
  const beschrijving = `${echt ? "Een foto van een hamburger" : "Een hamburger"} die laag voor laag in elkaar valt: ${namen.map((n) => n.titel.toLowerCase()).join(", ")}.`;
  // de echte burger heeft zijn eigen schaduw (de plank) en geen getekende stoom
  const burger = echt ? `<div class="b3d-burger b3d-echt">${lagen}</div>` : `<div class="b3d-burger">${stoom}${lagen}<div class="b3d-schaduw"></div></div>`;
  const lijst = `<ol class="b3d-lijst" role="list">${namen.map((n, i) => `<li><b aria-hidden="true">${i + 1}</b><span><strong>${esc(n.titel)}</strong>${n.tekst ? ` <span>${esc(n.tekst)}</span>` : ""}</span></li>`).join("")}</ol>`;
  const knop = b.knop ? `<p class="b3d-knop"><a class="btn" href="${esc(ctx.href(b.knopLink))}">${esc(b.knop)}</a></p>` : "";
  const pauze = `b3d-p-${id.replace(/[^a-z0-9-]/gi, "")}`;
  return `<section class="b3d-sec"><div class="b3d-gloed" aria-hidden="true"></div><div class="b3d-vonken" aria-hidden="true">${vonken}</div><div class="wrap b3d-grid"><div class="b3d-tekst"><h2>${esc(b.kop)}</h2>${b.tekst ? ctx.paras(b.tekst) : ""}${lijst}${knop}</div><div class="b3d-kant"><input type="checkbox" id="${pauze}" class="b3d-pauze"><div class="b3d-podium" role="img" aria-label="${esc(beschrijving)}">${burger}</div><label for="${pauze}" class="b3d-pauzeknop"><span class="b3d-p-aan">Beweging pauzeren</span><span class="b3d-p-uit">Beweging hervatten</span></label></div></div></section>`;
}

/** De opmaak; los van de stijl van de site (een donkere grill-sfeer), met de accentkleur van de site voor de nummers. */
export function burgerCss(): string {
  return `@property --uit{syntax:"<number>";inherits:true;initial-value:0}
.b3d-sec{position:relative;overflow:hidden;background:#120a06;color:#fbeee0;padding:96px 0}.b3d-sec h2{color:#fff;margin-top:0}.b3d-sec .kicker{color:#ffb547}.b3d-sec :focus-visible{outline-color:#ffb547}
.b3d-gloed{position:absolute;inset:0;background:radial-gradient(60% 55% at 72% 62%,rgba(255,120,30,.32),rgba(255,120,30,0) 70%),radial-gradient(40% 40% at 70% 92%,rgba(255,60,0,.28),rgba(255,60,0,0) 70%);pointer-events:none}
.b3d-vonken{position:absolute;inset:0;pointer-events:none}.b3d-vonken i{position:absolute;bottom:-10px;left:var(--l);width:4px;height:4px;border-radius:50%;background:#ffb547;box-shadow:0 0 8px 2px rgba(255,140,40,.8);opacity:0;animation:b3d-vonk var(--d) linear var(--v) infinite}
@keyframes b3d-vonk{0%{transform:translate(0,0);opacity:0}10%{opacity:1}100%{transform:translate(30px,-520px);opacity:0}}
.b3d-grid{position:relative;display:grid;gap:48px;align-items:center}@media (min-width:1024px){.b3d-grid{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr)}}
.b3d-tekst>p{font-size:1.1rem;color:rgba(251,238,224,.82)}
.b3d-lijst{list-style:none;margin:24px 0 0;padding:0;display:grid;gap:12px}.b3d-lijst li{display:flex;gap:14px;align-items:flex-start}.b3d-lijst li>b{display:grid;place-items:center;flex-shrink:0;width:30px;height:30px;border-radius:50%;background:var(--a);color:var(--a-t);font-size:.85rem}.b3d-lijst strong{color:#fff}.b3d-lijst span span{color:rgba(251,238,224,.7)}
.b3d-knop{margin:28px 0 0}
.b3d-kant{position:relative;display:grid;justify-items:center;gap:12px}
.b3d-pauze{position:absolute;opacity:0;width:1px;height:1px}.b3d-pauzeknop{justify-self:end;padding:8px 14px;border:1px solid rgba(255,255,255,.25);border-radius:999px;font-size:.85rem;font-weight:600;color:#fbeee0;cursor:pointer}.b3d-pauze:focus-visible~.b3d-pauzeknop{outline:3px solid #ffb547;outline-offset:3px}.b3d-p-uit,.b3d-pauze:checked~.b3d-pauzeknop .b3d-p-aan{display:none}.b3d-pauze:checked~.b3d-pauzeknop .b3d-p-uit{display:inline}
.b3d-podium{--uit:.55;width:min(100%,460px);perspective:1100px;perspective-origin:50% 30%}
.b3d-burger{position:relative;width:100%;aspect-ratio:400/640;container-type:inline-size;transform-style:preserve-3d;transform:rotateX(14deg);animation:b3d-draai 9s ease-in-out infinite alternate}
@keyframes b3d-draai{from{transform:rotateX(16deg) rotateY(-18deg)}to{transform:rotateX(10deg) rotateY(18deg)}}
.b3d-laag{position:absolute;left:calc(var(--x)*.25cqi);top:calc(var(--y)*.25cqi);width:calc(var(--w)*.25cqi);transform-style:preserve-3d;transform:translate3d(0,calc(var(--ex)*var(--uit)*.25cqi),calc(var(--z)*var(--uit)*1px)) rotateZ(calc(var(--rz)*var(--uit))) rotateX(calc(var(--uit)*-10deg));filter:drop-shadow(0 calc(var(--uit)*14px + 4px) calc(var(--uit)*18px + 6px) rgba(0,0,0,.45))}
.b3d-laag svg{display:block;width:100%;height:auto;overflow:visible}
.b3d-boven{z-index:7}.b3d-sla{z-index:6}.b3d-kaas{z-index:5}.b3d-vlees{z-index:4}.b3d-tomaat{z-index:3}.b3d-ui{z-index:2}.b3d-bodem{z-index:1}
.b3d-glans{animation:b3d-glim 5s ease-in-out infinite alternate}@keyframes b3d-glim{from{opacity:.5;transform:translateX(-12px)}to{opacity:1;transform:translateX(16px)}}
.b3d-schaduw{position:absolute;left:12%;right:12%;top:calc(540*.25cqi);height:calc(34*.25cqi);border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.7),rgba(0,0,0,0));transform:scale(calc(1 - var(--uit)*.25));opacity:calc(1 - var(--uit)*.45)}
.b3d-stoom{position:absolute;left:25%;width:50%;top:calc((100 - var(--uit)*100)*.25cqi);opacity:.0;filter:blur(6px);animation:b3d-stoom 4.5s ease-out infinite}@keyframes b3d-stoom{0%{opacity:0;transform:translateY(20px) scaleY(.7)}30%{opacity:.32}100%{opacity:0;transform:translateY(-40px) scaleY(1.2)}}
.b3d-lbl{display:none;position:absolute;left:calc(100% + 18px);top:30%;align-items:center;gap:8px;white-space:nowrap;font-size:.85rem;font-weight:700;color:#fff;opacity:calc(var(--uit)*1.6 - .4)}.b3d-lbl::before{content:"";position:absolute;right:calc(100% + 6px);top:50%;width:26px;border-top:1px dashed rgba(255,255,255,.5)}.b3d-lbl b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--a);color:var(--a-t);font-size:.75rem}.b3d-sla .b3d-lbl{left:calc(100% + 6px)}
@media (min-width:1180px){.b3d-lbl{display:inline-flex}.b3d-podium{width:400px;margin-right:200px}}
@supports (animation-timeline:view()){.b3d-podium{animation:b3d-samen linear both;animation-timeline:view();animation-range:entry 5% cover 55%}}
@supports not (animation-timeline:view()){.b3d-podium{animation:b3d-adem 8s ease-in-out infinite alternate}}
@keyframes b3d-samen{from{--uit:1}to{--uit:0}}@keyframes b3d-adem{0%,15%{--uit:0}85%,100%{--uit:1}}
.b3d-pauze:checked~.b3d-podium,.b3d-pauze:checked~.b3d-podium *{animation-play-state:paused}.b3d-kant:has(.b3d-pauze:checked)~*,.b3d-sec:has(.b3d-pauze:checked) .b3d-vonken i{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){.b3d-podium,.b3d-burger,.b3d-burger *,.b3d-vonken i{animation:none!important}.b3d-podium{--uit:.6}.b3d-burger{transform:rotateX(12deg) rotateY(-10deg)}.b3d-vonken,.b3d-stoom,.b3d-pauze,.b3d-pauzeknop{display:none}}
@media (max-width:1023px){.b3d-kant{order:-1}}@media (max-width:640px){.b3d-sec{padding:64px 0}}
.b3d-echt{aspect-ratio:400/690;animation-name:b3d-draai-echt}@keyframes b3d-draai-echt{from{transform:rotateX(10deg) rotateY(-6deg)}to{transform:rotateX(8deg) rotateY(6deg)}}
.b3d-laag img{display:block;width:100%;height:auto}.b3d-echt .b3d-lbl{left:calc((var(--lab) - var(--x))*.25cqi + 14px);top:38%}`;
}
