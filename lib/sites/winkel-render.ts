import { ldJson } from "@/lib/seo/json-ld";
import type { BlockProps, SiteProduct, Verzendmethode, Winkel } from "@/lib/sites/types";
import { categorieen, euro, isUitverkocht, maxBestelbaar, regelSleutels, zichtbareProducten, type BestelInvoer, type BestelOverzicht, type Bestelconcept } from "@/lib/sites/winkel";
import { somRegels } from "@/lib/sites/bestel-som";
import { BETAAL_NAAM, BETAAL_UITLEG, betaalOpties, betaalPast, toonIban } from "@/lib/sites/winkel-betalen";
import { ANDER_LAND, EU_LANDEN, actieveVerzendmethoden, landKeuze, prijsTekst } from "@/lib/sites/winkel-verzending";
import { GEEN_FILTER, SORTERINGEN, actieveFilters, filterProducten, filterQuery, heeftFilter, productenTekst, type WinkelFilter } from "@/lib/sites/winkel-filter";
import type { MandRegelInfo } from "@/lib/sites/mand";

// ---------------------------------------------------------------------------
// De winkel van een klantsite als HTML: productkaarten, de blokken "producten"
// en "uitgelicht", de productpagina (/p/<slug>), het overzicht (/winkel), het
// bestelformulier (/bestellen) met een controlestap, en de bedankpagina.
// Zoals de rest van een klantsite (lib/sites/render.ts): geen scripts, alles
// geëscaped, alleen eigen foto's. Bestellen gaat met gewone formulieren naar
// _zf/bestelling; de prijzen komen altijd van de gepubliceerde site.
// ---------------------------------------------------------------------------

/** Wat de weergave van render.ts meekrijgt (geen import terug: render.ts gebruikt dit bestand). */
export interface WinkelCtx {
  root: string;
  preview: boolean;
  /** voorbeeld of ontwerpvoorstel: formulieren versturen niets */
  inert: boolean;
  premium: boolean;
  bedrijfNaam: string;
  /** het adres van het bedrijf op één regel ("Dorpsstraat 1, 1234 AB Zonnedorp"); leeg als het er niet is */
  bedrijfAdres: string;
  /** de prijzen van de winkel zijn exclusief btw (lib/sites/winkel-btw.ts) */
  exclBtw: boolean;
  esc: (s: unknown) => string;
  paras: (t: string) => string;
  img: (id: string | null, sizes: string, eager?: boolean) => string;
  /** een veilige link naar een eigen pagina ("contact") of extern adres */
  href: (raw: string) => string;
}

/** Een pad binnen de site ("p/desem", "bestellen"); in de bouwer doen links niets. */
const pad = (ctx: WinkelCtx, p: string) => (ctx.preview ? "#" : `${ctx.root}${p}`);

const ankerVan = (categorie: string) => `cat-${categorie.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "overig"}`;

function prijs(ctx: WinkelCtx, p: SiteProduct): string {
  const oud = p.oudePrijsCents && p.oudePrijsCents > p.prijsCents ? `<s aria-label="Was ${ctx.esc(euro(p.oudePrijsCents))}">${ctx.esc(euro(p.oudePrijsCents))}</s> ` : "";
  return `${oud}${ctx.esc(euro(p.prijsCents))}${ctx.exclBtw ? `<span class="pbtw"> excl. btw</span>` : ""}`;
}

function foto(ctx: WinkelCtx, p: SiteProduct, sizes: string, eager = false): string {
  const pic = ctx.img(p.fotos[0] ?? null, sizes, eager);
  return pic || `<span class="ph" aria-hidden="true">${ctx.esc((p.naam.trim()[0] ?? "•").toUpperCase())}</span>`;
}

/** Een productkaart: de hele kaart is één link naar de productpagina. */
export function productKaart(ctx: WinkelCtx, p: SiteProduct): string {
  return `<a class="pcard" href="${ctx.esc(pad(ctx, `p/${p.slug}`))}"><span class="pimg">${foto(ctx, p, "(min-width: 1100px) 25vw, (min-width: 640px) 33vw, 50vw")}</span><span class="pbody">${p.categorie ? `<span class="pcat">${ctx.esc(p.categorie)}</span>` : ""}<h3>${ctx.esc(p.naam)}</h3>${p.korteTekst ? `<span class="pkort">${ctx.esc(p.korteTekst)}</span>` : ""}<span class="pprice">${prijs(ctx, p)}</span>${isUitverkocht(p) ? `<span class="psold">Uitverkocht</span>` : ""}</span></a>`;
}

const leegInBouwer = (ctx: WinkelCtx, alt: string, kop: string, tekst: string) =>
  ctx.preview ? `<section${alt}><div class="wrap"><h2>${ctx.esc(kop)}</h2><p class="small">${ctx.esc(tekst)}</p></div></section>` : "";

export function renderProductenBlok(ctx: WinkelCtx, w: Winkel, p: BlockProps["producten"], alt: string): string {
  const alle = zichtbareProducten(w).filter((x) => !p.categorie || x.categorie === p.categorie);
  if (!alle.length) return leegInBouwer(ctx, alt, p.kop, "Voeg producten toe in het tabblad Winkel; ze verschijnen dan hier.");
  const getoond = alle.slice(0, Math.max(1, Math.min(48, p.aantal)));
  const meer = alle.length > getoond.length || zichtbareProducten(w).length > alle.length;
  const naarWinkel = p.categorie ? `winkel#${ankerVan(p.categorie)}` : "winkel";
  return `<section${alt}><div class="wrap"><h2>${ctx.esc(p.kop)}</h2>${p.tekst ? ctx.paras(p.tekst) : ""}<div class="pgrid">${getoond.map((x) => productKaart(ctx, x)).join("")}</div>${meer ? `<p class="pmore"><a class="btn" href="${ctx.esc(pad(ctx, naarWinkel))}">Bekijk alle producten</a></p>` : ""}</div></section>`;
}

export function renderUitgelichtBlok(ctx: WinkelCtx, w: Winkel, p: BlockProps["uitgelicht"], alt: string): string {
  const x = zichtbareProducten(w).find((y) => y.id === p.productId);
  if (!x) return leegInBouwer(ctx, alt, p.kop || "Uitgelicht product", "Kies in dit blok welk product je wilt uitlichten.");
  const tekst = p.tekst || x.korteTekst || x.omschrijving.split(/\n\s*\n/)[0] || "";
  // het kleine label in de gedempte kleur: het gele "eyebrow" van premium is voor de donkere opening
  return `<section${alt}><div class="wrap split feat${p.fotoLinks ? " flip" : ""}"><div>${p.kop ? `<p class="pcat feat-label">${ctx.esc(p.kop)}</p>` : ""}<h2>${ctx.esc(x.naam)}</h2><p class="pprice big">${prijs(ctx, x)}</p>${isUitverkocht(x) ? `<p class="psold">Uitverkocht</p>` : ""}${ctx.paras(tekst)}<p><a class="btn" href="${ctx.esc(pad(ctx, `p/${x.slug}`))}">Bekijk ${ctx.esc(x.naam)}</a></p></div><div class="pimg feat-img">${foto(ctx, x, "(min-width: 860px) 50vw, 100vw")}</div></div></section>`;
}

/** Schema.org Product, zodat zoekmachines prijs en voorraad kunnen tonen. */
function productLd(p: SiteProduct, url: string, beeld: string | null, verkoper: string, exclBtw: boolean): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.naam,
    description: p.korteTekst || p.omschrijving.slice(0, 300),
    ...(beeld ? { image: beeld } : {}),
    ...(p.categorie ? { category: p.categorie } : {}),
    offers: {
      "@type": "Offer",
      price: (p.prijsCents / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: isUitverkocht(p) ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      ...(exclBtw ? { priceSpecification: { "@type": "PriceSpecification", price: (p.prijsCents / 100).toFixed(2), priceCurrency: "EUR", valueAddedTaxIncluded: false } } : {}),
      url,
      seller: { "@type": "Organization", name: verkoper },
    },
  };
  return `<script type="application/ld+json">${ldJson(data)}</script>`;
}

