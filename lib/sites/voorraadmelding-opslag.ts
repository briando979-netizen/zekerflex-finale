import { formDataBegrensd } from "@/lib/http/body-grens";
import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { kvDelete, kvDeleteStale, kvListEntries, kvListKeys, kvSet } from "@/lib/storage/kv";
import { siteText, type ServeOptions } from "@/lib/sites/serve";
import { siteAdres } from "@/lib/sites/adres";
import type { LiveSite } from "@/lib/sites/store";
import type { SiteDoc } from "@/lib/sites/types";
import { isUitverkocht, winkelVan, zichtbareProducten } from "@/lib/sites/winkel";
import { BEWAAR_DAGEN, MAX_WACHTENDEN, VOORRAADMELDING_PREFIX, bestelbaar, leesEmail, telPerProduct, voorraadMail, type Wachtende } from "@/lib/sites/voorraadmelding";

// ---------------------------------------------------------------------------
// "Mail me als het er weer is": opslag, het formulier en de mails (de regels:
// lib/sites/voorraadmelding.ts).
//   KV "site-voorraadmelding:<siteId>:<productId>:<code>" — { email, at }
// De code is een hash van het adres, zodat wie zich twee keer aanmeldt één keer
// op de lijst staat. Een adres wordt voor één ding bewaard en is daarna weg: na
// de mail, als het product uit de winkel gaat, of na een half jaar (elke nacht,
// app/api/internal/sitechat/opruimen). Het bedrijf ziet alleen aantallen; een
// adres komt nooit in een lijst of in het logboek.
// ---------------------------------------------------------------------------

