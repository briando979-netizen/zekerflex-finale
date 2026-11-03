import { randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { renderWinkelPagina } from "@/lib/sites/render";
import { siteHeaders, siteText, type ServeOptions } from "@/lib/sites/serve";
import type { LiveSite } from "@/lib/sites/store";
import { berekenBestelling, euro, leesBestelForm, winkelVan, type Bestelconcept } from "@/lib/sites/winkel";

// ---------------------------------------------------------------------------
// Bestellingen uit de winkel van een klantsite (lib/sites/winkel.ts).
//   KV "site-bestelling:<siteId>:<id>" — één bestelling met klantgegevens en status
// POST …/_zf/bestelling in drie stappen, zonder scripts: "controle" toont het
// overzicht met totaal, "wijzig" het formulier terug, "plaats" bewaart, mailt
// het bedrijf en stuurt de bezoeker naar de bedankpagina. Prijzen komen van de
// gepubliceerde site; een voorbeeld of voorstel verstuurt nooit iets.
// ---------------------------------------------------------------------------

export type BestelStatus = "nieuw" | "bevestigd" | "klaar" | "afgerond" | "geannuleerd";
export const BESTEL_STATUSSEN: BestelStatus[] = ["nieuw", "bevestigd", "klaar", "afgerond", "geannuleerd"];

export interface SiteBestelling extends Bestelconcept {
  id: string;
  /** wat de klant en het bedrijf noemen ("K7M3Q2") */
  nr: string;
  at: string;
  status: BestelStatus;
}

const prefix = (siteId: string) => `site-bestelling:${siteId}:`;
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Zes tekens zonder verwarrende letters (geen 0/O, 1/I/L). */
function bestelnummer(): string {
  return [...randomBytes(6)].map((b) => LETTERS[b % LETTERS.length]).join("");
}

const isId = (s: string) => /^o[a-z0-9]{10,24}$/.test(s);

export async function bewaarBestelling(siteId: string, c: Bestelconcept, now = new Date()): Promise<SiteBestelling> {
  const rec: SiteBestelling = { ...c, id: `o${now.getTime().toString(36)}${randomBytes(4).toString("hex")}`, nr: bestelnummer(), at: now.toISOString(), status: "nieuw" };
  await kvSet(`${prefix(siteId)}${rec.id}`, rec);
  return rec;
}

/** De bestellingen van een site, nieuwste eerst. */
export async function bestellingenVan(siteId: string, limit = 300): Promise<SiteBestelling[]> {
  const rows = await kvListValues<SiteBestelling>(prefix(siteId), limit);
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export async function zetBestelStatus(siteId: string, id: string, status: BestelStatus): Promise<SiteBestelling | null> {
  if (!isId(id)) return null;
  const rec = await kvGet<SiteBestelling>(`${prefix(siteId)}${id}`);
  if (!rec) return null;
  const next = { ...rec, status };
  await kvSet(`${prefix(siteId)}${id}`, next);
  return next;
}

/** De mail aan het bedrijf: alles wat nodig is om de bestelling klaar te zetten. */
export function bestelMail(c: Bestelconcept, nr: string, adres: string): string {
  const i = c.invoer;
  const regels = c.regels.map((r) => `${r.aantal} × ${r.naam} (${euro(r.prijsCents)})  ${euro(r.totaalCents)}`);
  return [
    `Nieuwe bestelling ${nr} via ${adres}.`,
    "",
    ...regels,
    ...(c.bezorgkostenCents ? [`Bezorgkosten  ${euro(c.bezorgkostenCents)}`] : []),
    `Totaal  ${euro(c.totaalCents)}`,
    "",
    i.levering === "bezorgen" ? `Bezorgen op: ${i.straat}, ${i.postcode} ${i.plaats}` : "De klant haalt de bestelling af.",
    `Naam: ${i.naam}`,
    `E-mail: ${i.email}`,
    `Telefoon: ${i.telefoon}`,
    ...(i.opmerking ? ["", `Opmerking: ${i.opmerking}`] : []),
    "",
    "Beantwoord deze mail om de klant te bereiken. Al je bestellingen staan in ZekerFlex onder Website → Winkel.",
  ].join("\n");
}

/**
 * POST …/_zf/bestelling. `besteld` is het adres van de bedankpagina (zonder ?nr),
 * `address` hoe de mail de site noemt.
 */
export async function handleSiteOrder(request: Request, live: LiveSite, opts: ServeOptions & { besteld: string; address: string }): Promise<Response> {
  if (live.snapshot.voorbeeld) return siteText("Dit is een voorbeeldwebsite: bestellingen worden niet verstuurd.", 403, opts);
  // een voorstel draagt het echte e-mailadres van een bedrijf: daar mag nooit iets heen
  if (live.snapshot.voorstel) return siteText("Dit is een ontwerpvoorstel: bestellingen worden niet verstuurd.", 403, opts);
  const html = (doc: string | null, status = 200) => (doc ? new Response(doc, { status, headers: siteHeaders("text/html; charset=utf-8", "no-store", opts) }) : siteText("Deze pagina bestaat niet.", 404, opts));

  const form = await request.formData().catch(() => null);
  if (!form) return siteText("Ongeldig formulier.", 400, opts);
  // honeypot: mensen vullen het verborgen veld nooit in, bots wel: doe alsof het lukte
  if (String(form.get("website") ?? "").trim()) return new Response(null, { status: 303, headers: { Location: opts.besteld } });

  const winkel = winkelVan(live.snapshot);
  const invoer = leesBestelForm(form);
  const stap = String(form.get("stap") ?? "controle");
  if (stap === "wijzig") return html(renderWinkelPagina(live.snapshot, { soort: "bestellen", invoer }, opts));
  const { concept, fouten } = berekenBestelling(winkel, invoer);
  if (!concept) return html(renderWinkelPagina(live.snapshot, { soort: "bestellen", invoer, fouten }, opts));
  if (stap !== "plaats") return html(renderWinkelPagina(live.snapshot, { soort: "controle", concept }, opts));

  try {
    await enforceRateLimit({ name: "site-order-ip", identifier: privateRateLimitIdentifier(clientIp(request)), limit: 5, windowSeconds: 600, message: "Te veel bestellingen. Probeer het later opnieuw." });
    await enforceRateLimit({ name: "site-order-site", identifier: live.siteId, limit: 300, windowSeconds: 86_400, message: "Deze winkel neemt vandaag geen bestellingen meer aan." });
  } catch {
    return siteText("Te veel bestellingen in korte tijd. Probeer het later opnieuw, of neem contact op met de winkel.", 429, opts);
  }

  const rec = await bewaarBestelling(live.siteId, concept);
  const to = live.snapshot.bedrijf.email;
  if (to) {
    await sendMail({
      to,
      replyTo: concept.invoer.email,
      kind: "site-bestelling",
      subject: `Nieuwe bestelling ${rec.nr} via je website (${euro(concept.totaalCents)})`,
      text: bestelMail(concept, rec.nr, opts.address),
    }).catch((err) => logger.warn("site order mail failed", { siteId: live.siteId, err: String(err) }));
  }
  return new Response(null, { status: 303, headers: { Location: `${opts.besteld}?nr=${rec.nr}` } });
}