/** De keuzelijsten van een product (maat, kleur); `naam(i)` is de veldnaam en het id per optie. */
function keuzeVelden(ctx: WinkelCtx, p: SiteProduct, naam: (i: number) => string, gekozen: string[], uit: string): string {
  return (p.opties ?? [])
    .map((o, i) => {
      const id = naam(i);
      const waarden = o.waarden.map((w) => `<option value="${ctx.esc(w)}"${gekozen[i] === w ? " selected" : ""}>${ctx.esc(w)}</option>`).join("");
      return `<label class="keuze" for="${id}"><span>${ctx.esc(o.naam)}</span><select id="${id}" name="${id}"${uit}><option value="">Kies ${ctx.esc(o.naam.toLowerCase())}</option>${waarden}</select></label>`;
    })
    .join("");
}

/**
 * "Mail me als het er weer is" op een uitverkocht product: een gewoon formulier naar …/_zf/voorraadmelding
 * (lib/sites/voorraadmelding-opslag.ts), zonder script. Na het aanmelden (?gemeld=1) de bevestiging.
 */
function voorraadMeldingBlok(ctx: WinkelCtx, p: SiteProduct, gemeld: boolean): string {
  if (gemeld) return `<p class="mmelding" id="vm" role="status">Gelukt: we mailen je één keer zodra ${ctx.esc(p.naam)} er weer is.</p>`;
  const dicht = ctx.preview || ctx.inert;
  const uit = dicht ? " disabled" : "";
  const uitleg = ctx.inert ? "Dit is een voorbeeld: er wordt niets bewaard of verstuurd." : "Je krijgt één mail als het er weer is; daarna wissen we je e-mailadres. Komt het niet terug, dan wissen we het na een half jaar.";
  return `<form class="contact" method="post" action="${ctx.esc(dicht ? "#" : `${ctx.root}_zf/voorraadmelding`)}"><input type="hidden" name="p" value="${ctx.esc(p.id)}"><label for="vm-email">Mail me als het er weer is<input id="vm-email" name="email" type="email" required maxlength="200" autocomplete="email" placeholder="jouw@e-mailadres.nl"${uit}></label><label class="hp" aria-hidden="true">Laat leeg<input name="website" tabindex="-1" autocomplete="off"></label><p style="margin:0"><button class="btn" type="submit"${uit}>Houd me op de hoogte</button></p><p class="small">${uitleg}</p></form>`;
}

export function productPaginaBody(ctx: WinkelCtx, w: Winkel, p: SiteProduct, meta: { url: string; beeld: string | null; seo: boolean; gemeld?: boolean | undefined }): string {
  const fotos = p.fotos.map((f, i) => ctx.img(f, i === 0 ? "(min-width: 900px) 55vw, 100vw" : "(min-width: 900px) 14vw, 25vw", i === 0)).filter(Boolean);
  const galerij = fotos.length ? `<div class="pgal">${fotos.join("")}</div>` : `<div class="pgal"><span class="pimg">${foto(ctx, p, "100vw")}</span></div>`;
  // een div met de rol van nav: de menu-opmaak van de site (nav a als blok, licht in premium) hoort hier niet
  const kruimel = `<div class="crumbs" role="navigation" aria-label="Kruimelpad"><a href="${ctx.esc(pad(ctx, "winkel"))}">Winkel</a>${p.categorie ? ` <span aria-hidden="true">›</span> <a href="${ctx.esc(pad(ctx, `winkel#${ankerVan(p.categorie)}`))}">${ctx.esc(p.categorie)}</a>` : ""}</div>`;
  const weinig = p.voorraad != null && p.voorraad > 0 && p.voorraad <= 5 ? `<p class="pstock">Nog ${p.voorraad} op voorraad</p>` : "";
  // in de winkelmand (lib/sites/mand.ts): een gewoon formulier naar …/mand, ook op een voorbeeld (daar wordt niets besteld)
  const bestel = isUitverkocht(p)
    ? `<p class="psold big">Uitverkocht</p>${voorraadMeldingBlok(ctx, p, meta.gemeld === true)}`
    : w.bestellen
      ? `${weinig}<form class="buy" method="get" action="${ctx.esc(pad(ctx, "mand"))}"><input type="hidden" name="voeg" value="${ctx.esc(p.id)}">${keuzeVelden(ctx, p, (i) => `o${i}`, [], " required")}<span class="buy-row"><label for="aantal">Aantal</label><input id="aantal" name="aantal" type="number" inputmode="numeric" min="1" max="${maxBestelbaar(p)}" value="1"><button class="btn" type="submit">In winkelmand</button></span></form>${ctx.inert ? `<p class="small">Dit is een voorbeeld: je kunt alles proberen, maar er wordt niets besteld.</p>` : ""}`
      : `${weinig}<p><a class="btn" href="${ctx.esc(ctx.href("contact"))}">Neem contact op om te bestellen</a></p>`;
  return `<section><div class="wrap">${kruimel}<div class="product"><div>${galerij}</div><div class="pinfo">${p.categorie ? `<p class="pcat">${ctx.esc(p.categorie)}</p>` : ""}<h1>${ctx.esc(p.naam)}</h1><p class="pprice big">${prijs(ctx, p)}</p>${p.korteTekst ? `<p class="lead">${ctx.esc(p.korteTekst)}</p>` : ""}${bestel}<div class="pdesc"><h2 class="pdesc-kop">Over dit product</h2>${ctx.paras(p.omschrijving)}</div></div></div></div></section>${meta.seo ? productLd(p, meta.url, meta.beeld, ctx.bedrijfNaam, ctx.exclBtw) : ""}`;
}

/**
 * De winkel: zoeken, een categorie, een prijs, alleen op voorraad of in de aanbieding, en sorteren, met één
 * gewoon formulier (GET …/winkel?…). Zonder filter staan de producten per categorie, zoals altijd; met een
 * filter in één lijst, met het aantal en elk filter als knopje om weg te halen. Op de telefoon klapt het
 * formulier open met een knop (een verborgen vinkje, geen script).
 */
