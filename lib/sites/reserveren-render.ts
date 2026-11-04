import { datumTekst, laatsteDag, personenTekst, reserveerUren, type Nu, type ReserveerBlok, type ReserveerInvoer } from "@/lib/sites/reserveren";

// ---------------------------------------------------------------------------
// Tafel reserveren op een klantsite als HTML (lib/sites/reserveren.ts): het blok
// met dag en personen, de pagina …/reserveren met de vrije tijden en de
// gegevens, en …/gereserveerd. Zonder scripts: de tijden zijn keuzerondjes die
// eruitzien als knoppen; alles gaat met gewone formulieren.
// ---------------------------------------------------------------------------

/** Wat de weergave van render.ts meekrijgt (geen import terug: render.ts gebruikt dit bestand). */
export interface ReserveerCtx {
  root: string;
  preview: boolean;
  /** voorbeeld of ontwerpvoorstel: alles werkt, maar er wordt niets bewaard of verstuurd */
  inert: boolean;
  bedrijf: { naam: string; telefoon: string; email: string; straat: string; postcode: string; plaats: string };
  esc: (s: unknown) => string;
  paras: (t: string) => string;
  /** een veilige link naar een eigen pagina ("contact") of extern adres */
  href: (raw: string) => string;
}

const pad = (ctx: ReserveerCtx, p: string) => (ctx.preview ? "#" : `${ctx.root}${p}`);

/** Wat de pagina …/reserveren toont. */
export interface ReserveerStaat {
  invoer: Partial<ReserveerInvoer>;
  /** de tijden van de gekozen dag; null = nog geen dag gekozen */
  tijden: { tijd: string; vrij: boolean }[] | null;
  fouten: string[];
  /** als de gekozen dag vol of dicht is: de eerstvolgende dagen met plek */
  suggesties: string[];
  nu: Nu;
}

function bellen(ctx: ReserveerCtx, hoofdletter = false): string {
  const c = ctx.bedrijf;
  if (c.telefoon) return `${hoofdletter ? "Bel" : "bel"} <a href="${ctx.esc(ctx.href(`tel:${c.telefoon.replace(/[^\d+]/g, "")}`))}">${ctx.esc(c.telefoon)}</a>`;
  return `<a href="${ctx.esc(ctx.href("contact"))}">${hoofdletter ? "Neem" : "neem"} contact op</a>`;
}

/** Het eerste formulier: dag en personen (GET naar …/reserveren, ook op een voorbeeld). */
function dagForm(ctx: ReserveerCtx, b: ReserveerBlok, nu: Nu, gekozen: Partial<ReserveerInvoer>, knop: string, id: string): string {
  const personen = gekozen.personen && gekozen.personen <= b.maxGroep ? gekozen.personen : Math.min(2, b.maxGroep);
  const opties = Array.from({ length: b.maxGroep }, (_, i) => i + 1)
    .map((n) => `<option value="${n}"${n === personen ? " selected" : ""}>${personenTekst(n)}</option>`)
    .join("");
  const datum = gekozen.datum && gekozen.datum >= nu.datum ? gekozen.datum : nu.datum;
  return `<form class="rsv" method="get" action="${ctx.esc(pad(ctx, "reserveren"))}"><div class="rsv-rij"><label for="${id}-d">Dag<input id="${id}-d" type="date" name="datum" required min="${nu.datum}" max="${laatsteDag(b, nu.datum)}" value="${ctx.esc(datum)}"></label><label for="${id}-p">Met hoeveel<select id="${id}-p" name="personen">${opties}</select></label></div><p class="rsv-knop"><button class="btn" type="submit">${ctx.esc(knop)}</button></p><p class="small">Met meer dan ${personenTekst(b.maxGroep)}? ${bellen(ctx, true)}, dan regelen we het samen.</p></form>`;
}

