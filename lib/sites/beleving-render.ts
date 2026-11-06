import type { Block, Company, Page } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// De stijl "beleving" (4 nov 2026): een gebouwde website die eruitziet als
// schwarzwald.zekerflex.com, zonder scripts. Bovenop premium (lib/sites/render.ts),
// met de opbouw van die site:
// - een opening in twee kolommen, met de kop in het groot en het laatste woord
//   in zon-geel, en schuine foto's in een lijst met een ronde zon-badge;
// - een schuine band in de accentkleur met het aanbod;
// - een klein label boven elke kop;
// - witte aanbodkaarten met een ronde pijlknop naar het contactformulier;
// - grote genummerde stappen en reviews op een donkergroene band;
// - een afsluitband in de accentkleur met een donkere knop en "Bel".
// Niets beweegt vanzelf (WCAG 2.2.2): de band en de badge staan stil, zoals op
// een foto van de Schwarzwald-site. Premium zelf blijft byte-gelijk.
// ---------------------------------------------------------------------------

/** Wat de opmaak van render.ts nodig heeft (geen import terug: render.ts importeert dit bestand). */
export interface BelevingCtx {
  esc: (s: unknown) => string;
  paras: (text: string) => string;
  /** een foto van de site; `alt` overschrijft de beschrijving ("" = sier, de foto staat verderop nog eens) */
  img: (id: string | null, sizes: string, eager?: boolean, alt?: string) => string;
  href: (raw: string) => string;
  bedrijf: Company;
  /** de pagina die nu gemaakt wordt */
  page: Page;
  /** alle pagina's (de band met het aanbod zoekt ook op andere pagina's) */
  pages: Page[];
  /** waar het contactformulier staat ("#contact" of de slug), null als er geen is */
  contact: string | null;
  /** de sterrenregel van een review ("" bij 0: een klantverhaal zonder score) */
  stars: (sterren: number) => string;
  /** de galerijklasse voor een aantal foto's (volle rijen) */
  galleryClass: (n: number) => string;
}