export function winkelPaginaBody(ctx: WinkelCtx, w: Winkel, f: WinkelFilter = GEEN_FILTER): string {
  const producten = zichtbareProducten(w);
  if (!producten.length) return `<section><div class="wrap narrow"><h1>Winkel</h1><p>Er staan nog geen producten in de winkel. Kijk later nog eens.</p></div></section>`;
  const { esc } = ctx;
  const cats = categorieen(producten);
  const link = (query: string) => (ctx.preview ? "#" : `${ctx.root}winkel${query}`);
  const gefilterd = heeftFilter(f) || f.sort !== "aanbevolen";
  const gevonden = filterProducten(producten, f);

  const chips =
    cats.length > 1
      ? `<ul class="chips" role="list"><li><a href="${esc(link(filterQuery(f, { cat: "" })))}"${f.cat ? "" : ' aria-current="true"'}>Alles</a></li>${cats
          .map((c) => `<li><a href="${esc(link(filterQuery(f, { cat: c })))}"${f.cat === c ? ' aria-current="true"' : ""}>${esc(c)}</a></li>`)
          .join("")}</ul>`
      : "";
  const aanbiedingen = producten.some((p) => p.oudePrijsCents && p.oudePrijsCents > p.prijsCents);
  const getal = (v: number | null) => (v === null ? "" : String(v));
  const formulier = `<form class="wfilter" method="get" action="${esc(pad(ctx, "winkel"))}" role="search" aria-label="Producten zoeken en filteren"><label for="wf-q">Zoeken<input id="wf-q" type="search" name="q" value="${esc(f.q)}" maxlength="60" placeholder="Wat zoek je?"></label>${
    cats.length > 1
      ? `<label for="wf-cat">Categorie<select id="wf-cat" name="cat"><option value="">Alle categorieën</option>${cats.map((c) => `<option value="${esc(c)}"${f.cat === c ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>`
      : ""
  }<fieldset class="wprijs"><legend>Prijs in euro's</legend><label for="wf-min"><span class="vh">Vanaf</span><input id="wf-min" name="min" type="number" inputmode="numeric" min="0" max="100000" placeholder="Van" value="${getal(f.min)}"></label><span aria-hidden="true">–</span><label for="wf-max"><span class="vh">Tot en met</span><input id="wf-max" name="max" type="number" inputmode="numeric" min="0" max="100000" placeholder="Tot" value="${getal(f.max)}"></label></fieldset><label class="wcheck"><input type="checkbox" name="voorraad" value="1"${f.voorraad ? " checked" : ""}> Alleen op voorraad</label>${
    aanbiedingen ? `<label class="wcheck"><input type="checkbox" name="aanbieding" value="1"${f.aanbieding ? " checked" : ""}> Alleen aanbiedingen</label>` : ""
  }<label for="wf-sort">Sorteren<select id="wf-sort" name="sort">${SORTERINGEN.filter((s) => s.id !== "korting" || aanbiedingen)
    .map((s) => `<option value="${s.id}"${f.sort === s.id ? " selected" : ""}>${esc(s.label)}</option>`)
    .join("")}</select></label><p class="wknoppen"><button class="btn" type="submit">Toon producten</button>${gefilterd ? `<a href="${esc(link(""))}">Wis alles</a>` : ""}</p></form>`;
  const aantalFilters = actieveFilters(f).length;
  // het vinkje staat vóór het paneel: aan = open (op de computer staat het paneel altijd open)
  const paneel = `<input type="checkbox" id="wf-open" class="wf-toggle"${aantalFilters ? " checked" : ""}><label for="wf-open" class="wf-knop">Zoeken en filteren${aantalFilters ? ` (${aantalFilters})` : ""}</label><div class="wf-paneel">${formulier}</div>`;

  const actief = actieveFilters(f);
  const balk = `<div class="wbalk"><p class="wtel" role="status">${productenTekst(gevonden.length)}${heeftFilter(f) ? " gevonden" : ""}</p>${
    actief.length ? `<ul class="wactief" role="list">${actief.map((a) => `<li><a href="${esc(link(a.zonder))}">${esc(a.label)}<span aria-hidden="true"> ×</span><span class="vh"> (filter weghalen)</span></a></li>`).join("")}</ul>` : ""
  }</div>`;
  let lijst: string;
  if (!gevonden.length) {
    lijst = `<div class="wleeg"><p><strong>Geen producten gevonden.</strong> Probeer een ander woord of minder filters.</p><p><a class="btn" href="${esc(link(""))}">Toon alle producten</a></p></div>`;
  } else if (!gefilterd && cats.length > 1) {
    const zonder = producten.filter((p) => !p.categorie);
    const groep = (titel: string, rij: SiteProduct[], id: string) => `<div class="pcatgroup" id="${id}">${titel ? `<h2>${esc(titel)}</h2>` : ""}<div class="pgrid">${rij.map((p) => productKaart(ctx, p)).join("")}</div></div>`;
    lijst = [...cats.map((c) => groep(c, producten.filter((p) => p.categorie === c), ankerVan(c))), zonder.length ? groep("Overig", zonder, "cat-overig") : ""].join("");
  } else {
    lijst = `<div class="pgrid">${gevonden.map((p) => productKaart(ctx, p)).join("")}</div>`;
  }
  const mand = w.bestellen ? `<a class="btn mknop" href="${esc(pad(ctx, "mand"))}">Naar je winkelmand</a>` : "";
  return `<section><div class="wrap"><div class="whead"><h1>Winkel</h1>${mand}</div>${chips}<div class="wlayout"><div class="wf">${paneel}</div><div class="wresult">${balk}${lijst}</div></div></div></section>`;
}

/** De winkelmand (…/mand): de regels met aantal en verwijderen, en het overzicht met afrekenen. */
export function mandPaginaBody(ctx: WinkelCtx, w: Winkel, mand: { regels: MandRegelInfo[]; subtotaalCents: number; aantal: number }, melding: string): string {
  const { esc } = ctx;
  const meld = melding ? `<p class="mmelding" role="status">${esc(melding)}</p>` : "";
  if (!mand.regels.length) {
    return `<section><div class="wrap narrow"><h1>Winkelmand</h1>${meld}<div class="mleeg"><p>Je winkelmand is leeg.</p><p><a class="btn" href="${esc(pad(ctx, "winkel"))}">Naar de winkel</a></p></div></div></section>`;
  }
  const regels = mand.regels
    .map((r) => {
      const naar = esc(pad(ctx, `p/${r.product.slug}`));
      const id = `ma-${r.index}`;
      return `<li class="mregel${r.probleem ? " mprob" : ""}"><a class="mfoto" href="${naar}" tabindex="-1" aria-hidden="true">${foto(ctx, r.product, "96px")}</a><div class="minfo"><h2><a href="${naar}">${esc(r.product.naam)}</a></h2>${r.variant ? `<p class="mvar">${esc(r.variant)}</p>` : ""}<p class="mstuk">${prijs(ctx, r.product)} per stuk</p>${r.probleem ? `<p class="mfout">${esc(r.probleem)}</p>` : ""}<div class="macties"><form method="get" action="${esc(pad(ctx, "mand"))}"><input type="hidden" name="zet" value="${r.index}"><label for="${id}">Aantal</label><input id="${id}" name="aantal" type="number" inputmode="numeric" min="0" max="${maxBestelbaar(r.product) || 99}" value="${r.aantal}"><button class="btn mknop" type="submit">Bijwerken<span class="vh">: ${esc(r.product.naam)}</span></button></form><form method="get" action="${esc(pad(ctx, "mand"))}"><input type="hidden" name="weg" value="${r.index}"><button class="mweg" type="submit">Verwijderen<span class="vh">: ${esc(r.product.naam)}</span></button></form></div></div><p class="mtotaal">${esc(euro(r.totaalCents))}</p></li>`;
    })
    .join("");
  const bezorg = esc(mandVerzendTekst(w, mand.subtotaalCents));
  const kan = mand.regels.some((r) => !r.probleem);
  const n = mand.aantal === 1 ? "1 artikel" : `${mand.aantal} artikelen`;
  return `<section><div class="wrap"><h1>Winkelmand</h1>${meld}<div class="mgrid"><ul class="mlijst" role="list">${regels}</ul><div class="msom"><h2>Overzicht</h2><dl><div><dt>Subtotaal (${n}${ctx.exclBtw ? ", excl. btw" : ""})</dt><dd>${esc(euro(mand.subtotaalCents))}</dd></div></dl><p class="small">${bezorg}</p>${
    kan ? `<p><a class="btn mafreken" href="${esc(pad(ctx, "bestellen"))}">Afrekenen</a></p>` : `<p class="small">Pas eerst de regels met een melding aan.</p>`
  }<p class="mverder"><a href="${esc(pad(ctx, "winkel"))}">Verder winkelen</a></p>${ctx.inert ? `<p class="small">Dit is een voorbeeld: er wordt niets besteld.</p>` : ""}</div></div></div></section>`;
}

/**
 * Wat de winkelmand over verzenden zegt, met de goedkoopste bezorging: hoeveel er nog bij moet voor
 * gratis bezorgen, of wat het kost. Zonder bezorging: afhalen.
 */
export function mandVerzendTekst(w: Winkel, subtotaalCents: number): string {
  const methoden = actieveVerzendmethoden(w);
  const bezorg = methoden.filter((m) => m.soort === "bezorgen");
  if (!bezorg.length) return "Je haalt je bestelling bij ons af.";
  if (bezorg.some((m) => m.prijsCents <= 0)) return "Bezorgen is gratis.";
  const grens = Math.min(...bezorg.map((m) => m.gratisVanafCents ?? Infinity));
  if (Number.isFinite(grens)) return grens > subtotaalCents ? `Nog ${euro(grens - subtotaalCents)} tot gratis bezorgen.` : "Je bestelling wordt gratis bezorgd.";
  const goedkoopst = Math.min(...bezorg.map((m) => m.prijsCents));
  const afhalenGratis = methoden.some((m) => m.soort === "afhalen" && m.prijsCents <= 0);
  return `Bezorgen kost ${bezorg.length > 1 ? "vanaf " : ""}${euro(goedkoopst)}${afhalenGratis ? "; afhalen is gratis" : ""}.`;
}

/** Onder de naam van een verzendmethode: het afhaaladres (of dat van het bedrijf) en de levertijd. */
function methodeDetail(ctx: WinkelCtx, m: Verzendmethode): string {
  return [m.soort === "afhalen" ? m.adres.trim() || ctx.bedrijfAdres : "", m.levertijd.trim()].filter(Boolean).join(" · ");
}

/** De optelling onder de productregels (lib/sites/bestel-som.ts): korting, verzending, btw en totaal. */
function somTabel(ctx: WinkelCtx, c: BestelOverzicht): string {
  const { esc } = ctx;
  const rijen = somRegels(c);
  const t = rijen.findIndex((r) => r.soort === "totaal");
  const rij = (r: (typeof rijen)[number]) =>
    r.soort === "noot"
      ? `<tr class="snoot"><td colspan="2">${esc(r.label)}</td></tr>`
      : r.soort === "totaal"
        ? `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.bedrag)}</td></tr>`
        : `<tr${r.soort === "klein" ? ' class="sklein"' : ""}><td>${esc(r.label)}</td><td>${esc(r.bedrag)}</td></tr>`;
  const regels = c.regels.map((r) => `<tr><td>${r.aantal} × ${esc(r.naam)}</td><td>${esc(euro(r.totaalCents))}</td></tr>`).join("");
  return `<table class="sum"><tbody>${regels}${rijen.slice(0, t).map(rij).join("")}</tbody><tfoot>${rijen.slice(t).map(rij).join("")}</tfoot></table>`;
}

/** De regels van een bestelling uit het formulier (ook meer maten of kleuren van één product), voor het overzicht uit de mand. */
function invoerRegels(w: Winkel, v: BestelInvoer): { sleutel: string; product: SiteProduct; aantal: number; keuzes: string[] }[] {
  return zichtbareProducten(w).flatMap((p) =>
    regelSleutels(p.id)
      .filter((k) => (v.aantallen[k] ?? 0) > 0)
      .map((k) => ({ sleutel: k, product: p, aantal: v.aantallen[k] ?? 0, keuzes: v.keuzes[k] ?? [] })),
  );
}

const veld = (ctx: WinkelCtx, naam: string, label: string, waarde: string, extra = "") =>
  `<label>${ctx.esc(label)}<input name="${naam}" value="${ctx.esc(waarde)}"${extra}></label>`;

/**
 * Het bestelformulier; met `invoer` en `fouten` opnieuw getoond na een controle. `vanMand`: uit de winkelmand
 * (lib/sites/mand.ts), dan staat alleen wat in de mand zit erin, met een link om de mand te wijzigen.
 * Op een voorbeeld of voorstel werkt alles, maar wordt er niets besteld (lib/sites/bestellingen.ts).
 */
export function bestelPaginaBody(ctx: WinkelCtx, w: Winkel, opts: { invoer?: BestelInvoer | undefined; fouten?: string[] | undefined; vanMand?: boolean | undefined } = {}): string {
  if (!w.bestellen) return `<section><div class="wrap narrow"><h1>Bestellen</h1><p>Online bestellen staat op deze website uit. <a href="${ctx.esc(ctx.href("contact"))}">Neem contact op</a> om te bestellen.</p></div></section>`;
  const v = opts.invoer;
  const producten = zichtbareProducten(w);
  const cats = categorieen(producten);
  const rij = (p: SiteProduct) => {
    const n = v?.aantallen[p.id] ?? 0;
    const id = `n_${p.id}`;
    const op = isUitverkocht(p);
    const weinig = !op && p.voorraad != null && p.voorraad <= 5 ? ` <span class="ostock">nog ${p.voorraad}</span>` : "";
    const keuzes = p.opties?.length && !op ? `<span class="okeuzes">${keuzeVelden(ctx, p, (i) => `k_${p.id}_${i}`, v?.keuzes[p.id] ?? [], "")}</span>` : "";
    return `<li class="orow${op ? " sold" : ""}"><span class="omain"><label for="${id}"><span class="oname">${ctx.esc(p.naam)}</span>${op ? ` <span class="psold">Uitverkocht</span>` : ""}<span class="oprice">${prijs(ctx, p)}</span>${weinig}</label>${keuzes}</span><input id="${id}" name="${id}" type="number" inputmode="numeric" min="0" max="${maxBestelbaar(p)}" value="${n}"${op ? " disabled" : ""}></li>`;
  };
  const uitMand = opts.vanMand && v ? invoerRegels(w, v) : [];
  const mandLijst = uitMand.length
    ? `<ul class="olist mkort" role="list">${uitMand
        .map((r) => `<li class="orow"><span>${r.aantal} × ${ctx.esc(r.product.naam)}${r.keuzes.filter(Boolean).length ? ` <span class="oprice">(${ctx.esc(r.keuzes.filter(Boolean).join(", "))})</span>` : ""}</span><span>${ctx.esc(euro(r.product.prijsCents * r.aantal))}</span><input type="hidden" name="n_${ctx.esc(r.sleutel)}" value="${r.aantal}">${r.keuzes.map((k, i) => (k ? `<input type="hidden" name="k_${ctx.esc(r.sleutel)}_${i}" value="${ctx.esc(k)}">` : "")).join("")}</li>`)
        .join("")}</ul><p class="small"><a href="${ctx.esc(pad(ctx, "mand"))}">Wijzig je winkelmand</a></p><input type="hidden" name="bron" value="mand">`
    : "";
  const lijst = mandLijst
    ? mandLijst
    : cats.length
    ? [...cats.map((c) => `<h2 class="ocat">${ctx.esc(c)}</h2><ul class="olist" role="list">${producten.filter((p) => p.categorie === c).map(rij).join("")}</ul>`), producten.some((p) => !p.categorie) ? `<h2 class="ocat">Overig</h2><ul class="olist" role="list">${producten.filter((p) => !p.categorie).map(rij).join("")}</ul>` : ""].join("")
    : `<ul class="olist" role="list">${producten.map(rij).join("")}</ul>`;
  const { esc } = ctx;
  // verzenden: een keuze als er meer methoden zijn, anders één zin; een formulier van vóór de keuze kiest op `levering`
  const methoden = actieveVerzendmethoden(w);
  const gekozen = methoden.find((m) => m.id === v?.verzend) ?? methoden.find((m) => m.soort === v?.levering) ?? methoden[0];
  const kanAfhalen = methoden.some((m) => m.soort === "afhalen");
  const kanBezorgen = methoden.some((m) => m.soort === "bezorgen");
  const keuzeRij = (naam: string, waarde: string, aan: boolean, titel: string, prijs: string, detail: string) =>
    `<label class="vkeuze"><input type="radio" name="${naam}" value="${esc(waarde)}"${aan ? " checked" : ""}><span class="vnaam">${esc(titel)}</span>${prijs ? `<span class="vprijs">${esc(prijs)}</span>` : ""}${detail ? `<small>${esc(detail)}</small>` : ""}</label>`;
  let levering = "";
  if (methoden.length > 1) {
    levering = `<fieldset><legend>Verzending</legend><div class="vkeuzes">${methoden.map((m) => keuzeRij("verzend", m.id, m === gekozen, m.naam, prijsTekst(m), methodeDetail(ctx, m))).join("")}</div></fieldset>`;
  } else if (gekozen) {
    const detail = methodeDetail(ctx, gekozen);
    levering = `<input type="hidden" name="verzend" value="${esc(gekozen.id)}"><p class="small">${
      gekozen.soort === "afhalen" ? `Je haalt je bestelling bij ons af${detail ? ` (${esc(detail)})` : ""}.` : `${esc(gekozen.naam)}: ${esc(prijsTekst(gekozen).toLowerCase())}${gekozen.levertijd.trim() ? ` (${esc(gekozen.levertijd.trim())})` : ""}.`
    }</p>`;
  }
  // het land alleen als de winkel ook buiten Nederland bezorgt
  const gebied = landKeuze(methoden);
  const land = (v?.land ?? "").toUpperCase();
  const landVeld =
    gebied === "nl"
      ? ""
      : `<label>Land<select class="osel" name="land" autocomplete="country">${EU_LANDEN.map((l) => `<option value="${l.code}"${l.code === (land || "NL") ? " selected" : ""}>${esc(l.naam)}</option>`).join("")}${gebied === "overal" ? `<option value="${ANDER_LAND}"${land === ANDER_LAND ? " selected" : ""}>Ander land (buiten de EU)</option>` : ""}</select></label>${
          gebied === "overal" ? veld(ctx, "landAnders", "Welk land? (alleen bij een ander land)", v?.landAnders ?? "", ' maxlength="60"') : ""
        }`;
  const adres = kanBezorgen
    ? `<fieldset><legend>Bezorgadres${kanAfhalen ? " (alleen bij bezorgen)" : ""}</legend>${veld(ctx, "straat", "Straat en huisnummer", v?.straat ?? "", ' maxlength="120" autocomplete="street-address"')}${veld(ctx, "postcode", "Postcode", v?.postcode ?? "", ' maxlength="10" autocomplete="postal-code"')}${veld(ctx, "plaats", "Plaats", v?.plaats ?? "", ' maxlength="80" autocomplete="address-level2"')}${landVeld}</fieldset>`
    : "";
  // betalen: alleen wat bij minstens één verzendmethode past
  const betaal = betaalOpties(w).filter((b) => methoden.some((m) => betaalPast(b, m.soort)));
  const betaalGekozen = betaal.find((b) => b === v?.betaalmethode) ?? betaal[0];
  const betalen =
    betaal.length > 1
      ? `<fieldset><legend>Betalen</legend><div class="vkeuzes">${betaal.map((b) => keuzeRij("betaalmethode", b, b === betaalGekozen, BETAAL_NAAM[b], "", BETAAL_UITLEG[b])).join("")}</div></fieldset>`
      : betaalGekozen
        ? `<input type="hidden" name="betaalmethode" value="${betaalGekozen}"><p class="small"><strong>Betalen:</strong> ${esc(BETAAL_NAAM[betaalGekozen])}. ${esc(BETAAL_UITLEG[betaalGekozen])}</p>`
        : "";
  // een kortingscode alleen als de winkel er een heeft die aan staat
  const korting = (w.kortingscodes ?? []).some((k) => k.actief)
    ? `<label>Kortingscode (mag leeg)<input name="kortingscode" value="${esc(v?.kortingscode ?? "")}" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>`
    : "";
  const exclNoot = ctx.exclBtw ? `<p class="small">Alle prijzen zijn exclusief btw. De btw komt erbij in het overzicht van je bestelling.</p>` : "";
  const fouten = opts.fouten?.length ? `<div class="alert" role="alert"><p><strong>Nog even kijken:</strong></p><ul>${opts.fouten.map((f) => `<li>${ctx.esc(f)}</li>`).join("")}</ul></div>` : "";
  const note = ctx.inert ? `<p class="small"><strong>Dit is een voorbeeld:</strong> je kunt alles proberen, maar er wordt niets besteld of verstuurd.</p>` : `<p class="small">We gebruiken je gegevens alleen voor je bestelling. Lees de <a href="${ctx.esc(ctx.href("privacy"))}">privacyverklaring</a>.</p>`;
  // op de computer: links de producten, rechts (meeschuivend) levering, gegevens en de knop
  return `<section><div class="wrap"><h1>Bestellen</h1>${fouten}<form class="contact order" method="post" action="${ctx.esc(ctx.preview ? "#" : `${ctx.root}_zf/bestelling`)}"><input type="hidden" name="stap" value="controle"><div class="ocols"><div><fieldset><legend>${mandLijst ? "Je bestelling" : "Wat wil je bestellen?"}</legend>${lijst}</fieldset></div><div class="oside">${levering}<fieldset><legend>Je gegevens</legend>${veld(ctx, "naam", "Naam", v?.naam ?? "", ' required maxlength="100" autocomplete="name"')}${veld(ctx, "email", "E-mailadres", v?.email ?? "", ' type="email" required maxlength="200" autocomplete="email"')}${veld(ctx, "telefoon", "Telefoon", v?.telefoon ?? "", ' type="tel" required maxlength="30" autocomplete="tel"')}</fieldset>${adres}${betalen}${korting}<label>Opmerking (mag leeg)<textarea name="opmerking" maxlength="1000">${ctx.esc(v?.opmerking ?? "")}</textarea></label><label class="hp" aria-hidden="true">Laat leeg<input name="website" tabindex="-1" autocomplete="off"></label>${exclNoot}${note}<p style="margin:0"><button class="btn" type="submit">Bekijk je bestelling</button></p></div></div></form></div></section>`;
}

