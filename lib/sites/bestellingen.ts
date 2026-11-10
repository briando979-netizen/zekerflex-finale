import { randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { renderWinkelPagina } from "@/lib/sites/render";
import { siteHeaders, siteText, type ServeOptions } from "@/lib/sites/serve";
import { getSite, saveWinkel, type LiveSite } from "@/lib/sites/store";
import { berekenBestelling, euro, leesBestelForm, verlaagVoorraad, winkelVan, type Bestelconcept } from "@/lib/sites/winkel";
import { mandCookie } from "@/lib/sites/mand";
import { somRegels } from "@/lib/sites/bestel-som";
import { bestelKey, isBestelId } from "@/lib/sites/bestelling-lezen";
import { claimKorting, geefKortingVrij, kortingGebruik } from "@/lib/sites/korting-gebruik";
import { BETAAL_NAAM } from "@/lib/sites/winkel-betalen";
import { kortingVoorCode } from "@/lib/sites/winkel-korting";

// ---------------------------------------------------------------------------
// Bestellingen uit de winkel van een klantsite (lib/sites/winkel.ts).
//   KV "site-bestelling:<siteId>:<id>" — één bestelling met klantgegevens en status
// Een kortingscode telt pas bij "plaats" (lib/sites/korting-gebruik.ts), en de
// bedankpagina krijgt ?nr=<nr>&b=<id> om bedrag en betaalgegevens te tonen.
// POST …/_zf/bestelling in drie stappen, zonder scripts: "controle" toont het
// overzicht met totaal, "wijzig" het formulier terug, "plaats" bewaart, mailt
// het bedrijf en stuurt de bezoeker naar de bedankpagina. Prijzen komen van de
// gepubliceerde site. Een voorbeeld of voorstel doorloopt dezelfde stappen,
// maar bewaart en verstuurt nooit iets (4 nov 2026: proberen moet kunnen).
// Kwam de bestelling uit de winkelmand (bron=mand), dan is die daarna leeg.
// ---------------------------------------------------------------------------

export type BestelStatus = "nieuw" | "bevestigd" | "klaar" | "afgerond" | "geannuleerd";
export const BESTEL_STATUSSEN: BestelStatus[] = ["nieuw", "bevestigd", "klaar", "afgerond", "geannuleerd"];

export interface SiteBestelling extends Bestelconcept {
  id: string;
  /** wat de klant en het bedrijf noemen ("K7M3Q2") */
  nr: string;
  at: string;
  status: BestelStatus;
  /** wanneer de winkel de betaling binnen zag (Webshop → Bestellingen); leeg = nog niet betaald */
  betaaldAt?: string | null | undefined;
}

const prefix = (siteId: string) => `site-bestelling:${siteId}:`;
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Zes tekens zonder verwarrende letters (geen 0/O, 1/I/L). */
function bestelnummer(): string {
  return [...randomBytes(6)].map((b) => LETTERS[b % LETTERS.length]).join("");
}

/** Een nieuwe bestelling met nummer, nog niet bewaard. */
export function nieuweBestelling(c: Bestelconcept, now = new Date()): SiteBestelling {
  return { ...c, id: `o${now.getTime().toString(36)}${randomBytes(4).toString("hex")}`, nr: bestelnummer(), at: now.toISOString(), status: "nieuw" };
}

export async function bewaarBestelling(siteId: string, c: Bestelconcept, now = new Date()): Promise<SiteBestelling> {
  const rec = nieuweBestelling(c, now);
  await kvSet(bestelKey(siteId, rec.id), rec);
  return rec;
}

/** De bestellingen van een site, nieuwste eerst. */
export async function bestellingenVan(siteId: string, limit = 300): Promise<SiteBestelling[]> {
  const rows = await kvListValues<SiteBestelling>(prefix(siteId), limit);
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export async function zetBestelStatus(siteId: string, id: string, status: BestelStatus): Promise<SiteBestelling | null> {
  if (!isBestelId(id)) return null;
  const rec = await kvGet<SiteBestelling>(bestelKey(siteId, id));
  if (!rec) return null;
  const next = { ...rec, status };
  await kvSet(bestelKey(siteId, id), next);
  return next;
}

/** Betaald of (weer) niet betaald; bij overboeking ziet de winkel zo wat er nog binnen moet komen. */
export async function zetBetaald(siteId: string, id: string, betaald: boolean, now = new Date()): Promise<SiteBestelling | null> {
  if (!isBestelId(id)) return null;
  const rec = await kvGet<SiteBestelling>(bestelKey(siteId, id));
  if (!rec) return null;
  const next: SiteBestelling = { ...rec, betaaldAt: betaald ? (rec.betaaldAt ?? now.toISOString()) : null };
  await kvSet(bestelKey(siteId, id), next);
  return next;
}

/** Wat de winkel over de betaling moet weten. */
function betaalRegel(c: Bestelconcept, nr: string): string[] {
  const m = c.betaalmethode;
  if (!m) return [];
  const bedrag = euro(c.totaalCents);
  if (m === "overboeking") return [`Betaling: ${BETAAL_NAAM[m]}. De klant maakt ${bedrag} over met omschrijving ${nr}. Zet de bestelling in Bestellingen op Betaald zodra het bedrag binnen is.`];
  if (m === "afhalen") return [`Betaling: ${BETAAL_NAAM[m]}. De klant betaalt ${bedrag} bij het afhalen.`];
  return [`Betaling: ${BETAAL_NAAM[m]}. De klant betaalt ${bedrag} contant aan de bezorger.`];
}

/** De mail aan het bedrijf: alles wat nodig is om de bestelling klaar te zetten. `afhaalAdres`: het adres van het bedrijf. */
export function bestelMail(c: Bestelconcept, nr: string, adres: string, afhaalAdres = ""): string {
  const i = c.invoer;
  const vz = c.verzending;
  const regels = c.regels.map((r) => `${r.aantal} × ${r.naam} (${euro(r.prijsCents)})  ${euro(r.totaalCents)}`);
  const som = somRegels(c).map((r) => (r.soort === "noot" ? r.label : `${r.label}  ${r.bedrag}`));
  const land = vz?.land && vz.land !== "Nederland" ? `, ${vz.land}` : "";
  const waar = i.levering === "bezorgen" ? `Bezorgen op: ${i.straat}, ${i.postcode} ${i.plaats}${land}` : `De klant haalt de bestelling af${vz && (vz.adres || afhaalAdres) ? ` (${vz.adres || afhaalAdres})` : ""}.`;
  return [
    `Nieuwe bestelling ${nr} via ${adres}.`,
    "",
    ...regels,
    ...som,
    "",
    ...(vz ? [`Verzending: ${vz.naam}${vz.levertijd ? ` (${vz.levertijd})` : ""}`] : []),
    waar,
    ...betaalRegel(c, nr),
    `Naam: ${i.naam}`,
    `E-mail: ${i.email}`,
    `Telefoon: ${i.telefoon}`,
    ...(i.opmerking ? ["", `Opmerking: ${i.opmerking}`] : []),
    "",
    "Beantwoord deze mail om de klant te bereiken. Al je bestellingen staan in ZekerFlex onder Webshop → Bestellingen.",
  ].join("\n");
}

/**
 * POST …/_zf/bestelling. `besteld` is het adres van de bedankpagina (zonder ?nr),
 * `address` hoe de mail de site noemt.
 */
export async function handleSiteOrder(request: Request, live: LiveSite, opts: ServeOptions & { besteld: string; address: string }): Promise<Response> {
  const html = (doc: string | null, status = 200) => (doc ? new Response(doc, { status, headers: siteHeaders("text/html; charset=utf-8", "no-store", opts) }) : siteText("Deze pagina bestaat niet.", 404, opts));

  const form = await request.formData().catch(() => null);
  if (!form) return siteText("Ongeldig formulier.", 400, opts);
  // honeypot: mensen vullen het verborgen veld nooit in, bots wel: doe alsof het lukte
  if (String(form.get("website") ?? "").trim()) return new Response(null, { status: 303, headers: { Location: opts.besteld } });

  const winkel = winkelVan(live.snapshot);
  const invoer = leesBestelForm(form);
  const vanMand = form.get("bron") === "mand";
  const stap = String(form.get("stap") ?? "controle");
  if (stap === "wijzig") return html(renderWinkelPagina(live.snapshot, { soort: "bestellen", invoer, vanMand }, opts));
  // hoe vaak de ingevulde kortingscode al gebruikt is, op de server geteld (een storing telt als nog niet gebruikt;
  // bij het plaatsen legt claimKorting het gebruik toch nog vast, en daar telt de grens wel)
  const code = invoer.kortingscode ? kortingVoorCode(winkel.kortingscodes, invoer.kortingscode) : undefined;
  const kortingGebruikt = code ? await kortingGebruik(live.siteId, code.id).catch(() => 0) : 0;
  const { concept, fouten } = berekenBestelling(winkel, invoer, { kortingGebruikt });
  if (!concept) return html(renderWinkelPagina(live.snapshot, { soort: "bestellen", invoer, fouten, vanMand }, opts));
  if (stap !== "plaats") return html(renderWinkelPagina(live.snapshot, { soort: "controle", concept, vanMand }, opts));
  // na het plaatsen is de winkelmand leeg (lib/sites/mand.ts)
  const leeg: Record<string, string> = vanMand ? { "Set-Cookie": mandCookie([], opts.root, opts.origin.startsWith("https:")) } : {};

  try {
    await enforceRateLimit({ name: "site-order-ip", identifier: privateRateLimitIdentifier(clientIp(request)), limit: 5, windowSeconds: 600, message: "Te veel bestellingen. Probeer het later opnieuw." });
    await enforceRateLimit({ name: "site-order-site", identifier: live.siteId, limit: 300, windowSeconds: 86_400, message: "Deze winkel neemt vandaag geen bestellingen meer aan." });
  } catch {
    return siteText("Te veel bestellingen in korte tijd. Probeer het later opnieuw, of neem contact op met de winkel.", 429, opts);
  }
  // een voorbeeld of voorstel: niets bewaren of versturen (een voorstel draagt het echte e-mailadres van een bedrijf)
  if (live.snapshot.voorbeeld || live.snapshot.voorstel) return new Response(null, { status: 303, headers: { Location: `${opts.besteld}?voorbeeld=1`, ...leeg } });

  const rec = nieuweBestelling(concept);
  // de kortingscode vastleggen vóór het bewaren: is hij intussen op, dan terug naar het formulier
  const korting = concept.korting ? winkel.kortingscodes?.find((k) => k.id === concept.korting?.id) : undefined;
  if (korting && !(await claimKorting(live.siteId, korting, rec.id))) {
    return html(renderWinkelPagina(live.snapshot, { soort: "bestellen", invoer, fouten: [`De kortingscode ${korting.code} is net voor de laatste keer gebruikt. Haal de code weg en bestel opnieuw.`], vanMand }, opts));
  }
  try {
    await kvSet(bestelKey(live.siteId, rec.id), rec);
  } catch (err) {
    if (korting) await geefKortingVrij(live.siteId, korting.id, rec.id).catch(() => undefined);
    throw err;
  }
  // bijgehouden voorraad omlaag (de winkel staat live, dus de site zoals hij nu is); mislukt dat, dan staat de bestelling er wel
  if (concept.regels.some((r) => winkel.producten.find((p) => p.id === r.productId)?.voorraad != null)) {
    const site = await getSite(live.siteId).catch(() => null);
    if (site?.winkel) await saveWinkel(site.id, verlaagVoorraad(site.winkel, concept.regels)).catch((err) => logger.warn("site stock not lowered", { siteId: live.siteId, err: String(err) }));
  }
  const to = live.snapshot.bedrijf.email;
  if (to) {
    await sendMail({
      to,
      replyTo: concept.invoer.email,
      kind: "site-bestelling",
      subject: `Nieuwe bestelling ${rec.nr} via je website (${euro(concept.totaalCents)})`,
      text: bestelMail(concept, rec.nr, opts.address, [live.snapshot.bedrijf.straat, `${live.snapshot.bedrijf.postcode} ${live.snapshot.bedrijf.plaats}`.trim()].filter(Boolean).join(", ")),
    }).catch((err) => logger.warn("site order mail failed", { siteId: live.siteId, err: String(err) }));
  }
  return new Response(null, { status: 303, headers: { Location: `${opts.besteld}?nr=${rec.nr}&b=${rec.id}`, ...leeg } });
}