/** De twee tinten waar de opmaak mee rekent, uit premiumTokens. */
export interface BelevingTokens {
  night: string;
  moss: string;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");

/**
 * Kleuren als op schwarzwald.zekerflex.com. `ink` is de tekst op de accentkleur:
 * night op een lichte accent (hun oranje), crème op een donkere.
 */
export function belevingCss(t: BelevingTokens, accent: string, ink: string, display: string, text: string, hl = accent): string {
  const a = rgb(accent);
  const moss = rgb(t.moss);
  const n = rgb(t.night);
  return `
body{font-size:16px;line-height:1.6;color:var(--night)}h2{font-size:2.25rem;line-height:1.1;letter-spacing:-.025em}@media (min-width:640px){h2{font-size:3rem;line-height:1.02}}h3{font-size:1.25rem}
section{padding:80px 0}.wrap.narrow p,.split p{font-size:1.125rem;line-height:1.65}
.kicker{margin:0 0 12px;font:700 .75rem/1.4 ${text};letter-spacing:.18em;text-transform:uppercase;color:var(--a-d)}
.demo-bar{background:var(--sun);color:var(--night);font-size:.875rem;font-weight:600;padding:8px 16px}.demo-bar a{color:var(--night);text-decoration:underline;text-underline-offset:2px}
.bar{min-height:72px}nav a{font-size:.875rem;font-weight:600;padding:8px 14px}.btn{color:${ink}}
.cta-top{padding:10px 20px;font-size:.875rem;box-shadow:0 8px 24px -8px rgba(${a},.7)}@media (max-width:480px){.cta-top{display:inline-block;padding:9px 16px}.bar.prem .logo img{max-height:44px}.bar.prem{gap:10px}.bar.prem .logo{min-width:0;font-size:1.05rem;line-height:1.15;hyphens:auto;overflow-wrap:break-word}}
.hero.bel{min-height:0;display:block;padding:48px 0 96px}@media (min-width:1024px){.hero.bel{padding:80px 0 128px}}
.hero.bel::before,.hero.bel::after{content:"";position:absolute;border-radius:50%;pointer-events:none}.hero.bel::before{left:-128px;top:40px;width:420px;height:420px;background:radial-gradient(closest-side,rgba(${a},.34),rgba(${a},0))}.hero.bel::after{right:-80px;bottom:0;width:380px;height:380px;background:radial-gradient(closest-side,rgba(${moss},.95),rgba(${moss},0))}
.hero-grid{display:grid;gap:48px;align-items:center}@media (min-width:1024px){.hero-grid.met-foto{grid-template-columns:1.05fr 1fr}}
.hero.bel h1{color:var(--cream);max-width:none;margin:0;font-size:clamp(3.4rem,11vw,7.5rem);line-height:.9;letter-spacing:-.03em;overflow-wrap:anywhere}
@supports (width:1cqi){.hero-txt{container-type:inline-size}.hero.bel h1{font-size:min(clamp(3.4rem,11vw,7.5rem),calc(100cqi / var(--n,6)))}}
.hero.bel h1 .hl{display:block;margin-top:.06em;color:var(--sun)}.hero.bel .hero-txt>p{margin:28px 0 0;max-width:36rem;font-size:1.125rem;line-height:1.65;color:rgba(255,246,234,.8);opacity:1}
.hero-acts{display:flex;flex-wrap:wrap;gap:12px;margin:36px 0 0}.hero.bel .btn{padding:16px 28px;box-shadow:0 14px 40px -12px rgba(${a},.8)}.btn.ghost{background:transparent;color:var(--cream);border:1px solid rgba(255,255,255,.2);font-weight:600;box-shadow:none}.hero.bel .btn.ghost{box-shadow:none}.btn.ghost:hover{background:rgba(255,255,255,.1)}
.collage{position:relative;width:100%;max-width:560px;aspect-ratio:1;margin:0 auto}.collage .cf{position:absolute;overflow:hidden;min-height:0}.hero.bel .collage img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:1}
.collage .cf1{inset:6% 10% 18% 0;transform:rotate(-3deg);border-radius:2rem;box-shadow:0 0 0 4px rgba(255,246,234,.1),0 25px 50px -12px rgba(0,0,0,.5)}.collage.solo .cf1{inset:4% 4% 8% 0}
.collage .cf2,.collage .cf3{border-radius:1.5rem;box-shadow:0 0 0 4px var(--night),0 25px 50px -12px rgba(0,0,0,.5)}.collage .cf2{right:0;bottom:0;width:48%;aspect-ratio:4/3;transform:rotate(5deg)}.collage .cf3{left:2%;bottom:8%;width:32%;aspect-ratio:1;transform:rotate(-6deg)}
.badge{position:absolute;top:-8px;right:4%;display:grid;place-items:center;width:112px;height:112px;border-radius:50%;background:var(--sun);color:var(--night);box-shadow:0 20px 25px -5px rgba(0,0,0,.3)}@media (min-width:640px){.badge{width:128px;height:128px}}
.badge svg{position:absolute;inset:0;width:100%;height:100%}.badge text{font:700 9.5px/1 ${text};letter-spacing:.14em;text-transform:uppercase;fill:var(--night)}.badge b{font:700 1.5rem/1 ${display}}
.ticker{position:relative;z-index:2;margin-top:-48px;overflow:hidden;padding:24px 0}.ticker .tk{display:flex;gap:32px;width:max-content;margin:0 -40px;padding:16px 40px;transform:rotate(-2deg);background:var(--a);color:${ink};white-space:nowrap;font:700 1.5rem/1.2 ${display};text-transform:uppercase;box-shadow:0 20px 25px -5px rgba(0,0,0,.12)}@media (min-width:640px){.ticker .tk{font-size:1.875rem}}.ticker i{font-style:normal;color:var(--cream)}
.sec-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;margin:0 0 40px}.sec-head h2{margin:0}
.cards.bel{display:grid;gap:24px;grid-template-columns:1fr}@media (min-width:640px){.cards.bel{grid-template-columns:repeat(2,1fr)}}@media (min-width:1024px){.cards.bel{grid-template-columns:repeat(3,1fr)}}
.card.bel{display:flex;flex-direction:column;padding:0;overflow:hidden;border-radius:1.75rem;background:#fff;box-shadow:0 1px 2px rgba(10,18,14,.04),0 18px 40px -24px rgba(10,18,14,.35)}.card.bel .pic img{width:100%;aspect-ratio:4/3;object-fit:cover}
.pic.leeg{display:grid;place-items:center;aspect-ratio:4/3;overflow:hidden;padding:16px;background:radial-gradient(120% 90% at 30% 20%,rgba(${a},1) 0%,rgba(${a},.92) 45%,var(--forest) 115%)}.pic.leeg span{font:700 clamp(1.6rem,3.2vw,2.6rem)/1 ${display};text-transform:uppercase;text-align:center;letter-spacing:-.01em;color:rgba(10,18,14,.28)}
.card.bel .body{display:flex;flex:1;flex-direction:column;padding:22px 22px 20px}.card.bel h3{margin:0 0 6px;font-size:1.25rem}.card.bel .body p{color:var(--mute);font-size:.95rem;line-height:1.55}.card.bel .body p:last-of-type{margin-bottom:0}
.pijl{display:grid;place-items:center;align-self:flex-end;width:40px;height:40px;margin-top:auto;border-radius:50%;background:var(--a);color:${ink};font-weight:700;font-size:1.1rem;text-decoration:none}.card.bel .body p+.pijl{margin-top:16px}
.steps.bel{display:grid;gap:32px;grid-template-columns:1fr}@media (min-width:860px){.steps.bel{grid-template-columns:repeat(2,1fr);gap:40px 56px}}
.steps.bel li{display:flex;gap:20px;padding:0;background:none;border:0;border-radius:0;box-shadow:none}.steps.bel li::before{content:none;display:none}.steps.bel .stap-nr{flex-shrink:0;min-width:1.4ch;font:700 3rem/1 ${display};color:var(--a-d)}.steps.bel h3{margin:4px 0 4px}.steps.bel p{color:var(--mute)}
section.rev{background:var(--forest);color:var(--cream)}.rev h2{color:#fff}.rev .kicker{color:var(--sun)}.rev-grid{display:grid;gap:48px}@media (min-width:1024px){.rev-grid{grid-template-columns:.8fr 2fr}}
.rev-list{display:grid;gap:20px}@media (min-width:768px){.rev-list{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}}.rv{display:flex;flex-direction:column;margin:0;padding:24px;border-radius:1.75rem;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.rv .stars{margin:0 0 8px;color:var(--sun)}.rv blockquote{flex:1;margin:0;color:rgba(255,246,234,.9);line-height:1.6}.rv blockquote p{margin:0}.rv .who{margin:20px 0 0;font-size:.875rem;font-weight:700}.rev :focus-visible{outline-color:var(--sun)}
.band.bel{background:var(--a);color:${ink};padding:80px 0;text-align:center}.band.bel h2{color:inherit;max-width:none;font-size:clamp(2.4rem,6vw,4.5rem);line-height:.98;letter-spacing:-.03em}.band.bel p{font-size:1.125rem;opacity:1}
.band-acts{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin:32px 0 0}.btn.dark{background:var(--night);color:var(--cream)}.btn.line{background:transparent;color:inherit;border:2px solid currentColor;padding:13px 26px}.band.bel :focus-visible{outline-color:var(--night)}
footer .cols{grid-template-columns:1fr}@media (min-width:640px){footer .cols{grid-template-columns:repeat(2,1fr)}}@media (min-width:1024px){footer .cols{grid-template-columns:1.3fr 1fr 1fr 1fr}}
footer .flogo{display:block;max-height:80px;width:auto;margin:0 0 20px}footer .socials{gap:8px}footer .socials a{display:inline-block;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.1);font-size:.75rem;font-weight:600;text-decoration:none}footer .socials a:hover{background:rgba(255,255,255,.2)}
footer small{margin-top:48px;padding-top:20px;border-top:1px solid rgba(255,255,255,.1);font-size:.75rem;color:rgba(255,246,234,.55)}
.tegels{display:grid;gap:12px;grid-template-columns:repeat(2,1fr)}@media (min-width:640px){.tegels{gap:16px}}@media (min-width:1024px){.tegels{grid-template-columns:repeat(3,1fr)}}
.tegel{position:relative;overflow:hidden;margin:0;aspect-ratio:4/5;border-radius:1.75rem;background:var(--forest);color:var(--cream)}@media (min-width:640px){.tegel{aspect-ratio:4/3}}
.tegel img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.92;transition:transform .7s cubic-bezier(.2,.7,.2,1)}.tegel:hover img{transform:scale(1.05)}
.tegel::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(${n},.94) 0%,rgba(${n},.35) 50%,rgba(${n},0) 80%)}
.tegel .tg{position:absolute;left:0;right:0;bottom:0;z-index:1;display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:20px 22px}.tegel h3{margin:0;color:var(--cream);font-size:clamp(1.3rem,2.2vw,1.875rem);line-height:1.08}
.tegel .tg p{margin:6px 0 0;color:rgba(255,246,234,.85);font-size:.92rem;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.tegel .pijl{flex-shrink:0;margin:0}.tegel :focus-visible{outline-color:var(--sun)}
@media (max-width:639px){.tegel .tg{padding:14px 14px 16px}.tegel h3{font-size:1rem;line-height:1.15;hyphens:auto;overflow-wrap:break-word}.tegel .tg p,.tegel .pijl{display:none}}
.split.bel{gap:56px}.lijst{position:relative;padding:14px 10px}.lijst-f{overflow:hidden;transform:rotate(2deg);border-radius:2rem;box-shadow:0 0 0 4px #fff,0 30px 60px -22px rgba(10,18,14,.45)}.split.bel.flip .lijst-f{transform:rotate(-2deg)}.split.bel .lijst-f img{border-radius:0;aspect-ratio:4/3}
.lijst-tag{position:absolute;left:-6px;bottom:30px;transform:rotate(-5deg);padding:10px 18px;border-radius:999px;background:var(--sun);color:var(--night);font:700 .8rem/1 ${text};letter-spacing:.14em;text-transform:uppercase;box-shadow:0 12px 24px -10px rgba(0,0,0,.35)}
.paneel{position:relative;overflow:hidden;padding:64px 24px;border-radius:2.5rem;background:var(--night);color:var(--cream)}@media (min-width:640px){.paneel{padding:80px 56px}}
.paneel::before,.paneel::after{content:"";position:absolute;border-radius:50%;pointer-events:none}.paneel::before{right:-96px;top:-96px;width:400px;height:400px;background:radial-gradient(closest-side,rgba(${a},.45),rgba(${a},0))}.paneel::after{left:33%;bottom:-140px;width:340px;height:340px;background:radial-gradient(closest-side,rgba(255,210,63,.2),rgba(255,210,63,0))}
.paneel-in{position:relative;z-index:1}.paneel .kicker{display:inline-block;padding:4px 12px;border-radius:999px;background:var(--sun);color:var(--night);letter-spacing:.16em}.paneel h2{max-width:20ch;color:#fff;font-size:clamp(2.4rem,6vw,4.5rem);line-height:.96;letter-spacing:-.025em}.paneel h2 .hl{color:${hl}}
.usps.bel{margin-top:40px;gap:28px 40px}.usps.bel h3{color:var(--cream)}.usps.bel p{color:rgba(255,246,234,.78)}.usps.bel li::before{background:var(--a);color:${ink}}.paneel :focus-visible{outline-color:var(--sun)}
.uren-grid{display:grid;gap:32px;align-items:start}@media (min-width:860px){.uren-grid{grid-template-columns:1fr 1fr;align-items:center}}
.uren-kaart{margin:0;padding:28px 32px;border-radius:1.75rem;background:var(--night);color:var(--cream);box-shadow:0 30px 60px -30px rgba(10,18,14,.6)}.uren-kaart div{display:flex;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.1)}.uren-kaart div:first-child{padding-top:0}.uren-kaart div:last-child{border:0;padding-bottom:0}.uren-kaart dt{color:rgba(255,246,234,.72)}.uren-kaart dd{margin:0;font-weight:700;text-align:right}
.gallery.bel{gap:12px}.gallery.bel img{border-radius:1.5rem;transition:transform .7s cubic-bezier(.2,.7,.2,1)}.gallery.bel img:hover{transform:scale(1.02)}
details.q{margin:0 0 12px;padding:18px 22px;border:0;border-radius:1.25rem;background:#fff;box-shadow:0 1px 2px rgba(10,18,14,.04),0 12px 28px -20px rgba(10,18,14,.35)}details.q summary{font-family:${display};font-size:1.08rem}
form.contact{padding:24px;border-radius:1.75rem;background:#fff;box-shadow:0 1px 2px rgba(10,18,14,.04),0 18px 40px -24px rgba(10,18,14,.35)}
.contact-grid>div:last-child{align-self:start;padding:28px;border-radius:1.75rem;background:var(--night);color:var(--cream)}.contact-grid>div:last-child h3{color:#fff}.contact-grid>div:last-child a{color:var(--sun)}.contact-grid>div:last-child :focus-visible{outline-color:var(--sun)}
.pagekop{position:relative;overflow:hidden;padding:72px 0 64px;background:var(--night);color:var(--cream)}@media (min-width:1024px){.pagekop{padding:104px 0 88px}}
.pagekop::before{content:"";position:absolute;left:-120px;top:-80px;width:400px;height:400px;border-radius:50%;background:radial-gradient(closest-side,rgba(${a},.32),rgba(${a},0));pointer-events:none}.pagekop::after{content:"";position:absolute;right:-60px;bottom:-120px;width:340px;height:340px;border-radius:50%;background:radial-gradient(closest-side,rgba(${moss},.9),rgba(${moss},0));pointer-events:none}
.pagekop .wrap{position:relative;z-index:1}.pagekop .kicker{color:var(--sun)}.pagekop h1{max-width:18ch;margin:0;color:var(--cream);font-size:clamp(2.6rem,7vw,5rem);line-height:.95;letter-spacing:-.03em;overflow-wrap:anywhere}.pagekop p:not(.kicker){max-width:40rem;margin:20px 0 0;font-size:1.125rem;line-height:1.6;color:rgba(255,246,234,.8)}.pagekop :focus-visible{outline-color:var(--sun)}
@media (prefers-reduced-motion:reduce){.tegel img,.gallery.bel img{transition:none}.tegel:hover img,.gallery.bel img:hover{transform:none}}`;
}

// ---- de opening ------------------------------------------------------------

/** Korte woorden die bij het laatste woord van de kop horen ("De Vries", "'t Hof"). */
const SMALL = /^(de|het|'t|van|der|den|en|&)$/i;

/** De kop in twee delen: het gewone deel en het laatste woord (met een kort woord ervoor) dat zon-geel wordt. */
export function splitKop(kop: string): { rest: string; hl: string } {
  const words = kop.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { rest: words.join(" "), hl: "" };
  let from = words.length - 1;
  if (from >= 2 && SMALL.test(words[from - 1]!)) from -= 1;
  return { rest: words.slice(0, from).join(" "), hl: words.slice(from).join(" ") };
}

/**
 * Hoeveel "breedtes" het langste woord van de kop heeft (Bricolage Grotesque vet ±0,56 em per letter, met
 * wat marge: 0,6): de kop wordt nooit breder dan zijn kolom, ook niet met "Schildersbedrijf" op een telefoon,
 * en een punt achter een lang woord ("vakmanschap.") valt niet los op de volgende regel.
 */
export function kopMaat(kop: string): number {
  const longest = Math.max(4, ...kop.split(/\s+/).map((w) => [...w].length));
  return Math.round(longest * 0.6 * 100) / 100;
}

/** De foto's van de opening: die van het blok zelf, dan nog twee andere van deze pagina. */
export function collageFotos(heroFoto: string | null, page: Page): string[] {
  const ids: string[] = [];
  const add = (id: string | null | undefined) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  add(heroFoto);
  for (const b of page.blocks) {
    if (b.type === "tekstFoto") add(b.props.foto);
    else if (b.type === "galerij") b.props.fotos.forEach(add);
    else if (b.type === "diensten") b.props.items.forEach((it) => add(it.foto ?? null));
  }
  return ids.slice(0, 3);
}

/** De woorden op de schuine band: het aanbod van deze pagina, anders dat van een andere pagina. */
export function tickerWoorden(page: Page, pages: Page[]): string[] {
  const from = (p: Page) => p.blocks.flatMap((b) => (b.type === "diensten" ? b.props.items.map((it) => it.titel.trim()) : []));
  const titels = [...new Set([...from(page), ...pages.filter((p) => p.id !== page.id).flatMap(from)])].filter((t) => t && t.length <= 32).slice(0, 8);
  return titels.length >= 2 ? titels : [];
}

/** De tekst rond de zon-badge: naam en plaats, kort genoeg voor één rondje. */
export function badgeTekst(c: Company): string {
  const both = [c.naam, c.plaats].filter(Boolean).join(" · ");
  if (both.length <= 30) return `${both} · `;
  if (c.naam.length <= 30) return `${c.naam} · `;
  // te lang: afbreken bij een spatie, niet midden in een woord
  const cut = c.naam.slice(0, 29);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 10 ? cut.slice(0, sp) : cut.slice(0, 28)).trim()}… · `;
}

function hero(b: Extract<Block, { type: "hero" }>, bc: BelevingCtx): string {
  const { esc } = bc;
  const p = b.props;
  const fotos = collageFotos(p.foto, bc.page);
  // de eerste foto vertelt iets; de kleine staan verderop op de pagina nog eens (sier: lege alt)
  const pics = fotos.map((id, i) => bc.img(id, i === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw", i === 0, i === 0 ? undefined : "")).filter(Boolean);
  const { rest, hl } = splitKop(p.kop);
  const kop = `${esc(rest)}${hl ? `${rest ? " " : ""}<span class="hl">${esc(hl)}</span>` : ""}`;
  const tel = bc.bedrijf.telefoon ? `tel:${bc.bedrijf.telefoon.replace(/[^\d+]/g, "")}` : "";
  const acts = [
    p.knop && `<a class="btn" href="${esc(bc.href(p.knopLink))}">${esc(p.knop)}</a>`,
    tel && `<a class="btn ghost" href="${esc(bc.href(tel))}">Bel ${esc(bc.bedrijf.telefoon)}</a>`,
  ].filter(Boolean);
  const badge = `<div class="badge" aria-hidden="true"><svg viewBox="0 0 100 100"><defs><path id="bel-rond" d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0"/></defs><text><textPath href="#bel-rond" textLength="228" lengthAdjust="spacing">${esc(badgeTekst(bc.bedrijf))}</textPath></text></svg><b>★</b></div>`;
  const collage = pics.length ? `<div class="collage${pics.length === 1 ? " solo" : ""}">${pics.map((pic, i) => `<div class="cf cf${i + 1}">${pic}</div>`).join("")}${badge}</div>` : "";
  const woorden = tickerWoorden(bc.page, bc.pages);
  const rij = woorden.length ? [...woorden, ...woorden, ...woorden].slice(0, Math.max(12, woorden.length * 2)) : [];
  const ticker = rij.length ? `<div class="ticker" aria-hidden="true"><div class="tk">${rij.map((w) => `<span>${esc(w)}</span><i>✦</i>`).join("")}</div></div>` : "";
  return `<section class="hero bel"><div class="wrap hero-grid${collage ? " met-foto" : ""}"><div class="hero-txt"><h1 style="--n:${kopMaat(p.kop)}">${kop}</h1>${bc.paras(p.tekst)}${acts.length ? `<p class="hero-acts">${acts.join("")}</p>` : ""}</div>${collage}</div></section>${ticker}`;
}

