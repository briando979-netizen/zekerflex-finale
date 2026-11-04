import { ldJson } from "@/lib/seo/json-ld";
import type { BlockProps, SiteProduct, Winkel } from "@/lib/sites/types";
import { categorieen, euro, isUitverkocht, maxBestelbaar, zichtbareProducten, type BestelInvoer, type Bestelconcept } from "@/lib/sites/winkel";

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
  return `${oud}${ctx.esc(euro(p.prijsCents))}`;
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
function productLd(p: SiteProduct, url: string, beeld: string | null, verkoper: string): string {
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

export function productPaginaBody(ctx: WinkelCtx, w: Winkel, p: SiteProduct, meta: { url: string; beeld: string | null; seo: boolean }): string {
  const fotos = p.fotos.map((f, i) => ctx.img(f, i === 0 ? "(min-width: 900px) 55vw, 100vw" : "(min-width: 900px) 14vw, 25vw", i === 0)).filter(Boolean);
  const galerij = fotos.length ? `<div class="pgal">${fotos.join("")}</div>` : `<div class="pgal"><span class="pimg">${foto(ctx, p, "100vw")}</span></div>`;
  // een div met de rol van nav: de menu-opmaak van de site (nav a als blok, licht in premium) hoort hier niet
  const kruimel = `<div class="crumbs" role="navigation" aria-label="Kruimelpad"><a href="${ctx.esc(pad(ctx, "winkel"))}">Winkel</a>${p.categorie ? ` <span aria-hidden="true">›</span> <a href="${ctx.esc(pad(ctx, `winkel#${ankerVan(p.categorie)}`))}">${ctx.esc(p.categorie)}</a>` : ""}</div>`;
  const uit = ctx.inert ? " disabled" : "";
  const weinig = p.voorraad != null && p.voorraad > 0 && p.voorraad <= 5 ? `<p class="pstock">Nog ${p.voorraad} op voorraad</p>` : "";
  const bestel = isUitverkocht(p)
    ? `<p class="psold big">Uitverkocht</p><p><a class="btn" href="${ctx.esc(ctx.href("contact"))}">Vraag wanneer het er weer is</a></p>`
    : w.bestellen
      ? `${weinig}<form class="buy" method="get" action="${ctx.esc(pad(ctx, "bestellen"))}"><input type="hidden" name="p" value="${ctx.esc(p.id)}">${keuzeVelden(ctx, p, (i) => `o${i}`, [], uit)}<span class="buy-row"><label for="aantal">Aantal</label><input id="aantal" name="aantal" type="number" inputmode="numeric" min="1" max="${maxBestelbaar(p)}" value="1"${uit}><button class="btn" type="submit"${uit}>Bestellen</button></span></form>${ctx.inert ? `<p class="small">Dit is een voorbeeld: bestellen kan hier niet.</p>` : ""}`
      : `${weinig}<p><a class="btn" href="${ctx.esc(ctx.href("contact"))}">Neem contact op om te bestellen</a></p>`;
  return `<section><div class="wrap">${kruimel}<div class="product"><div>${galerij}</div><div class="pinfo">${p.categorie ? `<p class="pcat">${ctx.esc(p.categorie)}</p>` : ""}<h1>${ctx.esc(p.naam)}</h1><p class="pprice big">${prijs(ctx, p)}</p>${p.korteTekst ? `<p class="lead">${ctx.esc(p.korteTekst)}</p>` : ""}${bestel}<div class="pdesc"><h2 class="pdesc-kop">Over dit product</h2>${ctx.paras(p.omschrijving)}</div></div></div></div></section>${meta.seo ? productLd(p, meta.url, meta.beeld, ctx.bedrijfNaam) : ""}`;
}

export function winkelPaginaBody(ctx: WinkelCtx, w: Winkel): string {
  const producten = zichtbareProducten(w);
  if (!producten.length) return `<section><div class="wrap narrow"><h1>Winkel</h1><p>Er staan nog geen producten in de winkel. Kijk later nog eens.</p></div></section>`;
  const cats = categorieen(producten);
  const zonder = producten.filter((p) => !p.categorie);
  const chips = cats.length > 1 ? `<ul class="chips" role="list">${cats.map((c) => `<li><a href="#${ankerVan(c)}">${ctx.esc(c)}</a></li>`).join("")}</ul>` : "";
  const groep = (titel: string, lijst: SiteProduct[], id: string) => `<div class="pcatgroup" id="${id}">${titel ? `<h2>${ctx.esc(titel)}</h2>` : ""}<div class="pgrid">${lijst.map((p) => productKaart(ctx, p)).join("")}</div></div>`;
  const groepen = [...cats.map((c) => groep(c, producten.filter((p) => p.categorie === c), ankerVan(c))), zonder.length ? groep(cats.length ? "Overig" : "", zonder, "cat-overig") : ""].join("");
  const knop = w.bestellen ? `<p><a class="btn" href="${ctx.esc(pad(ctx, "bestellen"))}">Bestellen</a></p>` : "";
  return `<section><div class="wrap"><h1>Winkel</h1>${knop}${chips}${groepen}</div></section>`;
}

const veld = (ctx: WinkelCtx, naam: string, label: string, waarde: string, extra = "") =>
  `<label>${ctx.esc(label)}<input name="${naam}" value="${ctx.esc(waarde)}"${extra}${ctx.inert ? " disabled" : ""}></label>`;

/** Het bestelformulier; met `invoer` en `fouten` opnieuw getoond na een controle. */
export function bestelPaginaBody(ctx: WinkelCtx, w: Winkel, opts: { invoer?: BestelInvoer | undefined; fouten?: string[] | undefined } = {}): string {
  if (!w.bestellen) return `<section><div class="wrap narrow"><h1>Bestellen</h1><p>Online bestellen staat op deze website uit. <a href="${ctx.esc(ctx.href("contact"))}">Neem contact op</a> om te bestellen.</p></div></section>`;
  const v = opts.invoer;
  const uit = ctx.inert ? " disabled" : "";
  const producten = zichtbareProducten(w);
  const cats = categorieen(producten);
  const rij = (p: SiteProduct) => {
    const n = v?.aantallen[p.id] ?? 0;
    const id = `n_${p.id}`;
    const op = isUitverkocht(p);
    const weinig = !op && p.voorraad != null && p.voorraad <= 5 ? ` <span class="ostock">nog ${p.voorraad}</span>` : "";
    const keuzes = p.opties?.length && !op ? `<span class="okeuzes">${keuzeVelden(ctx, p, (i) => `k_${p.id}_${i}`, v?.keuzes[p.id] ?? [], uit)}</span>` : "";
    return `<li class="orow${op ? " sold" : ""}"><span class="omain"><label for="${id}"><span class="oname">${ctx.esc(p.naam)}</span>${op ? ` <span class="psold">Uitverkocht</span>` : ""}<span class="oprice">${prijs(ctx, p)}</span>${weinig}</label>${keuzes}</span><input id="${id}" name="${id}" type="number" inputmode="numeric" min="0" max="${maxBestelbaar(p)}" value="${n}"${op ? " disabled" : uit}></li>`;
  };
  const lijst = cats.length
    ? [...cats.map((c) => `<h2 class="ocat">${ctx.esc(c)}</h2><ul class="olist" role="list">${producten.filter((p) => p.categorie === c).map(rij).join("")}</ul>`), producten.some((p) => !p.categorie) ? `<h2 class="ocat">Overig</h2><ul class="olist" role="list">${producten.filter((p) => !p.categorie).map(rij).join("")}</ul>` : ""].join("")
    : `<ul class="olist" role="list">${producten.map(rij).join("")}</ul>`;
  const l = w.levering;
  const bezorgUitleg = l.bezorgen
    ? ` (${l.bezorgkostenCents ? `${euro(l.bezorgkostenCents)} bezorgkosten` : "gratis"}${l.gratisVanafCents != null && l.bezorgkostenCents ? `, gratis vanaf ${euro(l.gratisVanafCents)}` : ""})`
    : "";
  const levering =
    l.afhalen && l.bezorgen
      ? `<fieldset><legend>Afhalen of bezorgen</legend><label class="radio"><input type="radio" name="levering" value="afhalen"${v?.levering !== "bezorgen" ? " checked" : ""}${uit}> Ik haal het af</label><label class="radio"><input type="radio" name="levering" value="bezorgen"${v?.levering === "bezorgen" ? " checked" : ""}${uit}> Bezorgen${ctx.esc(bezorgUitleg)}</label></fieldset>`
      : `<input type="hidden" name="levering" value="${l.bezorgen ? "bezorgen" : "afhalen"}"><p class="small">${l.bezorgen ? `We bezorgen je bestelling${ctx.esc(bezorgUitleg)}.` : "Je haalt je bestelling bij ons af."}</p>`;
  const adres = l.bezorgen
    ? `<fieldset><legend>Bezorgadres${l.afhalen ? " (alleen bij bezorgen)" : ""}</legend>${veld(ctx, "straat", "Straat en huisnummer", v?.straat ?? "", ' maxlength="120" autocomplete="street-address"')}${veld(ctx, "postcode", "Postcode", v?.postcode ?? "", ' maxlength="10" autocomplete="postal-code"')}${veld(ctx, "plaats", "Plaats", v?.plaats ?? "", ' maxlength="80" autocomplete="address-level2"')}</fieldset>`
    : "";
  const fouten = opts.fouten?.length ? `<div class="alert" role="alert"><p><strong>Nog even kijken:</strong></p><ul>${opts.fouten.map((f) => `<li>${ctx.esc(f)}</li>`).join("")}</ul></div>` : "";
  const note = ctx.inert ? `<p class="small"><strong>Dit is een voorbeeld:</strong> bestellen kan hier niet.</p>` : `<p class="small">We gebruiken je gegevens alleen voor je bestelling. Lees de <a href="${ctx.esc(ctx.href("privacy"))}">privacyverklaring</a>.</p>`;
  // op de computer: links de producten, rechts (meeschuivend) levering, gegevens en de knop
  return `<section><div class="wrap"><h1>Bestellen</h1>${fouten}<form class="contact order" method="post" action="${ctx.esc(ctx.preview || ctx.inert ? "#" : `${ctx.root}_zf/bestelling`)}"><input type="hidden" name="stap" value="controle"><div class="ocols"><div><fieldset><legend>Wat wil je bestellen?</legend>${lijst}</fieldset></div><div class="oside">${levering}<fieldset><legend>Je gegevens</legend>${veld(ctx, "naam", "Naam", v?.naam ?? "", ' required maxlength="100" autocomplete="name"')}${veld(ctx, "email", "E-mailadres", v?.email ?? "", ' type="email" required maxlength="200" autocomplete="email"')}${veld(ctx, "telefoon", "Telefoon", v?.telefoon ?? "", ' type="tel" required maxlength="30" autocomplete="tel"')}</fieldset>${adres}<label>Opmerking (mag leeg)<textarea name="opmerking" maxlength="1000"${uit}>${ctx.esc(v?.opmerking ?? "")}</textarea></label><label class="hp" aria-hidden="true">Laat leeg<input name="website" tabindex="-1" autocomplete="off"></label>${note}<p style="margin:0"><button class="btn" type="submit"${uit}>Bekijk je bestelling</button></p></div></div></form></div></section>`;
}

/** Stap 2: het overzicht met totaal; dezelfde gegevens gaan verborgen mee naar "plaatsen" of terug naar "wijzigen". */
export function controlePaginaBody(ctx: WinkelCtx, w: Winkel, c: Bestelconcept): string {
  const i = c.invoer;
  const verborgen = [
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
  ]
    .map(([n, v]) => `<input type="hidden" name="${ctx.esc(n)}" value="${ctx.esc(v)}">`)
    .join("");
  const regels = c.regels.map((r) => `<tr><td>${r.aantal} × ${ctx.esc(r.naam)}</td><td>${ctx.esc(euro(r.totaalCents))}</td></tr>`).join("");
  const kosten = i.levering === "bezorgen" ? `<tr><td>Bezorgkosten</td><td>${c.bezorgkostenCents ? ctx.esc(euro(c.bezorgkostenCents)) : "gratis"}</td></tr>` : "";
  const waar = i.levering === "bezorgen" ? `Bezorgen op ${[i.straat, `${i.postcode} ${i.plaats}`.trim()].map(ctx.esc).join(", ")}` : "Je haalt de bestelling af";
  return `<section><div class="wrap narrow"><h1>Klopt je bestelling?</h1><table class="sum"><tbody>${regels}${kosten}</tbody><tfoot><tr><th scope="row">Totaal</th><td>${ctx.esc(euro(c.totaalCents))}</td></tr></tfoot></table><p>${waar}.<br>${ctx.esc(i.naam)} · ${ctx.esc(i.email)} · ${ctx.esc(i.telefoon)}</p>${i.opmerking ? `<p class="small">Opmerking: ${ctx.esc(i.opmerking)}</p>` : ""}${ctx.paras(w.betaalTekst)}<form class="contact order" method="post" action="${ctx.esc(ctx.preview || ctx.inert ? "#" : `${ctx.root}_zf/bestelling`)}">${verborgen}<label class="hp" aria-hidden="true">Laat leeg<input name="website" tabindex="-1" autocomplete="off"></label><p class="acts-row"><button class="btn" type="submit" name="stap" value="plaats">Bestelling plaatsen</button> <button class="btn ghost" type="submit" name="stap" value="wijzig">Wijzigen</button></p></form></div></section>`;
}

export function besteldPaginaBody(ctx: WinkelCtx, w: Winkel, nr: string): string {
  return `<section><div class="wrap narrow"><div role="status"><h1>Bedankt voor je bestelling</h1>${nr ? `<p>Je bestelnummer is <strong>${ctx.esc(nr)}</strong>.</p>` : ""}</div>${ctx.paras(w.betaalTekst)}<p>${ctx.esc(ctx.bedrijfNaam)} heeft je bestelling ontvangen en neemt contact met je op als er iets niet klopt.</p><p><a class="btn" href="${ctx.esc(pad(ctx, "winkel"))}">Verder winkelen</a></p></div></section>`;
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
@media (prefers-reduced-motion:reduce){.pcard,.pimg img{transition:none}.pcard:hover{transform:none}.pcard:hover .pimg img{transform:none}}`;
  const prem = `.pcard{border:0;border-radius:28px;box-shadow:0 1px 2px rgba(10,18,14,.05),0 14px 34px rgba(10,18,14,.08)}.pcard:hover{box-shadow:0 2px 4px rgba(10,18,14,.06),0 24px 48px rgba(10,18,14,.14)}.pbody{padding:22px 26px 28px}@media (max-width:640px){.pcard{border-radius:18px}.pbody{padding:12px 12px 16px}}
.pprice{color:var(--a-d)}.pgal img,.pgal .pimg,.feat .pimg{border-radius:28px}.chips a{border-color:rgba(10,18,14,.14)}.chips a:hover{border-color:var(--a-d)}
form.order fieldset{border:0;border-radius:24px;padding:24px 26px 28px;box-shadow:0 1px 2px rgba(10,18,14,.05),0 14px 34px rgba(10,18,14,.08)}.btn.ghost{color:var(--night);border-color:rgba(10,18,14,.2)}`;
  return premium ? `${basis}\n${prem}` : basis;
}