const DAG = 86_400_000;
const sitePrefix = (siteId: string) => `${VOORRAADMELDING_PREFIX}${siteId}:`;
const productPrefix = (siteId: string, productId: string) => `${sitePrefix(siteId)}${productId}:`;
const sleutel = (siteId: string, productId: string, email: string) => `${productPrefix(siteId, productId)}${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;

/** Op de lijst zetten; "vol" als er al MAX_WACHTENDEN anderen op dit product wachten. */
export async function meldAan(siteId: string, productId: string, email: string, nu = new Date()): Promise<"bewaard" | "vol"> {
  const key = sleutel(siteId, productId, email);
  const bestaand = await kvListKeys(productPrefix(siteId, productId), MAX_WACHTENDEN + 1);
  if (bestaand.length >= MAX_WACHTENDEN && !bestaand.includes(key)) return "vol";
  await kvSet(key, { email, at: nu.toISOString() } satisfies Wachtende);
  return "bewaard";
}

/** Hoeveel mensen per product van deze site wachten (geen adressen). */
export async function wachtlijstVan(siteId: string): Promise<Map<string, number>> {
  // 300 aanmeldingen per dag per site (de rate limit hieronder): ruim genoeg voor een half jaar
  return telPerProduct(await kvListKeys(sitePrefix(siteId), 60_000), siteId);
}

/** De wachtlijsten van producten die uit de winkel zijn gehaald: weg. */
export async function wisWachtlijsten(siteId: string, productIds: string[]): Promise<number> {
  let gewist = 0;
  for (const id of productIds) {
    for (const k of await kvListKeys(productPrefix(siteId, id), MAX_WACHTENDEN * 2)) {
      await kvDelete(k);
      gewist++;
    }
  }
  return gewist;
}

// twee opslagen kort na elkaar mogen niemand twee keer mailen (Next bundelt routes apart: via globalThis)
const bezig = ((globalThis as typeof globalThis & { __zfVoorraadMelding?: Set<string> }).__zfVoorraadMelding ??= new Set<string>());

/**
 * De mails voor producten die weer te bestellen zijn: één per wachtende, daarna is zijn adres weg.
 * Alleen voor een site die online staat (anders werkt de link in de mail niet; de lijst blijft dan staan).
 */
export async function stuurVoorraadMeldingen(site: Pick<SiteDoc, "id" | "slug" | "liveBuild" | "bedrijf" | "winkel">, productIds: string[]): Promise<{ verstuurd: number }> {
  if (!site.liveBuild || !productIds.length) return { verstuurd: 0 };
  const { adres } = await siteAdres(site);
  let verstuurd = 0;
  for (const id of productIds) {
    const p = winkelVan(site).producten.find((x) => x.id === id);
    const slot = `${site.id}:${id}`;
    if (!p || !bestelbaar(p) || bezig.has(slot)) continue;
    bezig.add(slot);
    try {
      for (const { key, value } of await kvListEntries<Wachtende>(productPrefix(site.id, id), MAX_WACHTENDEN * 2)) {
        // eerst van de lijst: zo krijgt niemand twee mails, ook niet als iets halverwege misgaat
        await kvDelete(key);
        const email = leesEmail(value?.email);
        if (!email) continue;
        const mail = voorraadMail({ product: p.naam, winkel: site.bedrijf.naam, link: `${adres}/p/${p.slug}`, sinds: value.at });
        const uit = await sendMail({ to: email, kind: "site-voorraadmelding", subject: mail.onderwerp, text: mail.tekst }).catch(() => null);
        if (uit) verstuurd++;
      }
    } finally {
      bezig.delete(slot);
    }
  }
  if (verstuurd) logger.info("site back-in-stock mails sent", { siteId: site.id, verstuurd });
  return { verstuurd };
}

/** Elke nacht: wachtenden van wie het product een half jaar niet terugkwam, van alle sites. */
export async function ruimVerlopenVoorraadmeldingenOp(nu = Date.now()): Promise<{ gewist: number }> {
  return { gewist: await kvDeleteStale(VOORRAADMELDING_PREFIX, new Date(nu - BEWAAR_DAGEN * DAG)) };
}

/**
 * POST …/_zf/voorraadmelding (p = product-id, email, website = honeypot): rate limits, dan op de lijst
 * en terug naar de productpagina met ?gemeld=1. Een voorbeeld of voorstel bewaart nooit iets.
 */
export async function handleVoorraadMelding(request: Request, live: LiveSite, opts: Pick<ServeOptions, "origin" | "noindex" | "root">): Promise<Response> {
  const terug = (pad: string) => new Response(null, { status: 303, headers: { Location: `${opts.root}${pad}`, "Cache-Control": "no-store" } });
  if (live.snapshot.voorbeeld || live.snapshot.voorstel) return siteText("Dit is een voorbeeld: er wordt niets bewaard of verstuurd.", 400, opts);
  try {
    await enforceRateLimit({ name: "site-voorraadmelding-ip", identifier: privateRateLimitIdentifier(clientIp(request)), limit: 10, windowSeconds: 600, message: "Te veel aanmeldingen. Probeer het later opnieuw." });
    await enforceRateLimit({ name: "site-voorraadmelding-site", identifier: live.siteId, limit: 300, windowSeconds: 86_400, message: "Deze winkel neemt vandaag geen aanmeldingen meer aan." });
  } catch {
    return siteText("Te veel aanmeldingen in korte tijd. Probeer het later opnieuw.", 429, opts);
  }
  // een tekstformulier: begrensd ingelezen (12 nov), de server laat anders tot 25 MB door
  const form = await formDataBegrensd(request, 64_000).catch(() => null);
  if (!form) return siteText("Ongeldig formulier.", 400, opts);
  const p = zichtbareProducten(winkelVan(live.snapshot)).find((x) => x.id === String(form.get("p") ?? ""));
  if (!p) return terug("winkel");
  const gemeld = terug(`p/${p.slug}?gemeld=1#vm`);
  // honeypot: mensen vullen het verborgen veld nooit in, bots wel: doe alsof het lukte
  if (String(form.get("website") ?? "").trim()) return gemeld;
  // intussen weer op voorraad: dan valt er niets te melden
  if (!isUitverkocht(p)) return terug(`p/${p.slug}`);
  const email = leesEmail(form.get("email"));
  if (!email) return siteText("Vul een geldig e-mailadres in. Ga terug en probeer het opnieuw.", 400, opts);
  if ((await meldAan(live.siteId, p.id, email)) === "vol") return siteText("Er wachten al veel mensen op dit product. Vraag de winkel wanneer het er weer is.", 429, opts);
  return gemeld;
}
