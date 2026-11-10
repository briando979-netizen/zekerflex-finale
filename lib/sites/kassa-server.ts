import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { bestellingenVan, bewaarBestelling, type SiteBestelling } from "@/lib/sites/bestellingen";
import { KASSA_MAX_LOS_CENTS, KASSA_MAX_REGELS, bonOpmaak, bonVanVerkoop, kassaConcept, kassaDag, wisselgeld, type KassaBon, type KassaDag } from "@/lib/sites/kassa";
import { getSite, saveWinkel } from "@/lib/sites/store";
import { bestelKey, isBestelId } from "@/lib/sites/bestelling-lezen";
import { kvGet } from "@/lib/storage/kv";
import { escapeHtml, sendMail } from "@/lib/mail";
import { LEGE_WINKEL, type SiteDoc } from "@/lib/sites/types";
import { verlaagVoorraad } from "@/lib/sites/winkel";

// ---------------------------------------------------------------------------
// Webshop → Op locatie op de server (POST/GET /api/werkgever/sites/kassa): een verkoop in de
// eigen winkel wordt een gewone bestelling (lib/sites/bestellingen.ts) met kanaal "winkel", meteen
// afgerond en betaald, en de voorraad gaat omlaag zoals bij de webshop. De prijzen komen van de
// winkel zelf (kassaConcept); alleen een los bedrag komt van de kassa. Geen mail aan de winkel (die
// was er zelf bij); de klant kan de bon wel per mail krijgen (mailKassaBon).
// ---------------------------------------------------------------------------

const regel = z.union([
  z.object({ productId: z.string().min(1).max(64), variant: z.string().max(200).default(""), aantal: z.number().int().min(1).max(99) }),
  z.object({ los: z.string().max(80), prijsCents: z.number().int().min(1).max(KASSA_MAX_LOS_CENTS), aantal: z.number().int().min(1).max(99) }),
]);

export const kassaVerkoopSchema = z.object({
  regels: z.array(regel).min(1, "Het mandje is leeg.").max(KASSA_MAX_REGELS),
  methode: z.enum(["contant", "pin"]),
  ontvangenCents: z.number().int().min(0).max(10_000_000).optional(),
});

export type KassaVerkoopInvoer = z.infer<typeof kassaVerkoopSchema>;

export async function verkoopInWinkel(site: SiteDoc, invoer: KassaVerkoopInvoer, now = new Date()): Promise<{ bestelling: SiteBestelling; bon: KassaBon }> {
  const w = site.winkel ?? LEGE_WINKEL;
  const uit = kassaConcept(w, invoer.regels);
  if (!uit.concept) throw AppError.validation(uit.fouten[0] ?? "Deze verkoop klopt niet.");
  const { concept } = uit;

  let kassa: NonNullable<SiteBestelling["kassa"]> = { methode: invoer.methode };
  if (invoer.methode === "contant") {
    const ontvangen = invoer.ontvangenCents ?? concept.totaalCents;
    const terug = wisselgeld(concept.totaalCents, ontvangen);
    if (terug == null) throw AppError.validation("De klant gaf minder dan het totaal.");
    kassa = { methode: "contant", ontvangenCents: ontvangen, wisselgeldCents: terug };
  }

  const bestelling = await bewaarBestelling(site.id, concept, now, { status: "afgerond", betaaldAt: now.toISOString(), kanaal: "winkel", kassa });
  // de voorraad omlaag, net als bij een bestelling in de webshop (lib/sites/bestellingen.ts): de winkel zoals hij
  // nu is opnieuw lezen, zodat een webshopbestelling of een instelling van net niet wordt overschreven.
  // Een fout hier maakt de verkoop niet ongedaan.
  if (concept.regels.some((r) => w.producten.find((p) => p.id === r.productId)?.voorraad != null)) {
    const vers = await getSite(site.id).catch(() => null);
    if (vers?.winkel) await saveWinkel(site.id, verlaagVoorraad(vers.winkel, concept.regels)).catch((err) => logger.warn("kassa: voorraad niet verlaagd", { siteId: site.id, err: String(err) }));
  }

  return { bestelling, bon: bonVanVerkoop({ ...bestelling, kassa }, site.bedrijf) };
}

export const kassaBonMailSchema = z.object({
  id: z.string().min(1).max(64),
  email: z.string().trim().toLowerCase().email("Vul een geldig e-mailadres in.").max(254),
});

/** De mail met de bon van een verkoop in de winkel (tekst en een vaste letterbreedte, zodat de bedragen netjes onder elkaar staan). */
export function kassaBonMail(bon: KassaBon, winkelEmail?: string): { subject: string; text: string; html: string } {
  const o = bonOpmaak(bon, 40);
  const regels = [...o.kop, "", ...o.regels, "", ...o.voet].join("\n");
  const subject = `Je bon van ${bon.winkel.naam}`;
  const vraag = winkelEmail ? `Vragen over je aankoop? Antwoord op deze mail, dan komt hij bij ${bon.winkel.naam}.` : "";
  return {
    subject,
    text: `${regels}${vraag ? `\n\n${vraag}` : ""}`,
    html: `<pre style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.45;color:#1a1a1a">${escapeHtml(regels)}</pre>${vraag ? `<p style="margin:16px 0 0;font-size:13px;color:#555">${escapeHtml(vraag)}</p>` : ""}`,
  };
}

/**
 * De bon van een verkoop in de winkel naar de klant mailen (Webshop → Op locatie). Alleen een
 * verkoop met kanaal "winkel" van deze site; het e-mailadres komt niet bij de verkoop of in een
 * klantenlijst (alleen in de gewone verzendlijst van sendMail). Een
 * antwoord gaat naar de winkel zelf (Reply-To), als die een e-mailadres heeft.
 */
export async function mailKassaBon(site: SiteDoc, id: string, email: string): Promise<{ verstuurd: boolean }> {
  if (!isBestelId(id)) throw AppError.notFound("Deze verkoop bestaat niet.");
  const rec = await kvGet<SiteBestelling>(bestelKey(site.id, id));
  if (!rec || rec.kanaal !== "winkel" || !rec.kassa) throw AppError.notFound("Deze verkoop bestaat niet.");
  const winkelEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(site.bedrijf.email ?? "") ? site.bedrijf.email : undefined;
  const mail = kassaBonMail(bonVanVerkoop({ ...rec, kassa: rec.kassa }, site.bedrijf), winkelEmail);
  const r = await sendMail({ to: email, ...mail, kind: "kassabon", ...(winkelEmail ? { replyTo: winkelEmail } : {}) }).catch((err: unknown) => {
    logger.warn("kassa: bon mailen mislukt", { siteId: site.id, err: String(err) });
    return null;
  });
  if (!r) throw AppError.upstream("Mailen lukte nu niet. Probeer het zo nog eens.");
  return { verstuurd: Boolean(r.delivered) };
}

/** Wat er vandaag in de winkel is verkocht (voor de kassa: het dagtotaal per betaalwijze). */
export async function kassaVandaag(siteId: string, now = new Date()): Promise<KassaDag> {
  return kassaDag(await bestellingenVan(siteId, 1000), now);
}
