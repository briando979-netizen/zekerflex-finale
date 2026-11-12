import { formDataBegrensd } from "@/lib/http/body-grens";
import { randomBytes } from "node:crypto";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { siteHostCsp } from "@/lib/security/csp";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { stylesheetHref } from "@/lib/sites/render";
import { storeContactMessage, type LiveSite } from "@/lib/sites/store";
import { chatAntwoordTekst } from "@/lib/sitechat/antwoord";
import { haalGesprek, voegBerichtToe, zetStatus } from "@/lib/sitechat/gesprek";
import { isGesprekId, type SiteGesprek } from "@/lib/sitechat/regels";
import { chatAan, siteKanaal } from "@/lib/sitechat/site-instelling";
import { siteKennis } from "@/lib/sitechat/site-kennis";

// ---------------------------------------------------------------------------
// De chatpagina van een klantsite: …/_zf/chat. Klantsites hebben geen scripts
// (AGENTS.md), dus dit is gewone HTML met formulieren: een vraag versturen
// laadt de pagina opnieuw met het antwoord van de assistent (zelfde model als
// de chat op de ZekerFlex-homepage). Een medewerker leest mee en neemt over in
// de werkgeversomgeving (Website → Chat); zijn antwoord verschijnt bij
// "Nieuwe berichten ophalen". Het gesprek hangt aan een willekeurig token in de
// adresbalk (g=), want een afgeschermde site heeft geen cookies.
// Op een voorbeeldsite of ontwerpvoorstel doet de chat niets: daar antwoordt
// niemand en maken we geen AI-kosten.
// ---------------------------------------------------------------------------

export interface SiteChatOpties {
  /** "/site/bakker/" of "/" */
  root: string;
  origin: string;
  version?: string | undefined;
  noindex: boolean;
}

const DAGDELEN = ["ochtend", "middag", "avond", "maakt niet uit"] as const;
const FOUTEN: Record<string, string> = {
  limiet: "Je stelt veel vragen achter elkaar. Wacht even en probeer het dan opnieuw.",
  leeg: "Typ eerst een vraag.",
  afspraak: "Vul je naam, een geldig e-mailadres, een datum vanaf vandaag en je onderwerp in, en zet het vinkje.",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nieuwId = () => randomBytes(16).toString("hex");
const isInert = (live: LiveSite) => Boolean(live.snapshot.voorbeeld || live.snapshot.voorstel);

function koppen(opts: SiteChatOpties): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": siteHostCsp(opts.origin),
    "X-Robots-Tag": "noindex",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}
const tekst = (body: string, status: number, opts: SiteChatOpties) => new Response(body, { status, headers: { ...koppen(opts), "Content-Type": "text/plain; charset=utf-8" } });
const terug = (opts: SiteChatOpties, id: string, extra = "") => new Response(null, { status: 303, headers: { Location: `${opts.root}_zf/chat?g=${id}${extra}#laatste` } });

async function magChatten(live: LiveSite): Promise<boolean> {
  return chatAan({ id: live.siteId, createdAt: live.snapshot.createdAt });
}

function bericht(b: SiteGesprek["berichten"][number], bedrijf: string): string {
  if (b.rol === "systeem") return `<li class="zfc-b zfc-sys"><p>${esc(b.tekst)}</p></li>`;
  const wie = b.rol === "gast" ? "Jij" : b.rol === "ai" ? "Assistent" : esc(b.door ?? `Medewerker van ${bedrijf}`);
  const klasse = b.rol === "gast" ? "zfc-gast" : b.rol === "medewerker" ? "zfc-medewerker" : "zfc-ai";
  return `<li class="zfc-b ${klasse}"><span class="zfc-wie">${wie}</span><p>${esc(b.tekst)}</p></li>`;
}