/** Stap 2: het overzicht met totaal; dezelfde gegevens gaan verborgen mee naar "plaatsen" of terug naar "wijzigen". */
export function controlePaginaBody(ctx: WinkelCtx, w: Winkel, c: Bestelconcept, vanMand = false): string {
  const i = c.invoer;
  const vz = c.verzending;
  const verborgen = [
    ...(vanMand ? [["bron", "mand"] as const] : []),
    ...Object.entries(i.aantallen).map(([id, n]) => [`n_${id}`, String(n)] as const),
    // de gekozen maat/kleur gaan mee, zodat "plaatsen" en "wijzigen" ze weer hebben
    ...Object.entries(i.keuzes).flatMap(([id, waarden]) => waarden.flatMap((w, idx) => (w ? [[`k_${id}_${idx}`, w] as const] : []))),
    ["levering", i.levering],
    ["naam", i.naam],
    ["email", i.email],
    ["telefoon", i.telefoon],
    ["straat", i.straat],
    ["postcode", i.postcode],
    ["plaats", i.plaats],
    ["opmerking", i.opmerking],
    // de keuzes gaan mee; de bedragen rekent de server bij "plaatsen" opnieuw uit
    ["verzend", i.verzend ?? ""],
    ["land", i.land ?? ""],
    ["landAnders", i.landAnders ?? ""],
    ["betaalmethode", i.betaalmethode ?? ""],
    ["kortingscode", i.kortingscode ?? ""],
  ]
    .map(([n, v]) => `<input type="hidden" name="${ctx.esc(n)}" value="${ctx.esc(v)}">`)
    .join("");
  const waar = verzendZin(ctx, c);
  const betaal = c.betaalmethode ? `<p><strong>Betalen:</strong> ${ctx.esc(BETAAL_NAAM[c.betaalmethode])}. ${ctx.esc(BETAAL_UITLEG[c.betaalmethode])}</p>` : "";
  return `<section><div class="wrap narrow"><h1>Klopt je bestelling?</h1>${somTabel(ctx, c)}<p>${waar}${vz?.levertijd ? ` <span class="small">(${ctx.esc(vz.levertijd)})</span>` : ""}<br>${ctx.esc(i.naam)} · ${ctx.esc(i.email)} · ${ctx.esc(i.telefoon)}</p>${i.opmerking ? `<p class="small">Opmerking: ${ctx.esc(i.opmerking)}</p>` : ""}${betaal}${ctx.paras(w.betaalTekst)}${ctx.inert ? `<p class="small"><strong>Dit is een voorbeeld:</strong> er wordt niets besteld of verstuurd.</p>` : ""}<form class="contact order" method="post" action="${ctx.esc(ctx.preview ? "#" : `${ctx.root}_zf/bestelling`)}">${verborgen}<label class="hp" aria-hidden="true">Laat leeg<input name="website" tabindex="-1" autocomplete="off"></label><p class="acts-row"><button class="btn" type="submit" name="stap" value="plaats">Bestelling plaatsen</button> <button class="btn ghost" type="submit" name="stap" value="wijzig">Wijzigen</button></p></form></div></section>`;
}