/** De donkere kaart met wanneer je kunt reserveren, en het adres. */
function urenKaart(ctx: ReserveerCtx, b: ReserveerBlok): string {
  const c = ctx.bedrijf;
  const adres = [c.straat, [c.postcode, c.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return `<div class="rsv-kaart"><p class="rsv-kaart-kop">Reserveren kan</p><dl>${reserveerUren(b)
    .map((r) => `<div><dt>${ctx.esc(r.dag)}</dt><dd>${ctx.esc(r.tijd)}</dd></div>`)
    .join("")}</dl><p class="rsv-kaart-voet">Een tafel is ${b.verblijfMinuten % 60 === 0 ? `${b.verblijfMinuten / 60} uur` : `${b.verblijfMinuten} minuten`} voor je gereserveerd.${adres ? `<br>${ctx.esc(adres)}` : ""}</p></div>`;
}

/** Het blok op een pagina: kop, tekst, dag en personen, en de kaart met de tijden. */
export function reserveerBlokHtml(ctx: ReserveerCtx, b: ReserveerBlok, alt: string, nu: Nu, kicker = ""): string {
  return `<section${alt} id="reserveren"><div class="wrap rsv-grid"><div>${kicker}<h2>${ctx.esc(b.kop)}</h2>${b.tekst ? ctx.paras(b.tekst) : ""}${dagForm(ctx, b, nu, {}, "Bekijk vrije tijden", "rb")}</div>${urenKaart(ctx, b)}</div></section>`;
}

const veld = (ctx: ReserveerCtx, naam: string, label: string, waarde: string, extra: string) =>
  `<label for="r-${naam}">${ctx.esc(label)}<input id="r-${naam}" name="${naam}" value="${ctx.esc(waarde)}"${extra}></label>`;

/** De pagina …/reserveren: dag en personen, dan de tijden en je gegevens. `h1`: de kop staat in de body (niet in een paginakop). */
export function reserveerPaginaBody(ctx: ReserveerCtx, b: ReserveerBlok, s: ReserveerStaat, h1: boolean): string {
  const v = s.invoer;
  const fouten = s.fouten.length ? `<div class="alert" role="alert"><p><strong>Nog even kijken:</strong></p><ul>${s.fouten.map((f) => `<li>${ctx.esc(f)}</li>`).join("")}</ul></div>` : "";
  const kop = h1 ? `<h1>${ctx.esc(b.kop)}</h1>${b.tekst ? ctx.paras(b.tekst) : ""}` : "";
  const stap1 = `<h2 class="rsv-stap"><span aria-hidden="true">1</span> Dag en personen</h2>${dagForm(ctx, b, s.nu, v, s.tijden ? "Andere dag of aantal" : "Bekijk vrije tijden", "rp")}`;
  let stap2 = "";
  if (s.tijden && v.datum && v.personen) {
    const wanneer = `${datumTekst(v.datum)}, ${personenTekst(v.personen)}`;
    const vrij = s.tijden.filter((t) => t.vrij);
    const knoppen = s.tijden
      .map((t) => `<label class="slot${t.vrij ? "" : " vol"}"><input type="radio" name="tijd" value="${t.tijd}"${v.tijd === t.tijd && t.vrij ? " checked" : ""}${t.vrij ? " required" : " disabled"}><span>${t.tijd}${t.vrij ? "" : `<small> vol</small>`}</span></label>`)
      .join("");
    const geen = s.tijden.length
      ? `<p>Op ${ctx.esc(datumTekst(v.datum))} is er voor ${ctx.esc(personenTekst(v.personen))} niets meer vrij.</p>`
      : `<p>Op ${ctx.esc(datumTekst(v.datum))} kun je niet online reserveren: we zijn dan gesloten, of het is te kort dag.</p>`;
    const sug = s.suggesties.length
      ? `<p class="rsv-sug-kop">Wel plek op:</p><ul class="rsv-sug" role="list">${s.suggesties.map((d) => `<li><a href="${ctx.esc(`${pad(ctx, "reserveren")}${ctx.preview ? "" : `?datum=${d}&personen=${v.personen}`}`)}">${ctx.esc(datumTekst(d))}</a></li>`).join("")}</ul>`
      : "";
    if (!vrij.length) {
      stap2 = `<h2 class="rsv-stap"><span aria-hidden="true">2</span> Kies een tijd</h2><div class="rsv rsv-leeg">${geen}${sug}<p class="small">Liever overleggen? ${bellen(ctx, true)}.</p></div>`;
    } else {
      const note = ctx.inert
        ? `<p class="small"><strong>Dit is een voorbeeld:</strong> je kunt alles proberen, maar er wordt niets gereserveerd of verstuurd.</p>`
        : `<p class="small">We gebruiken je gegevens alleen voor je reservering. Lees de <a href="${ctx.esc(ctx.href("privacy"))}">privacyverklaring</a>.</p>`;
      stap2 = `<form class="rsv" method="post" action="${ctx.esc(ctx.preview ? "#" : `${ctx.root}_zf/reservering`)}"><input type="hidden" name="datum" value="${ctx.esc(v.datum)}"><input type="hidden" name="personen" value="${v.personen}"><h2 class="rsv-stap"><span aria-hidden="true">2</span> Kies een tijd</h2><fieldset class="slots-veld"><legend>${ctx.esc(wanneer)}</legend><div class="slots">${knoppen}</div></fieldset><h2 class="rsv-stap"><span aria-hidden="true">3</span> Je gegevens</h2><fieldset class="rsv-gegevens"><legend class="vh">Je gegevens</legend>${veld(ctx, "naam", "Naam", v.naam ?? "", ' required maxlength="100" autocomplete="name"')}<div class="rsv-rij">${veld(ctx, "email", "E-mailadres", v.email ?? "", ' type="email" required maxlength="200" autocomplete="email"')}${veld(ctx, "telefoon", "Telefoon", v.telefoon ?? "", ' type="tel" required maxlength="30" autocomplete="tel"')}</div><label for="r-opmerking">Opmerking (mag leeg)<textarea id="r-opmerking" name="opmerking" maxlength="600" placeholder="Bijvoorbeeld een allergie, een kinderstoel of iets te vieren">${ctx.esc(v.opmerking ?? "")}</textarea></label></fieldset><label class="hp" aria-hidden="true">Laat leeg<input name="website" tabindex="-1" autocomplete="off"></label>${note}<p class="rsv-knop"><button class="btn" type="submit">Reservering bevestigen</button></p></form>`;
    }
  }
  return `<section><div class="wrap">${kop}${fouten}<div class="rsv-grid rsv-pagina"><div>${stap1}${stap2}</div>${urenKaart(ctx, b)}</div></div></section>`;
}

/** …/gereserveerd: de bevestiging. `voorbeeld`: er is niets bewaard (een voorbeeld of ontwerpvoorstel). */
export function gereserveerdBody(ctx: ReserveerCtx, r: { nr: string; datum: string; tijd: string; personen: number } | null, voorbeeld: boolean): string {
  const home = ctx.preview ? "#" : ctx.root.length > 1 ? ctx.root.slice(0, -1) : "/";
  if (!r) {
    return `<section><div class="wrap narrow"><h1>Reservering niet gevonden</h1><p>We kunnen deze reservering niet tonen. Heb je een bevestiging per e-mail gekregen? Dan staat je tafel klaar. Twijfel je, ${bellen(ctx)}.</p><p><a class="btn" href="${ctx.esc(pad(ctx, "reserveren"))}">Reserveer een tafel</a></p></div></section>`;
  }
  const sum = `<dl class="rsv-sum"><div><dt>Wanneer</dt><dd>${ctx.esc(datumTekst(r.datum))} om ${ctx.esc(r.tijd)}</dd></div><div><dt>Met</dt><dd>${ctx.esc(personenTekst(r.personen))}</dd></div>${voorbeeld ? "" : `<div><dt>Reserveringsnummer</dt><dd>${ctx.esc(r.nr)}</dd></div>`}</dl>`;
  const tekst = voorbeeld
    ? `<p class="rsv-voorbeeld"><strong>Dit is een voorbeeld:</strong> er is niets gereserveerd en niets verstuurd. Op je eigen website komt een reservering meteen in je reserveringsboek, krijgt de gast een bevestiging per e-mail en krijg jij er een bericht van.</p>`
    : `<p>We hebben een bevestiging naar je e-mailadres gestuurd. Kun je toch niet komen? Laat het ons even weten: ${bellen(ctx)}.</p>`;
  return `<section><div class="wrap narrow"><div class="rsv-ok" role="status"><p class="rsv-vink" aria-hidden="true">✓</p><h1>${voorbeeld ? "Zo ziet je bevestiging eruit" : "Je tafel is gereserveerd"}</h1>${sum}</div>${tekst}<p class="band-acts rsv-acts"><a class="btn" href="${ctx.esc(home)}">Terug naar de website</a></p></div></section>`;
}

/** De opmaak, achter de basisopmaak van de site; premium krijgt de kaarten van de huisstijl. */
export function reserveerCss(premium: boolean): string {
  const basis = `.rsv-grid{display:grid;gap:32px;align-items:start}@media (min-width:900px){.rsv-grid{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:48px}}.rsv-grid>*{min-width:0}
form.rsv,.rsv-leeg{display:grid;gap:14px;margin:0 0 28px;padding:22px;border:1px solid var(--line);border-radius:var(--r);background:#fff}.rsv-rij{display:grid;gap:12px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}@media (max-width:460px){.rsv-rij{grid-template-columns:minmax(0,1fr)}}
form.rsv label{display:grid;gap:6px;font-weight:600;font-size:.95rem}form.rsv input,form.rsv select,form.rsv textarea{width:100%;min-width:0;font:inherit;font-weight:400;padding:12px 14px;border:1px solid #cfd4da;border-radius:10px;background:#fff;color:var(--ink)}form.rsv textarea{min-height:96px}
form.rsv fieldset{min-width:0;margin:0;padding:0;border:0}form.rsv legend{padding:0;margin:0 0 12px;font-weight:700}.rsv-knop{margin:0}.rsv-gegevens{display:grid;gap:14px}
.rsv-stap{display:flex;align-items:center;gap:12px;margin:0 0 14px;font-size:1.25rem}.rsv-stap span{display:grid;place-items:center;flex-shrink:0;width:34px;height:34px;border-radius:999px;background:var(--k);color:var(--k-t);font-size:1rem}form.rsv .rsv-stap{margin:6px 0 0}
.slots{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(88px,1fr))}form.rsv label.slot{position:relative;display:block}form.rsv .slot input{position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;opacity:0;cursor:pointer}
.slot span{display:block;padding:12px 6px;border:1.5px solid var(--line);border-radius:12px;background:#fff;text-align:center;font-weight:700;font-variant-numeric:tabular-nums}.slot input:hover+span{border-color:var(--k)}.slot input:checked+span{background:var(--k);color:var(--k-t);border-color:var(--k)}.slot input:focus-visible+span{outline:3px solid var(--a);outline-offset:2px}
.slot.vol span{background:var(--soft);color:var(--mute);font-weight:500}.slot.vol small{font-size:.75rem}.slot.vol input{cursor:not-allowed}
.rsv-sug-kop{margin:0;font-weight:700}.rsv-sug{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}.rsv-sug a{display:block;padding:9px 16px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);font-weight:600;text-decoration:none}.rsv-sug a:hover{border-color:var(--k)}
.rsv-kaart{padding:26px 28px;border-radius:var(--r);background:#16191d;color:#fff}.rsv-kaart-kop{margin:0 0 10px;font-size:.78rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--a)}.rsv-kaart dl{margin:0}.rsv-kaart div{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.12)}.rsv-kaart dt{color:rgba(255,255,255,.75)}.rsv-kaart dd{margin:0;font-weight:700;text-align:right;font-variant-numeric:tabular-nums}.rsv-kaart-voet{margin:14px 0 0;font-size:.9rem;color:rgba(255,255,255,.75)}
.rsv-ok{margin:0 0 20px;padding:28px;border-radius:var(--r);background:#fff;border:1px solid var(--line)}.rsv-vink{display:grid;place-items:center;width:56px;height:56px;margin:0 0 14px;border-radius:999px;background:#1c7c4b;color:#fff;font-size:1.6rem;font-weight:700}.rsv-ok h1{font-size:clamp(1.8rem,4vw,2.6rem)}
.rsv-sum{display:grid;gap:0;margin:0}.rsv-sum div{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 16px;padding:12px 0;border-bottom:1px solid var(--line)}.rsv-sum div:last-child{border-bottom:0}.rsv-sum dt{color:var(--mute)}.rsv-sum dd{margin:0;font-weight:700}
.rsv-voorbeeld{padding:14px 18px;border-radius:12px;background:#fff7e0;border:1px solid #f0d58a}.rsv-acts{justify-content:flex-start}`;
  const prem = `form.rsv,.rsv-leeg,.rsv-ok{border:0;border-radius:24px;padding:26px 26px 28px;box-shadow:0 1px 2px rgba(10,18,14,.05),0 14px 34px rgba(10,18,14,.08)}.rsv-kaart{border-radius:1.75rem;background:var(--night);color:var(--cream);box-shadow:0 30px 60px -30px rgba(10,18,14,.6)}.rsv-kaart-kop{color:var(--sun)}.rsv-kaart dt,.rsv-kaart-voet{color:rgba(255,246,234,.72)}
.rsv-stap span{background:var(--night);color:var(--sun)}.slot input:checked+span{background:var(--night);color:var(--cream);border-color:var(--night)}.slot input:hover+span{border-color:var(--night)}.slot input:focus-visible+span{outline-color:var(--a-d)}.rsv-sug a:hover{border-color:var(--a-d)}.rsv-kaart :focus-visible{outline-color:var(--sun)}`;
  return premium ? `${basis}\n${prem}` : basis;
}
