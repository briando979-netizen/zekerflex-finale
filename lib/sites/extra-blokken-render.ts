import type { Block, Company } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// De negen blokken die de bouwer sinds 6 nov 2026 erbij heeft: prijzen, team,
// cijfers, logo's, video, adres en route, afbeelding, scheiding en knoppen.
// Geen scripts en niets van een derde: een video is een eigen foto met een knop
// naar een https-link, een kaart is een adres met een routeknop. Client-veilig.
// ---------------------------------------------------------------------------

export interface ExtraCtx {
  esc: (s: unknown) => string;
  paras: (text: string) => string;
  img: (id: string | null, sizes: string, eager?: boolean, alt?: string) => string;
  href: (raw: string) => string;
  bedrijf: Company;
}

/** De blokken van dit bestand; render.ts valt hierop terug voor deze types. */
export const EXTRA_TYPES = ["prijzen", "team", "cijfers", "logos", "video", "kaart", "afbeelding", "scheiding", "knoppen"] as const;

/** Een regel per opsommingspunt, lege regels weg. */
export function puntenLijst(punten: string): string[] {
  return punten
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Het adres van het kaartblok: het eigen adres, anders dat van het bedrijf. */
export function kaartAdres(adres: string, c: Pick<Company, "straat" | "postcode" | "plaats">): string {
  const eigen = adres.trim();
  if (eigen) return eigen;
  return [c.straat, [c.postcode, c.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/** De routeknop: de eigen https-link, anders een zoekopdracht op het adres (een gewone link, niets ingebed). */
export function routeLink(routeLink: string, adres: string): string {
  const eigen = routeLink.trim();
  if (/^https:\/\/[^\s<>"']+$/.test(eigen)) return eigen;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres)}`;
}

export function extraBlokHtml(b: Block, c: ExtraCtx, alt: string): string | null {
  const { esc, paras } = c;
  const kopHtml = (kop: string) => (kop.trim() ? `<h2>${esc(kop)}</h2>` : "");
  switch (b.type) {
    case "prijzen": {
      const p = b.props;
      const kaarten = p.items
        .map((it) => {
          const punten = puntenLijst(it.punten);
          return `<li class="x-pakket${it.uitgelicht ? " x-top" : ""}">${it.uitgelicht ? '<span class="x-badge">Meest gekozen</span>' : ""}<h3>${esc(it.naam)}</h3><p class="x-prijs"><strong>${esc(it.prijs)}</strong>${it.eenheid ? ` <span>${esc(it.eenheid)}</span>` : ""}</p>${punten.length ? `<ul class="x-punten" role="list">${punten.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}${it.knop ? `<p class="x-knop"><a class="btn" href="${esc(c.href(it.knopLink))}">${esc(it.knop)}</a></p>` : ""}</li>`;
        })
        .join("");
      return `<section${alt}><div class="wrap">${kopHtml(p.kop)}${paras(p.tekst)}<ul class="x-prijzen" role="list">${kaarten}</ul></div></section>`;
    }
    case "team": {
      const p = b.props;
      const leden = p.items
        .map((it) => {
          const pic = c.img(it.foto, "(min-width: 760px) 25vw, 50vw", false, it.naam);
          return `<li class="x-lid">${pic ? `<div class="x-foto">${pic}</div>` : ""}<h3>${esc(it.naam)}</h3>${it.functie ? `<p>${esc(it.functie)}</p>` : ""}</li>`;
        })
        .join("");
      return `<section${alt}><div class="wrap">${kopHtml(p.kop)}${paras(p.tekst)}<ul class="x-team" role="list">${leden}</ul></div></section>`;
    }
    case "cijfers": {
      const p = b.props;
      return `<section${alt}><div class="wrap">${kopHtml(p.kop)}<ul class="x-cijfers" role="list">${p.items.map((it) => `<li><strong>${esc(it.waarde)}</strong><span>${esc(it.label)}</span></li>`).join("")}</ul></div></section>`;
    }
    case "logos": {
      const pics = b.props.fotos.map((f) => c.img(f, "160px")).filter(Boolean);
      if (pics.length === 0) return "";
      return `<section${alt}><div class="wrap">${kopHtml(b.props.kop)}<ul class="x-logos" role="list">${pics.map((p) => `<li>${p}</li>`).join("")}</ul></div></section>`;
    }
    case "video": {
      const p = b.props;
      const pic = c.img(p.foto, "(min-width: 860px) 820px, 100vw");
      const link = p.link.trim() ? c.href(p.link) : "";
      if (!pic && !link) return "";
      const knop = link ? `<p class="x-knop"><a class="btn" href="${esc(link)}" rel="noopener">${esc(p.knop || "Bekijk de video")}</a></p>` : "";
      // de foto is alleen decoratie: het toetsenbord en de schermlezer gebruiken de knop eronder
      const poster = pic ? `<div class="x-poster">${link ? `<a href="${esc(link)}" rel="noopener" tabindex="-1" aria-hidden="true">${pic}<span class="x-play"></span></a>` : pic}</div>` : "";
      return `<section${alt}><div class="wrap narrow x-video">${kopHtml(p.kop)}${paras(p.tekst)}${poster}${knop}</div></section>`;
    }
    case "kaart": {
      const p = b.props;
      const adres = kaartAdres(p.adres, c.bedrijf);
      if (!adres) return "";
      const regels = adres.split(/\s*[\n,]\s*/).filter(Boolean);
      return `<section${alt}><div class="wrap narrow x-kaart">${kopHtml(p.kop)}${paras(p.tekst)}<address class="x-adres">${regels.map(esc).join("<br>")}</address><p class="x-knop"><a class="btn" href="${esc(c.href(routeLink(p.routeLink, adres)))}" rel="noopener">${esc(p.knop || "Plan je route")}</a></p></div></section>`;
    }
    case "afbeelding": {
      const p = b.props;
      const pic = c.img(p.foto, p.breed ? "100vw" : "(min-width: 860px) 820px, 100vw");
      if (!pic) return "";
      return `<section class="x-afb-sec"><div class="wrap${p.breed ? "" : " narrow"}"><figure class="x-afb">${pic}${p.bijschrift.trim() ? `<figcaption>${esc(p.bijschrift)}</figcaption>` : ""}</figure></div></section>`;
    }
    case "scheiding": {
      const p = b.props;
      return p.vorm === "lijn" ? `<div class="x-scheiding x-${p.hoogte}"><div class="wrap"><hr></div></div>` : `<div class="x-scheiding x-${p.hoogte}" aria-hidden="true"></div>`;
    }
    case "knoppen": {
      const p = b.props;
      const knoppen = p.items.filter((it) => it.tekst.trim());
      if (knoppen.length === 0) return "";
      return `<section class="x-knoppen-sec"><div class="wrap">${kopHtml(p.kop)}<p class="x-knoppen">${knoppen.map((it) => `<a class="btn${it.vorm === "lijn" ? " x-lijn" : ""}" href="${esc(c.href(it.link))}">${esc(it.tekst)}</a>`).join("")}</p></div></section>`;
    }
    default:
      return null;
  }
}

/**
 * De opmaak van deze blokken en van de blokinstellingen (ruimte, achtergrond, uitlijning).
 * Alleen nieuwe klassen (x-…, zf-…): een bestaande site gebruikt ze niet en ziet dus niets veranderen.
 */
export function extraCss(): string {
  return `.x-prijzen,.x-team,.x-cijfers{list-style:none;margin:0;padding:0;display:grid;gap:20px}
.x-prijzen{grid-template-columns:repeat(auto-fit,minmax(230px,1fr));align-items:stretch}.x-pakket{position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:28px 24px}.x-pakket h3{color:var(--k);margin:0 0 .3em}.x-top{border:2px solid var(--k);box-shadow:0 12px 32px rgba(0,0,0,.1)}
.x-badge{position:absolute;top:-13px;left:24px;background:var(--a);color:var(--a-t);font-size:.78rem;font-weight:700;padding:4px 12px;border-radius:999px}.x-prijs{margin:0 0 16px;color:var(--mute)}.x-prijs strong{display:block;font-size:2rem;line-height:1.1;color:var(--ink)}
.x-punten{list-style:none;margin:0 0 20px;padding:0;display:grid;gap:8px}.x-punten li{position:relative;padding-left:26px}.x-punten li::before{content:"✓";position:absolute;left:0;color:var(--k);font-weight:700}.x-pakket .x-knop{margin:auto 0 0}.x-pakket .btn{display:block;text-align:center}
.x-team{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}.x-lid{text-align:center}.x-lid h3{margin:12px 0 2px}.x-lid p{margin:0;color:var(--mute)}.x-foto img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--r)}
.x-cijfers{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));text-align:center}.x-cijfers strong{display:block;font-weight:700;font-size:clamp(2.2rem,5vw,3.4rem);line-height:1.1;color:var(--k);letter-spacing:-.02em}.x-cijfers span{color:var(--mute)}
.x-logos{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:24px 40px;align-items:center;justify-content:center}.x-logos img{max-height:56px;width:auto;max-width:160px;object-fit:contain;filter:grayscale(1);opacity:.75}
.x-video{text-align:center}.x-poster{position:relative;margin:0 0 20px}.x-poster img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:var(--r)}.x-poster a{display:block;position:relative}.x-play{position:absolute;left:50%;top:50%;width:72px;height:72px;margin:-36px 0 0 -36px;border-radius:50%;background:rgba(0,0,0,.6)}.x-play::after{content:"";position:absolute;left:29px;top:22px;border-left:22px solid #fff;border-top:14px solid transparent;border-bottom:14px solid transparent}
.x-adres{font-style:normal;font-size:1.15rem;margin:0 0 18px}.x-kaart .x-knop,.x-video .x-knop{margin:0}
.x-afb-sec{padding:28px 0}.x-afb{margin:0}.x-afb img{width:100%;border-radius:var(--r)}.x-afb figcaption{margin-top:10px;color:var(--mute);font-size:.95rem;text-align:center}
.x-scheiding.x-klein{height:24px}.x-scheiding.x-normaal{height:56px}.x-scheiding.x-groot{height:112px}.x-scheiding:has(hr){display:flex;align-items:center}.x-scheiding hr{border:0;border-top:1px solid var(--line);margin:0;width:100%}
.x-knoppen-sec{padding:40px 0}.x-knoppen{display:flex;flex-wrap:wrap;gap:12px;margin:0}.btn.x-lijn{background:transparent;color:var(--k);box-shadow:inset 0 0 0 2px var(--k)}
.zf-r-klein>section{padding-top:32px;padding-bottom:32px}.zf-r-groot>section{padding-top:120px;padding-bottom:120px}
div.zf-bg-zacht>section{background:var(--soft)}div.zf-bg-merk>section{background:var(--k);color:var(--k-t)}div.zf-bg-merk>section a:not(.btn){color:inherit}div.zf-bg-accent>section{background:var(--a);color:var(--a-t)}div.zf-bg-accent>section a:not(.btn){color:inherit}
div.zf-bg-merk .btn.x-lijn{color:var(--k-t);box-shadow:inset 0 0 0 2px var(--k-t)}div.zf-bg-accent .btn:not(.x-lijn){background:var(--k);color:var(--k-t)}div.zf-bg-merk .x-cijfers strong,div.zf-bg-merk .x-cijfers span,div.zf-bg-merk .x-lid p,div.zf-bg-merk .x-afb figcaption,div.zf-bg-accent .x-cijfers strong,div.zf-bg-accent .x-cijfers span,div.zf-bg-accent .x-lid p{color:inherit}
.zf-u-midden{text-align:center}.zf-u-rechts{text-align:right}.zf-u-midden .x-knoppen,.zf-u-midden .x-logos{justify-content:center}.zf-u-rechts .x-knoppen,.zf-u-rechts .x-logos{justify-content:flex-end}.zf-u-midden .narrow,.zf-u-rechts .narrow{margin-left:auto;margin-right:auto}`;
}