/** Waar de bestelling heen gaat of waar hij klaarligt, in één zin (zonder punt). */
function verzendZin(ctx: WinkelCtx, c: Bestelconcept): string {
  const i = c.invoer;
  const vz = c.verzending;
  if (i.levering === "bezorgen") {
    const land = vz?.land && vz.land !== "Nederland" ? vz.land : "";
    const naam = vz && vz.naam.trim().toLowerCase() !== "bezorgen" ? `${ctx.esc(vz.naam)}: b` : "B";
    return `${naam}ezorgen op ${[i.straat, `${i.postcode} ${i.plaats}`.trim(), land].filter(Boolean).map(ctx.esc).join(", ")}.`;
  }
  const waar = vz ? vz.adres || ctx.bedrijfAdres : "";
  return `Je haalt de bestelling af${waar ? ` bij ${ctx.esc(waar)}` : ""}.`;
}

/** Wat de bedankpagina van een geplaatste bestelling extra toont (lib/sites/serve.ts zoekt hem op). */
export interface BesteldInfo {
  bestelling: BestelOverzicht;
  /** de betaal-QR-code als SVG (lib/sites/betaal-qr.ts), alleen bij overboeking */
  qr: string | null;
}

/** Hoe en wat de klant betaalt; bij overboeking de rekening, het bedrag, het bestelnummer als omschrijving en de QR-code. */
function betaalUitleg(ctx: WinkelCtx, b: BestelOverzicht, nr: string, qr: string | null): string {
  const { esc } = ctx;
  const bedrag = esc(euro(b.totaalCents));
  if (b.betaalmethode === "afhalen") return `<p class="bbetaal"><strong>Betalen:</strong> je betaalt ${bedrag} bij het afhalen.</p>`;
  if (b.betaalmethode === "rembours") return `<p class="bbetaal"><strong>Betalen:</strong> je betaalt ${bedrag} contant aan de bezorger.</p>`;
  if (b.betaalmethode !== "overboeking" || !b.rekening) return "";
  if (b.totaalCents <= 0) return `<p class="bbetaal"><strong>Betalen:</strong> je hoeft niets te betalen.</p>`;
  const rij = (dt: string, dd: string) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`;
  return `<div class="betaal"><h2>Zo betaal je</h2><p>Maak het bedrag over naar de rekening hieronder, met je bestelnummer als omschrijving. Dan weet ${esc(ctx.bedrijfNaam)} dat de betaling bij jouw bestelling hoort.</p><div class="betaal-grid"><dl class="betaal-gegevens">${rij("Bedrag", bedrag)}${rij("IBAN", esc(toonIban(b.rekening.iban)))}${rij("Ten name van", esc(b.rekening.naam))}${rij("Omschrijving", esc(nr))}</dl>${
    qr ? `<figure class="betaal-qr">${qr}<figcaption>Betaal-QR-code</figcaption></figure>` : ""
  }</div>${qr ? `<p class="small">Op een computer: scan de code met de app van je bank, als die betaal-QR-codes kent; dan staan bedrag, rekening en omschrijving er meteen in. Op je telefoon: neem de gegevens over in je bank-app.</p>` : ""}</div>`;
}

export function besteldPaginaBody(ctx: WinkelCtx, w: Winkel, nr: string, voorbeeld = false, info: BesteldInfo | null = null): string {
  if (voorbeeld) {
    return `<section><div class="wrap narrow"><div role="status"><h1>Zo ziet je bevestiging eruit</h1></div><p class="mvoorbeeld"><strong>Dit is een voorbeeld:</strong> er is niets besteld en niets verstuurd. In je eigen webshop komt een bestelling meteen binnen in de Websitestudio, krijg je er een mail van, en zakt de voorraad vanzelf.</p><p><a class="btn" href="${ctx.esc(pad(ctx, "winkel"))}">Verder winkelen</a></p></div></section>`;
  }
  const b = info?.bestelling;
  const overzicht = b ? `${betaalUitleg(ctx, b, nr, info.qr)}<h2 class="bkop">Je bestelling</h2>${somTabel(ctx, b)}` : "";
  return `<section><div class="wrap narrow"><div role="status"><h1>Bedankt voor je bestelling</h1>${nr ? `<p>Je bestelnummer is <strong>${ctx.esc(nr)}</strong>.</p>` : ""}</div>${overzicht}${ctx.paras(w.betaalTekst)}<p>${ctx.esc(ctx.bedrijfNaam)} heeft je bestelling ontvangen en neemt contact met je op als er iets niet klopt.</p><p><a class="btn" href="${ctx.esc(pad(ctx, "winkel"))}">Verder winkelen</a></p></div></section>`;
}

/** De opmaak van de winkel, achter de basisopmaak van de site; premium krijgt de kaarten en prijs van de huisstijl. */
export function winkelCss(premium: boolean): string {
  const basis = `.pgrid{display:grid;gap:24px;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr))}