/**
 * De kop van een pagina zonder openingsblok (Over ons, Contact): donker, met de naam als label,
 * de titel groot en de omschrijving eronder, zoals elke pagina van schwarzwald.zekerflex.com.
 */
export function paginaKop(page: Page, c: Company, esc: (s: unknown) => string): string {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const omschrijving = page.seoOmschrijving?.trim() ?? "";
  // geen intro die de titel herhaalt, of de tekst die er meteen onder staat (bij voorstellen is de omschrijving daar een stukje van)
  const eersteTekst = page.blocks.map((b) => (b.props as { tekst?: unknown }).tekst).find((t): t is string => typeof t === "string" && t.trim() !== "");
  const dubbel = !omschrijving || norm(omschrijving) === norm(page.titel) || (eersteTekst !== undefined && norm(eersteTekst).startsWith(norm(omschrijving).slice(0, 60)));
  return `<section class="pagekop"><div class="wrap"><p class="kicker">${esc(c.naam)}</p><h1>${esc(page.titel)}</h1>${dubbel ? "" : `<p>${esc(omschrijving)}</p>`}</div></section>`;
}

// ---- de andere blokken -------------------------------------------------------

/** Het kleine label boven de kop van een blok, zoals "OVER ONS" en "ACTIVITEITEN" op de Schwarzwald-site. */
export function kickerVoor(b: Block, c: Company): string {
  const label: Partial<Record<Block["type"], string>> = {
    tekst: c.naam,
    tekstFoto: c.naam,
    diensten: "Ons aanbod",
    stappen: "Zo simpel is het",
    usps: "Waarom wij",
    galerij: "Een indruk",
    reviews: "Ervaringen",
    faq: "Veelgestelde vragen",
    openingstijden: "Kom langs",
    contact: "Contact",
    vacatures: "Werken bij",
    reserveren: "Reserveren",
    burger3d: "Laag voor laag",
    prijzen: "Prijzen",
    team: "Ons team",
    cijfers: "In cijfers",
    logos: "Vertrouwd door",
    video: "Kijk mee",
    kaart: "Kom langs",
  };
  const t = label[b.type] ?? "";
  const kop = String((b.props as { kop?: unknown }).kop ?? "").toLowerCase();
  // geen label dat de kop alleen herhaalt ("Contact" boven "Neem contact op")
  return t && !kop.includes(t.toLowerCase()) ? t : "";
}