/** De pagina zelf; puur genoeg om los te tonen (geen opslag). */
export function renderChatPagina(input: {
  bedrijf: string;
  opts: SiteChatOpties;
  id: string;
  gesprek: SiteGesprek | null;
  inert: boolean;
  afspraak: boolean;
  fout: string;
  ok: string;
  vandaag: string;
}): string {
  const { bedrijf, opts, id, gesprek, inert, afspraak, fout, ok, vandaag } = input;
  const naam = esc(bedrijf);
  const actie = esc(`${opts.root}_zf/chat`);
  const status = gesprek?.status ?? "ai";
  const uit = inert ? " disabled" : "";
  const g = `<input type="hidden" name="g" value="${esc(id)}">`;
  const hp = '<label class="hp" aria-hidden="true">Laat leeg<input name="website" tabindex="-1" autocomplete="off"></label>';
  const statusregel = status === "mens" ? "Je chat met een medewerker" : status === "wacht" ? "Een medewerker is gevraagd" : "Digitale assistent · antwoordt meteen";
  const heeftVraag = Boolean(gesprek?.berichten.some((b) => b.rol === "gast"));
  // wacht de gast op een mens, dan ververst de pagina zelf (waar de browser dat toestaat)
  const ververs = !inert && (status === "wacht" || status === "mens") ? `<meta http-equiv="refresh" content="15;url=${esc(`${opts.root}_zf/chat?g=${id}`)}#laatste">` : "";
  const suggesties = ["Wat zijn de openingstijden?", "Wat bieden jullie aan?", "Hoe kan ik contact opnemen?"];

  const afspraakForm = afspraak
    ? `<section id="afspraak" class="zfc-afspraak" aria-labelledby="zfc-afspraak-kop"><h2 id="zfc-afspraak-kop">Afspraak aanvragen</h2><p>${naam} neemt contact met je op om de afspraak te bevestigen.</p>
<form method="post" action="${actie}" class="zfc-velden">${g}<input type="hidden" name="actie" value="afspraak">${hp}
<label>Naam<input name="naam" required maxlength="100" autocomplete="name"${uit}></label>
<div class="zfc-twee"><label>E-mailadres<input name="email" type="email" required maxlength="200" autocomplete="email"${uit}></label><label>Telefoon (mag leeg)<input name="telefoon" maxlength="30" autocomplete="tel"${uit}></label></div>
<div class="zfc-twee"><label>Gewenste datum<input name="datum" type="date" required min="${esc(vandaag)}"${uit}></label><label>Dagdeel<select name="dagdeel"${uit}>${DAGDELEN.map((d) => `<option value="${d}">${d[0]?.toUpperCase()}${d.slice(1)}</option>`).join("")}</select></label></div>
<label>Waar gaat het over?<textarea name="onderwerp" required maxlength="1000" rows="3"${uit}></textarea></label>
<label class="zfc-akkoord"><input type="checkbox" name="akkoord" value="ja" required${uit}><span>${naam} mag mijn gegevens gebruiken om contact met me op te nemen over deze afspraak.</span></label>
<p><button class="btn" type="submit"${uit}>Vraag afspraak aan</button></p></form></section>`
    : "";

  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chat · ${naam}</title><meta name="robots" content="noindex,nofollow">${ververs}<link rel="stylesheet" href="${esc(stylesheetHref(opts))}"></head><body class="zfc-pagina"><a class="skip" href="#zfc-bericht">Naar het berichtveld</a>
<header class="zfc-kop"><div class="wrap zfc-balk"><a class="zfc-terug" href="${esc(opts.root)}">← Terug naar de website</a><p class="zfc-naam"><strong>${naam}</strong><span>${statusregel}</span></p></div></header>
<main id="inhoud" class="wrap narrow zfc"><h1 class="vh">Chat met ${naam}</h1>
${inert ? `<p class="zfc-inert" role="note">Dit is een voorbeeld. Op de echte website beantwoordt de assistent hier vragen met de gegevens van ${naam}, kan een medewerker het gesprek overnemen en kan een bezoeker een afspraak aanvragen. Hier wordt niets verstuurd.</p>` : ""}
<p class="zfc-uitleg">Je chat met de digitale assistent van ${naam}. Een medewerker kan meelezen en het gesprek overnemen. Deel geen betaalgegevens.</p>
${fout && FOUTEN[fout] ? `<p class="zfc-melding" role="alert">${esc(FOUTEN[fout] ?? "")}</p>` : ""}${ok === "afspraak" ? '<p class="zfc-ok" role="status">Je afspraakverzoek is verstuurd.</p>' : ""}
<ol class="zfc-log" aria-label="Berichten"><li class="zfc-b zfc-ai"><span class="zfc-wie">Assistent</span><p>Hallo! Ik ben de digitale assistent van ${naam}. Waarmee kan ik je helpen?</p></li>${(gesprek?.berichten ?? []).map((b) => bericht(b, bedrijf)).join("")}</ol>
<p id="laatste" class="zfc-anker"></p>
${!heeftVraag ? `<form method="post" action="${actie}" class="zfc-sug">${g}<input type="hidden" name="actie" value="bericht">${suggesties.map((s) => `<button class="zfc-knop" type="submit" name="tekst" value="${esc(s)}"${uit}>${esc(s)}</button>`).join("")}</form>` : ""}
<form method="post" action="${actie}" class="zfc-form">${g}<input type="hidden" name="actie" value="bericht">${hp}<label for="zfc-bericht">Je bericht</label><textarea id="zfc-bericht" name="tekst" required maxlength="1500" rows="3"${uit}></textarea><p class="zfc-rij"><button class="btn" type="submit"${uit}>Verstuur</button></p></form>
<div class="zfc-acties">${status === "mens" ? "" : `<form method="post" action="${actie}">${g}<input type="hidden" name="actie" value="mens"><button class="zfc-knop" type="submit"${inert || status === "wacht" ? " disabled" : ""}>${status === "wacht" ? "Medewerker gevraagd" : "Medewerker spreken"}</button></form>`}<a class="zfc-knop" href="${esc(`${opts.root}_zf/chat?g=${id}&afspraak=1#afspraak`)}">Afspraak aanvragen</a><a class="zfc-knop" href="${esc(`${opts.root}_zf/chat?g=${id}`)}#laatste">Nieuwe berichten ophalen</a></div>
${afspraakForm}
</main></body></html>`;
}

/** GET …/_zf/chat */
export async function serveSiteChat(live: LiveSite, opts: SiteChatOpties, request: Request): Promise<Response> {
  const inert = isInert(live);
  if (!inert && !(await magChatten(live))) return tekst("De chat staat op deze website uit.", 404, opts);
  const q = new URL(request.url).searchParams;
  const g = q.get("g") ?? "";
  const id = isGesprekId(g) ? g : nieuwId();
  const gesprek = inert ? null : await haalGesprek(siteKanaal(live.siteId), id);
  const html = renderChatPagina({
    bedrijf: live.snapshot.bedrijf.naam,
    opts,
    id,
    gesprek,
    inert,
    afspraak: q.get("afspraak") === "1",
    fout: q.get("fout") ?? "",
    ok: q.get("ok") ?? "",
    vandaag: amsterdamDayKey(new Date()),
  });
  return new Response(html, { headers: koppen(opts) });
}

const veld = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);

/** POST …/_zf/chat: een vraag, "medewerker spreken" of een afspraakverzoek. */
export async function handleSiteChat(request: Request, live: LiveSite, opts: SiteChatOpties & { address: string }): Promise<Response> {
  // net als het contactformulier: een voorbeeld of voorstel verstuurt niets en kost geen AI
  if (live.snapshot.voorbeeld) return tekst("Dit is een voorbeeldwebsite: de chat verstuurt niets.", 403, opts);
  if (live.snapshot.voorstel) return tekst("Dit is een ontwerpvoorstel: de chat verstuurt niets.", 403, opts);
  if (!(await magChatten(live))) return tekst("De chat staat op deze website uit.", 404, opts);

  // vóór het lezen (12 nov): een ruime limiet per IP (de echte limiet hieronder komt na het lezen) en een grens
  try {
    await enforceRateLimit({ name: "site-chat-ip-voor", identifier: privateRateLimitIdentifier(clientIp(request)), limit: 60, windowSeconds: 600, message: "Te veel berichten." });
  } catch {
    return tekst("Te veel berichten. Probeer het over een paar minuten opnieuw.", 429, opts);
  }
  const form = await formDataBegrensd(request, 32_000).catch(() => null);
  if (!form) return tekst("Ongeldig formulier.", 400, opts);
  const g = veld(form, "g", 64);
  const id = isGesprekId(g) ? g : nieuwId();
  // honeypot: mensen vullen het verborgen veld nooit in, bots wel
  if (veld(form, "website", 200)) return terug(opts, id);
  try {
    await enforceRateLimit({ name: "site-chat-ip", identifier: privateRateLimitIdentifier(clientIp(request)), limit: 20, windowSeconds: 600, message: "Te veel berichten." });
    await enforceRateLimit({ name: "site-chat-site", identifier: live.siteId, limit: 400, windowSeconds: 86_400, message: "Te veel berichten vandaag." });
  } catch {
    return terug(opts, id, "&fout=limiet");
  }

  const kanaal = siteKanaal(live.siteId);
  const actie = veld(form, "actie", 20);
  const bedrijf = live.snapshot.bedrijf;

  if (actie === "mens") {
    const huidig = await haalGesprek(kanaal, id);
    if (huidig?.status !== "mens") {
      await voegBerichtToe(kanaal, id, { rol: "systeem", tekst: `Je hebt om een medewerker gevraagd. Iemand van ${bedrijf.naam} leest zo mee en antwoordt hier.${bedrijf.telefoon ? ` Haast? Bel ${bedrijf.telefoon}.` : ""}` }, { pagina: "chat" });
      await zetStatus(kanaal, id, "wacht");
    }
    return terug(opts, id);
  }

  if (actie === "afspraak") {
    const a = {
      naam: veld(form, "naam", 100),
      email: veld(form, "email", 200),
      telefoon: veld(form, "telefoon", 30),
      datum: veld(form, "datum", 10),
      dagdeel: veld(form, "dagdeel", 20),
      onderwerp: veld(form, "onderwerp", 1000),
    };
    const vandaag = amsterdamDayKey(new Date());
    const geldig =
      a.naam.length >= 2 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.email) &&
      /^\d{4}-\d{2}-\d{2}$/.test(a.datum) &&
      a.datum >= vandaag &&
      (DAGDELEN as readonly string[]).includes(a.dagdeel) &&
      a.onderwerp.length >= 2 &&
      form.get("akkoord") === "ja";
    if (!geldig) return terug(opts, id, "&afspraak=1&fout=afspraak");
    const dag = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${a.datum}T12:00:00Z`));
    await voegBerichtToe(kanaal, id, { rol: "systeem", tekst: `Afspraakverzoek verstuurd voor ${dag} (${a.dagdeel}): ${a.onderwerp}. ${bedrijf.naam} neemt contact met je op om het te bevestigen.` }, { pagina: "chat" });
    const tekstVoorBedrijf = `Afspraakverzoek via de websitechat\nGewenste datum: ${dag} (${a.dagdeel})\nWaarover: ${a.onderwerp}\n\nHet gesprek staat in ZekerFlex onder Website → Chat.`;
    await storeContactMessage(live.siteId, { naam: a.naam, email: a.email, telefoon: a.telefoon, bericht: tekstVoorBedrijf });
    if (bedrijf.email) {
      await sendMail({
        to: bedrijf.email,
        replyTo: a.email,
        kind: "site-contact",
        subject: `Afspraakverzoek via je websitechat van ${a.naam}`,
        text: `${a.naam} vraagt via de chat op ${opts.address} een afspraak aan.\n\nE-mail: ${a.email}\nTelefoon: ${a.telefoon || "niet ingevuld"}\n\n${tekstVoorBedrijf}\n\nBeantwoord deze mail om direct te reageren.`,
      }).catch((err) => logger.warn("sitechat: afspraakmail mislukt", { siteId: live.siteId, err: String(err) }));
    }
    return terug(opts, id, "&ok=afspraak");
  }

  // een vraag
  const vraag = veld(form, "tekst", 1500);
  if (!vraag) return terug(opts, id, "&fout=leeg");
  const r = await chatAntwoordTekst({ kanaal, id, berichten: [{ rol: "gast", tekst: vraag }], pagina: "chat", ip: clientIp(request) }, () => siteKennis(live.snapshot));
  return terug(opts, id, r.status === "limiet" ? "&fout=limiet" : "");
}