.pcard{display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;color:var(--ink);text-decoration:none;transition:transform .25s ease,box-shadow .25s ease}.pcard:hover{transform:translateY(-3px);box-shadow:0 18px 40px rgba(0,0,0,.1)}
.pimg{display:block;aspect-ratio:1;background:var(--soft);overflow:hidden}.pimg img{width:100%;height:100%;object-fit:cover;transition:transform .6s ease}.pcard:hover .pimg img{transform:scale(1.04)}.ph{display:grid;place-items:center;height:100%;min-height:160px;font-size:2.6rem;font-weight:700;color:var(--mute)}
.pbody{display:flex;flex:1;flex-direction:column;gap:4px;padding:18px 20px 22px}.pcat{margin:0;font-size:.74rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}.pcard h3{margin:0;font-size:1.08rem;color:var(--ink)}.pkort{color:var(--mute);font-size:.95rem;line-height:1.5}
.pprice{margin:0;margin-top:auto;padding-top:8px;font-weight:700;font-size:1.1rem;color:var(--k)}.pprice s{color:var(--mute);font-weight:400;font-size:.92em;margin-right:4px}.pprice.big{font-size:1.7rem;margin:0 0 14px;padding:0}
.psold{display:inline-block;margin:6px 0 0;font-size:.82rem;font-weight:700;color:#9b1c1c}.psold.big{font-size:1rem;margin:0 0 12px}.pmore{margin:32px 0 0}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 32px;padding:0;list-style:none}.chips a{display:block;padding:9px 18px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);font-weight:600;font-size:.92rem;text-decoration:none}.chips a:hover{border-color:var(--k)}
.pcatgroup{margin:0 0 56px;scroll-margin-top:96px}.pcatgroup h2{margin-bottom:20px}
.crumbs{margin:0 0 24px;font-size:.92rem;color:var(--mute)}.crumbs a{color:inherit;text-decoration:underline;text-underline-offset:3px}
@media (max-width:640px){.pgrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.pbody{padding:12px 12px 16px}.pkort{display:none}.pcard h3{font-size:.98rem}.pprice{font-size:1rem}.pcat{font-size:.68rem;letter-spacing:.1em}}
form.order{max-width:none}.ocols{display:grid;grid-template-columns:minmax(0,1fr);gap:20px}.ocols>*,.oside{min-width:0}.oside{display:grid;gap:14px}form.order fieldset{min-width:0}.keuze select{max-width:100%;min-width:0}.orow input{flex-shrink:0}@media (min-width:900px){.ocols{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);align-items:start}.oside{position:sticky;top:100px}}
.product{display:grid;gap:40px;align-items:start}@media (min-width:900px){.product{grid-template-columns:1.1fr 1fr;gap:64px}.pinfo{position:sticky;top:100px}}
.pgal{display:grid;gap:12px;grid-template-columns:repeat(4,1fr)}.pgal img,.pgal .pimg{border-radius:var(--r);width:100%;aspect-ratio:1;object-fit:cover}.pgal>:first-child{grid-column:1/-1}
.pinfo h1{font-size:clamp(2rem,4vw,3.2rem);margin-bottom:12px}.lead{font-size:1.15rem;color:var(--mute)}.pdesc{margin-top:28px;border-top:1px solid var(--line);padding-top:24px}
form.buy{display:grid;gap:14px;margin:8px 0 6px;max-width:460px}.buy-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px}form.buy label{font-weight:600}form.buy input{width:88px;font:inherit;padding:12px 14px;border:1px solid #cfd4da;border-radius:10px}
.keuze{display:grid;gap:6px;font-weight:600}.keuze select{font:inherit;font-weight:400;padding:12px 14px;border:1px solid #cfd4da;border-radius:10px;background:#fff;color:var(--ink)}.pstock{margin:0 0 10px;font-weight:700;color:#8a4b00}
.omain{display:grid;gap:8px;flex:1;min-width:0}.okeuzes{display:flex;flex-wrap:wrap;gap:8px}.okeuzes .keuze{flex:1 1 140px;font-size:.9rem;font-weight:500}.okeuzes .keuze select{padding:8px 10px}.ostock{color:#8a4b00;font-size:.85rem;font-weight:600}
.feat .pimg{border-radius:var(--r);aspect-ratio:4/3}.feat .pimg img{transition:none}
form.order fieldset{border:1px solid var(--line);border-radius:var(--r);padding:18px 20px 22px;margin:0;display:grid;gap:14px;background:#fff}form.order legend{float:left;width:100%;padding:0;margin:0;font-weight:700;font-size:1.08rem;line-height:1.3}form.order h2.ocat{margin:14px 0 0;font-size:.78rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}
.pdesc-kop{margin:0 0 12px;font-size:.78rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}.feat-label{margin:0 0 14px}
.olist{list-style:none;margin:0;padding:0;display:grid;gap:0}.orow{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--line)}.orow:last-child{border-bottom:0}.orow label{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;font-weight:600}.oprice{color:var(--mute);font-weight:400}.orow input{width:84px}.orow.sold{opacity:.75}
form.order .radio{display:flex;align-items:center;gap:10px;font-weight:600}form.order .radio input{width:auto}
.alert{background:#fdeeee;border:1px solid #f1b8b8;color:#7a1414;border-radius:12px;padding:14px 18px;margin:0 0 24px}.alert p,.alert ul{margin:0}.alert ul{padding-left:20px}
table.sum{width:100%;border-collapse:collapse;margin:0 0 20px}table.sum td,table.sum th{padding:12px 0;border-bottom:1px solid var(--line);text-align:left}table.sum td+td{text-align:right}table.sum tfoot th,table.sum tfoot td{font-weight:700;font-size:1.15rem;border-bottom:0}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}.acts-row{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 0}
@media (prefers-reduced-motion:reduce){.pcard,.pimg img{transition:none}.pcard:hover{transform:none}.pcard:hover .pimg img{transform:none}}
.acts{display:flex;align-items:center;gap:8px}.btn.mknop,form.order .btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--line);box-shadow:none}.btn.mknop:hover,form.order .btn.ghost:hover{border-color:var(--ink)}.whead{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}.whead h1{margin:0}.chips a[aria-current]{background:var(--k);border-color:var(--k);color:var(--k-t)}
.wlayout{display:grid;gap:24px;grid-template-columns:minmax(0,1fr)}@media (min-width:960px){.wlayout{grid-template-columns:260px minmax(0,1fr);gap:40px;align-items:start}.wf{position:sticky;top:100px}}.wresult{min-width:0}
.wf-toggle{position:absolute;opacity:0;width:1px;height:1px}.wf-knop{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border:1px solid var(--line);border-radius:999px;background:#fff;font-weight:700;cursor:pointer}.wf-knop::before{content:"";width:16px;height:12px;background:linear-gradient(currentColor,currentColor) 0 0/100% 2px no-repeat,linear-gradient(currentColor,currentColor) 3px 5px/10px 2px no-repeat,linear-gradient(currentColor,currentColor) 6px 10px/4px 2px no-repeat}.wf-toggle:focus-visible+.wf-knop{outline:3px solid var(--a);outline-offset:3px}
.wf-paneel{display:none;margin-top:12px}.wf-toggle:checked~.wf-paneel{display:block}@media (min-width:960px){.wf-knop{display:none}.wf-paneel{display:block;margin:0}}
form.wfilter{display:grid;gap:14px;padding:20px;border:1px solid var(--line);border-radius:var(--r);background:#fff}form.wfilter label{display:grid;gap:6px;font-weight:600;font-size:.92rem}form.wfilter input,form.wfilter select{width:100%;min-width:0;font:inherit;font-weight:400;padding:10px 12px;border:1px solid #cfd4da;border-radius:10px;background:#fff;color:var(--ink)}
.wprijs{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:end;gap:8px;margin:0;padding:0;border:0;min-width:0}.wprijs legend{padding:0;margin:0 0 6px;font-weight:600;font-size:.92rem}.wprijs>span{padding-bottom:10px}
form.wfilter label.wcheck{display:flex;align-items:center;gap:10px;font-weight:500}form.wfilter .wcheck input{width:18px;height:18px;padding:0;accent-color:var(--k)}.wknoppen{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:4px 0 0}.wknoppen .btn{padding:11px 20px}
.wbalk{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin:0 0 20px}.wtel{margin:0;font-weight:700}.wactief{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}.wactief a{display:block;padding:6px 12px;border-radius:999px;background:var(--soft);color:var(--ink);font-size:.88rem;font-weight:600;text-decoration:none}.wactief a:hover{text-decoration:line-through}
.wleeg{padding:32px;border:1px dashed var(--line);border-radius:var(--r);text-align:center}
.mmelding{padding:12px 16px;border-radius:12px;background:#dcfce7;color:#14532d;font-weight:600}.mleeg{padding:32px;border:1px dashed var(--line);border-radius:var(--r);text-align:center}.mvoorbeeld{padding:14px 18px;border-radius:12px;background:#fff7e0;border:1px solid #f0d58a}
.mgrid{display:grid;gap:28px;grid-template-columns:minmax(0,1fr)}@media (min-width:900px){.mgrid{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);align-items:start}.msom{position:sticky;top:100px}}
.mlijst{display:grid;gap:0;margin:0;padding:0;list-style:none;border-top:1px solid var(--line)}.mregel{display:grid;grid-template-columns:84px minmax(0,1fr) auto;gap:16px;padding:18px 0;border-bottom:1px solid var(--line)}.mfoto .pimg,.mfoto img,.mfoto .ph{width:84px;height:84px;min-height:0;border-radius:12px;object-fit:cover;font-size:1.6rem;background:var(--soft)}
.minfo h2{margin:0 0 2px;font-size:1.08rem}.minfo h2 a{color:var(--ink);text-decoration:none}.mvar,.mstuk{margin:0;color:var(--mute);font-size:.92rem}.mfout{margin:6px 0 0;color:#9b1c1c;font-weight:700;font-size:.9rem}.mtotaal{margin:0;font-weight:700;white-space:nowrap}
.macties{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-top:10px}.macties form{display:flex;align-items:center;gap:8px;margin:0}.macties label{font-size:.88rem;font-weight:600}.macties input{width:72px;font:inherit;padding:8px 10px;border:1px solid #cfd4da;border-radius:10px}.macties .btn{padding:8px 14px;font-size:.88rem}
.mweg{padding:0;border:0;background:none;color:var(--mute);font:inherit;font-size:.88rem;text-decoration:underline;text-underline-offset:3px;cursor:pointer}.mweg:hover{color:#9b1c1c}
@media (max-width:520px){.mregel{grid-template-columns:64px minmax(0,1fr)}.mfoto .pimg,.mfoto img,.mfoto .ph{width:64px;height:64px}.mtotaal{grid-column:2}}
.msom{padding:22px;border:1px solid var(--line);border-radius:var(--r);background:#fff}.msom h2{margin:0 0 12px;font-size:1.2rem}.msom dl{margin:0}.msom dl div{display:flex;justify-content:space-between;gap:12px;font-weight:700;font-size:1.1rem}.msom dd{margin:0}.mafreken{display:block;text-align:center}.mverder{margin:0;text-align:center}
.mkort .orow{gap:12px}.mkort .orow>span:last-of-type{font-weight:700;white-space:nowrap}
.pbtw{font-size:.78em;font-weight:500;color:var(--mute)}.vkeuzes{display:grid;gap:10px}form.order label.vkeuze{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:2px 12px;align-items:start;padding:13px 16px;border:1px solid var(--line);border-radius:12px;background:#fff;font-weight:400;cursor:pointer}form.order .vkeuze input{width:auto;margin:4px 0 0;padding:0;accent-color:var(--k)}.vkeuze .vnaam{font-weight:700;min-width:0;overflow-wrap:anywhere}.vkeuze .vprijs{font-weight:600;text-align:right}.vkeuze small{grid-column:2/-1;color:var(--mute);font-size:.88rem;line-height:1.45}.vkeuze:has(input:checked){border-color:var(--k);box-shadow:0 0 0 1px var(--k)}.vkeuze:has(input:focus-visible){outline:3px solid var(--a);outline-offset:2px}@media (max-width:440px){form.order label.vkeuze{grid-template-columns:auto minmax(0,1fr)}.vkeuze .vprijs{grid-column:2;text-align:left}}
form.order .osel{width:100%;min-width:0;font:inherit;font-weight:400;padding:12px 14px;border:1px solid #cfd4da;border-radius:10px;background:#fff;color:var(--ink)}
table.sum tfoot tr.sklein td,table.sum tfoot tr.snoot td{font-weight:400;font-size:.92rem;color:var(--mute);padding:4px 0}table.sum tfoot tr+tr.sklein td,table.sum tfoot tr.snoot td{border-bottom:0}
.betaal{margin:8px 0 28px;padding:22px;border:1px solid var(--line);border-radius:var(--r);background:#fff}.betaal h2{margin:0 0 8px;font-size:1.3rem}.betaal-grid{display:flex;flex-wrap:wrap;align-items:flex-start;gap:20px 28px;margin:16px 0}.betaal-gegevens{flex:1 1 240px;display:grid;gap:10px;margin:0;min-width:0}.betaal-gegevens div{display:grid;gap:2px}.betaal-gegevens dt{font-size:.82rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}.betaal-gegevens dd{margin:0;font-size:1.12rem;font-weight:700;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.betaal-qr{margin:0;display:grid;justify-items:center;gap:6px}.betaal-qr svg{width:200px;height:200px;max-width:100%;border:1px solid var(--line);border-radius:12px}.betaal-qr figcaption{font-size:.85rem;color:var(--mute)}.bbetaal{padding:14px 18px;border-radius:12px;background:var(--soft)}.bkop{margin:24px 0 8px;font-size:1.2rem}
.mandlink{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;color:inherit;font-weight:700;font-size:.92rem;text-decoration:none}.mandlink svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round}.mandlink b{display:grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--a);color:var(--a-t);font-size:.78rem}.mandlink:hover{background:rgba(127,127,127,.12)}@media (max-width:480px){.mandlink .mtekst{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.mandlink{padding:8px 6px}}@media (max-width:400px){.acts:has(.mandlink) .cta-top{display:none}}@media (max-width:640px){.pcard h3{overflow-wrap:anywhere;hyphens:auto}}`;
  const prem = `.pcard{border:0;border-radius:28px;box-shadow:0 1px 2px rgba(10,18,14,.05),0 14px 34px rgba(10,18,14,.08)}.pcard:hover{box-shadow:0 2px 4px rgba(10,18,14,.06),0 24px 48px rgba(10,18,14,.14)}.pbody{padding:22px 26px 28px}@media (max-width:640px){.pcard{border-radius:18px}.pbody{padding:12px 12px 16px}}
.pprice{color:var(--a-d)}.pgal img,.pgal .pimg,.feat .pimg{border-radius:28px}.chips a{border-color:rgba(10,18,14,.14)}.chips a:hover{border-color:var(--a-d)}
form.order fieldset{border:0;border-radius:24px;padding:24px 26px 28px;box-shadow:0 1px 2px rgba(10,18,14,.05),0 14px 34px rgba(10,18,14,.08)}.btn.ghost{color:var(--night);border-color:rgba(10,18,14,.2)}
.betaal{border:0;border-radius:24px;box-shadow:0 1px 2px rgba(10,18,14,.05),0 14px 34px rgba(10,18,14,.08)}form.order label.vkeuze{border-color:rgba(10,18,14,.14)}
form.wfilter,.msom{border:0;border-radius:24px;box-shadow:0 1px 2px rgba(10,18,14,.05),0 14px 34px rgba(10,18,14,.08)}.chips a[aria-current]{background:var(--night);border-color:var(--night);color:var(--cream)}form.wfilter .wcheck input{accent-color:var(--night)}.wf-toggle:focus-visible+.wf-knop{outline-color:var(--a-d)}.wf-knop{border-color:rgba(10,18,14,.14)}
.mandlink{color:var(--cream)}.mandlink b{background:var(--sun);color:var(--night)}.mandlink:hover{background:rgba(255,255,255,.1)}header .mandlink:focus-visible{outline-color:var(--sun)}`;
  return premium ? `${basis}\n${prem}` : basis;
}