/** Het label boven de eerste kop van een blok dat de gewone opmaak houdt. */
export function metKicker(html: string, b: Block, bc: BelevingCtx): string {
  const t = kickerVoor(b, bc.bedrijf);
  const at = html.indexOf("<h2>");
  return t && at >= 0 ? `${html.slice(0, at)}<p class="kicker">${bc.esc(t)}</p>${html.slice(at)}` : html;
}

const head = (b: Block, kop: string, bc: BelevingCtx) => {
  const t = kickerVoor(b, bc.bedrijf);
  return `${t ? `<p class="kicker">${bc.esc(t)}</p>` : ""}<h2>${bc.esc(kop)}</h2>`;
};

/**
 * De blokken die op de Schwarzwald-site een eigen opmaak hebben; null = de gewone
 * (premium-)opmaak, met alleen een label erboven (metKicker).
 */
export function belevingBlok(b: Block, alt: string, bc: BelevingCtx): string | null {
  const { esc } = bc;
  switch (b.type) {
    case "hero":
      return hero(b, bc);
    case "diensten": {
      const pics = b.props.items.map((it) => bc.img(it.foto ?? null, "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"));
      const pijlNaar = (titel: string) => (bc.contact ? `<a class="pijl" href="${esc(bc.href(bc.contact))}" aria-label="${esc(`Vraag naar ${titel}`)}">→</a>` : "");
      // allemaal een foto: fototegels met de naam erin, zoals "Wat vieren jullie?" bij hen
      if (pics.length && pics.length <= 9 && pics.every(Boolean)) {
        return `<section${alt}><div class="wrap"><div class="sec-head"><div>${head(b, b.props.kop, bc)}</div></div><div class="tegels">${b.props.items
          .map((it, i) => {
            const eerste = it.tekst.split(/\n\s*\n/)[0]?.trim() ?? "";
            return `<div class="tegel">${pics[i]}<div class="tg"><div><h3>${esc(it.titel)}</h3>${eerste ? `<p>${esc(eerste)}</p>` : ""}</div>${pijlNaar(it.titel)}</div></div>`;
          })
          .join("")}</div></div></section>`;
      }
      // tussen kaarten met een foto krijgt een kaart zonder een vlak in de accentkleur met de naam, zoals "F1 SIM RACE" bij hen
      const metFoto = pics.some(Boolean);
      return `<section${alt}><div class="wrap"><div class="sec-head"><div>${head(b, b.props.kop, bc)}</div></div><div class="cards bel">${b.props.items
        .map((it, i) => {
          const pic = pics[i] ? `<div class="pic">${pics[i]}</div>` : metFoto ? `<div class="pic leeg" aria-hidden="true"><span>${esc(it.titel)}</span></div>` : "";
          return `<div class="card bel">${pic}<div class="body"><h3>${esc(it.titel)}</h3>${bc.paras(it.tekst)}${pijlNaar(it.titel)}</div></div>`;
        })
        .join("")}</div></div></section>`;
    }
    case "tekstFoto": {
      const p = b.props;
      const pic = bc.img(p.foto, "(min-width: 860px) 50vw, 100vw");
      // zonder foto de gewone leesbreedte (met een label erboven)
      if (!pic) return null;
      const tag = bc.bedrijf.plaats || "";
      return `<section${alt}><div class="wrap split bel${p.fotoLinks ? " flip" : ""}"><div>${head(b, p.kop, bc)}${bc.paras(p.tekst)}</div><div class="lijst"><div class="lijst-f">${pic}</div>${tag ? `<span class="lijst-tag" aria-hidden="true">${esc(tag)}</span>` : ""}</div></div></section>`;
    }
    case "usps": {
      // een donker paneel met gloed, zoals het blok over hun nieuwe megacenter; het laatste woord van de kop in de accentkleur
      const t = kickerVoor(b, bc.bedrijf);
      const { rest, hl } = splitKop(b.props.kop);
      const kop = `${esc(rest)}${hl ? `${rest ? " " : ""}<span class="hl">${esc(hl)}</span>` : ""}`;
      return `<section${alt}><div class="wrap"><div class="paneel"><div class="paneel-in">${t ? `<p class="kicker">${esc(t)}</p>` : ""}<h2>${kop}</h2><ul class="usps bel" role="list">${b.props.items
        .map((it) => `<li><h3>${esc(it.titel)}</h3>${bc.paras(it.tekst)}</li>`)
        .join("")}</ul></div></div></div></section>`;
    }
    case "openingstijden": {
      if (!b.props.regels.length) return null;
      return `<section${alt}><div class="wrap uren-grid"><div>${head(b, b.props.kop, bc)}${bc.bedrijf.telefoon ? `<p class="small">Liever even bellen? <a href="${esc(bc.href(`tel:${bc.bedrijf.telefoon.replace(/[^\d+]/g, "")}`))}">${esc(bc.bedrijf.telefoon)}</a></p>` : ""}</div><dl class="uren-kaart">${b.props.regels
        .map((r) => `<div><dt>${esc(r.dag)}</dt><dd>${esc(r.tijd)}</dd></div>`)
        .join("")}</dl></div></section>`;
    }
    case "galerij": {
      const pics = b.props.fotos.map((f) => bc.img(f, "(min-width: 760px) 33vw, 50vw")).filter(Boolean);
      if (pics.length === 0) return "";
      // twaalf foto's: drie volle rijen van vier
      const cls = pics.length === 12 ? "gallery g4" : bc.galleryClass(pics.length);
      return `<section${alt}><div class="wrap">${head(b, b.props.kop, bc)}<div class="${cls} bel">${pics.join("")}</div></div></section>`;
    }
    case "stappen":
      return `<section${alt}><div class="wrap">${head(b, b.props.kop, bc)}<ol class="steps bel" role="list">${b.props.items
        .map((it, i) => `<li><span class="stap-nr">${i + 1}</span><div><h3>${esc(it.titel)}</h3>${bc.paras(it.tekst)}</div></li>`)
        .join("")}</ol></div></section>`;
    case "reviews":
      return `<section class="rev"><div class="wrap rev-grid"><div>${head(b, b.props.kop, bc)}</div><div class="rev-list">${b.props.items
        .map((r) => `<figure class="rv">${bc.stars(r.sterren)}<blockquote>${bc.paras(r.tekst)}</blockquote><figcaption class="who">${esc(r.naam)}</figcaption></figure>`)
        .join("")}</div></div></section>`;
    case "cta": {
      const p = b.props;
      const tel = bc.bedrijf.telefoon ? `tel:${bc.bedrijf.telefoon.replace(/[^\d+]/g, "")}` : "";
      const acts = [
        p.knop && `<a class="btn dark" href="${esc(bc.href(p.knopLink))}">${esc(p.knop)}</a>`,
        tel && `<a class="btn line" href="${esc(bc.href(tel))}">Bel ${esc(bc.bedrijf.telefoon)}</a>`,
      ].filter(Boolean);
      return `<section class="band bel"><div class="wrap"><h2>${esc(p.kop)}</h2>${bc.paras(p.tekst)}${acts.length ? `<p class="band-acts">${acts.join("")}</p>` : ""}</div></section>`;
    }
    default:
      return null;
  }
}
