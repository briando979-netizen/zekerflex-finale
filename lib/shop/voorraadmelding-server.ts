import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { mailButton, mailShell, sendMail } from "@/lib/mail";
import { escapeHtml } from "@/lib/mail/vorm";
import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import {
  VOORRAAD_PREFIX,
  nogGeldig,
  variantNaam,
  voegAanvraagToe,
  voorraadPad,
  voorraadSleutel,
  type VoorraadActie,
  type VoorraadAanvraag,
  type VoorraadLijst,
} from "@/lib/shop/voorraadmelding";

// "Laat me weten als hij er weer is" (lib/shop/voorraadmelding.ts): aanmelden met bevestiging, afmelden, de ronde die mailt,
// en inzage en wissen per e-mailadres (lib/privacy). Een e-mailadres komt in geen log en in geen link.

const SIG_LENGTE = 32;

export function voorraadHandtekening(actie: VoorraadActie, variantId: string, aanvraagId: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`shop-voorraad|${actie}|${variantId}|${aanvraagId}`).digest("base64url").slice(0, SIG_LENGTE);
}

export function klopt(actie: VoorraadActie, variantId: string, aanvraagId: string, handtekening: string): boolean {
  const verwacht = Buffer.from(voorraadHandtekening(actie, variantId, aanvraagId));
  const gegeven = Buffer.from(handtekening);
  return verwacht.length === gegeven.length && timingSafeEqual(verwacht, gegeven);
}

const basis = () => env.APP_BASE_URL.replace(/\/+$/, "");

async function variantInfo(variantId: string) {
  return prisma.shopProductVariant.findUnique({
    where: { id: variantId },
    select: { size: true, color: true, stock: true, product: { select: { name: true, slug: true, active: true } } },
  });
}

export type AanmeldUitslag = "bevestig" | "wacht-op-bevestiging" | "stond-er-al" | "op-voorraad" | "onbekend" | "vol";

/** Aanmelden: nieuw = onbevestigd bewaren en de bevestigingsmail sturen (met afmeldlink). */
export async function meldAanVoorVoorraad(variantId: string, email: string, taal: "nl" | "en", nu = new Date()): Promise<AanmeldUitslag> {
  const v = await variantInfo(variantId);
  if (!v || !v.product.active) return "onbekend";
  if (v.stock > 0) return "op-voorraad";
  const sleutel = voorraadSleutel(variantId);
  const oud = await kvGet<VoorraadLijst>(sleutel);
  const aanvraag: VoorraadAanvraag = { id: randomBytes(9).toString("base64url"), email, at: nu.toISOString(), taal, bevestigd: false };
  const { lijst, nieuw, vol, bestaand } = voegAanvraagToe(oud ? { aanvragen: nogGeldig(oud, nu) } : null, aanvraag);
  if (vol) return "vol";
  if (bestaand) return bestaand.bevestigd ? "stond-er-al" : "wacht-op-bevestiging";
  if (!nieuw) return "vol";
  await kvSet(sleutel, lijst);
  const naam = variantNaam(v.product.name, v.size, v.color);
  const en = taal === "en";
  const ja = `${basis()}${voorraadPad("ja", variantId, aanvraag.id, voorraadHandtekening("ja", variantId, aanvraag.id))}`;
  const af = `${basis()}${voorraadPad("af", variantId, aanvraag.id, voorraadHandtekening("af", variantId, aanvraag.id))}`;
  await sendMail({
    to: email,
    from: env.MAIL_FROM,
    kind: "shop-voorraadmelding-bevestig",
    subject: en ? `Confirm: let me know when ${naam} is back` : `Bevestig: seintje als ${naam} er weer is`,
    text: en
      ? `You asked us to email you when ${naam} is back in stock at the ZekerFlex shop. Confirm here:\n\n${ja}\n\nDidn't ask for this, or changed your mind? Unsubscribe: ${af}\nWithout confirmation we delete your address within 3 days.`
      : `Je vroeg ons om een mail als ${naam} weer op voorraad is in de ZekerFlex-shop. Bevestig het hier:\n\n${ja}\n\nNiet aangevraagd, of toch niet nodig? Afmelden: ${af}\nZonder bevestiging wissen we je adres binnen 3 dagen.`,
    html: mailShell(
      en ? "Confirm your request" : "Bevestig je aanvraag",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${en ? "You asked us to email you when" : "Je vroeg ons om een mail als"} <strong>${escapeHtml(naam)}</strong> ${en ? "is back in stock." : "weer op voorraad is."}</p>
       <p style="margin:0 0 20px">${mailButton(ja, en ? "Yes, let me know" : "Ja, laat het me weten")}</p>
       <p style="margin:12px 0 0;font-size:12px;color:#667469">${en ? "Didn't ask for this, or changed your mind?" : "Niet aangevraagd, of toch niet nodig?"} <a href="${escapeHtml(af)}" style="color:#667469">${en ? "Unsubscribe" : "Afmelden"}</a>. ${en ? "Without confirmation we delete your address within 3 days." : "Zonder bevestiging wissen we je adres binnen 3 dagen."}</p>`,
    ),
  }).catch((e) => logger.warn("voorraadmelding: bevestigingsmail mislukt", { error: (e as Error).message }));
  return "bevestig";
}

export type LinkUitslag = { ok: true; product: { name: string; slug: string } | null } | { ok: false };

/** Bevestigen of afmelden via de link uit de mail (handtekening over maat, code en actie). */
export async function verwerkVoorraadLink(actie: VoorraadActie, variantId: string, aanvraagId: string, handtekening: string): Promise<LinkUitslag> {
  if (!klopt(actie, variantId, aanvraagId, handtekening)) return { ok: false };
  const sleutel = voorraadSleutel(variantId);
  const lijst = await kvGet<VoorraadLijst>(sleutel);
  const v = await variantInfo(variantId);
  const product = v ? { name: v.product.name, slug: v.product.slug } : null;
  const aanvragen = lijst?.aanvragen ?? [];
  const hier = aanvragen.find((a) => a.id === aanvraagId);
  if (actie === "af") {
    // al weg (eerder afgemeld, verlopen of gemaild) is ook goed
    if (hier) {
      const rest = aanvragen.filter((a) => a.id !== aanvraagId);
      if (rest.length) await kvSet(sleutel, { aanvragen: rest });
      else await kvDelete(sleutel);
    }
    return { ok: true, product };
  }
  if (!hier) return { ok: false };
  if (!hier.bevestigd) await kvSet(sleutel, { aanvragen: aanvragen.map((a) => (a.id === aanvraagId ? { ...a, bevestigd: true, at: new Date().toISOString() } : a)) });
  return { ok: true, product };
}

export interface RondeUitslag {
  gemaild: number;
  verlopen: number;
  wachtend: number;
}

/** De ronde (elk kwartier): weer op voorraad → één mail per bevestigde aanvraag en die weg; verlopen of product weg → opruimen. */
export async function stuurVoorraadMeldingen(nu = new Date()): Promise<RondeUitslag> {
  const regels = await kvListEntries<VoorraadLijst>(VOORRAAD_PREFIX, 1000);
  const uit: RondeUitslag = { gemaild: 0, verlopen: 0, wachtend: 0 };
  if (!regels.length) return uit;
  const ids = regels.map((r) => r.key.slice(VOORRAAD_PREFIX.length));
  const varianten = await prisma.shopProductVariant.findMany({
    where: { id: { in: ids } },
    select: { id: true, size: true, color: true, stock: true, product: { select: { name: true, slug: true, active: true } } },
  });
  const perId = new Map(varianten.map((v) => [v.id, v]));
  for (const r of regels) {
    const id = r.key.slice(VOORRAAD_PREFIX.length);
    const v = perId.get(id);
    const alle = r.value?.aanvragen ?? [];
    const geldig = nogGeldig(r.value, nu);
    uit.verlopen += alle.length - geldig.length;
    if (!v || geldig.length === 0) {
      await kvDelete(r.key);
      continue;
    }
    const bevestigd = geldig.filter((a) => a.bevestigd);
    if (v.stock <= 0 || !v.product.active || bevestigd.length === 0) {
      if (geldig.length !== alle.length) await kvSet(r.key, { aanvragen: geldig });
      uit.wachtend += geldig.length;
      continue;
    }
    // eerst de bevestigde weg, dan mailen: een tweede ronde tegelijk (of een fout halverwege) mailt nooit dubbel
    const blijft = geldig.filter((a) => !a.bevestigd);
    if (blijft.length) await kvSet(r.key, { aanvragen: blijft });
    else await kvDelete(r.key);
    uit.wachtend += blijft.length;
    const naam = variantNaam(v.product.name, v.size, v.color);
    const link = `${basis()}/shop/${v.product.slug}`;
    for (const a of bevestigd) {
      const en = a.taal === "en";
      const titel = en ? "Back in stock" : "Weer op voorraad";
      await sendMail({
        to: a.email,
        from: env.MAIL_FROM,
        kind: "shop-voorraadmelding",
        subject: `${titel}: ${naam}`,
        text: en
          ? `Good news: ${naam} is back in stock at the ZekerFlex shop.\n\n${link}\n\nThis was the only email about it: your request is now deleted.`
          : `Goed nieuws: ${naam} is weer op voorraad in de ZekerFlex-shop.\n\n${link}\n\nDit was de enige mail hierover: je aanvraag is nu gewist.`,
        html: mailShell(
          titel,
          `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${en ? "Good news" : "Goed nieuws"}: <strong>${escapeHtml(naam)}</strong> ${en ? "is back in stock." : "is weer op voorraad."}</p>
           <p style="margin:0 0 20px">${mailButton(link, en ? "View the product" : "Bekijk het product")}</p>
           <p style="margin:12px 0 0;font-size:12px;color:#667469">${en ? "This was the only email about it: your request is now deleted." : "Dit was de enige mail hierover: je aanvraag is nu gewist."}</p>`,
        ),
      })
        .then(() => {
          uit.gemaild += 1;
        })
        .catch((e) => logger.warn("voorraadmelding: mail mislukt", { error: (e as Error).message }));
    }
  }
  return uit;
}

/** Inzage (lib/privacy/export.ts): de aanvragen van dit adres, met product, maat en kleur. */
export async function voorraadmeldingenVan(email: string): Promise<{ product: string; sinds: string; bevestigd: boolean }[]> {
  const doel = email.trim().toLowerCase();
  const regels = await kvListEntries<VoorraadLijst>(VOORRAAD_PREFIX, 1000);
  const eigen = regels.flatMap((r) => (r.value?.aanvragen ?? []).filter((a) => a.email === doel).map((a) => ({ variantId: r.key.slice(VOORRAAD_PREFIX.length), a })));
  if (!eigen.length) return [];
  const varianten = await prisma.shopProductVariant.findMany({
    where: { id: { in: eigen.map((e) => e.variantId) } },
    select: { id: true, size: true, color: true, product: { select: { name: true } } },
  });
  const perId = new Map(varianten.map((v) => [v.id, v]));
  return eigen.map(({ variantId, a }) => {
    const v = perId.get(variantId);
    return { product: v ? variantNaam(v.product.name, v.size, v.color) : variantId, sinds: a.at, bevestigd: a.bevestigd };
  });
}

/** Wissen (lib/privacy/anonymize.ts): dit adres uit elke lijst; geeft het aantal gewiste aanvragen. */
export async function wisVoorraadmeldingenVan(email: string): Promise<number> {
  const doel = email.trim().toLowerCase();
  const regels = await kvListEntries<VoorraadLijst>(VOORRAAD_PREFIX, 1000);
  let gewist = 0;
  for (const r of regels) {
    const alle = r.value?.aanvragen ?? [];
    const rest = alle.filter((a) => a.email !== doel);
    if (rest.length === alle.length) continue;
    gewist += alle.length - rest.length;
    if (rest.length) await kvSet(r.key, { aanvragen: rest });
    else await kvDelete(r.key);
  }
  return gewist;
}
