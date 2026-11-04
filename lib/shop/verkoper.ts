import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvGetMany, kvListValues, kvSet } from "@/lib/storage/kv";
import { alertOwnerLater } from "@/lib/ops/alert";
import { tenantVerification } from "@/lib/company/verified";
import { deleteUpload, storeUpload } from "@/lib/storage/local";
import { partnerRekening, type PartnerRekening } from "@/lib/shop/partner";
import {
  VERKOOPVOORWAARDEN_VERSIE,
  VERKOPER_VERZENDT_BINNEN_WERKDAGEN,
  adresZichtbaar,
  isProductStatus,
  trackUrl,
  verdeelPerVerkoper,
  verkoopStatus,
  vraagtNieuweBeoordeling,
  verkoperSlug,
  type OrderRegel,
  type ProductStatus,
  type ShopOrderStatusLike,
  type VerkoopStatus,
  type VerkoperCategorie,
  type VerkoperDeel,
  type Vervoerder,
} from "@/lib/shop/verkoper-core";

// ---------------------------------------------------------------------------
// Verkopers op de marktplaats: opslag (de regels staan in verkoper-core.ts).
//   ShopProduct.sellerTenantId/sellerStatus  het product en zijn beoordeling
//   shop-verkoper:<tenantId>                  akkoord op de verkoopvoorwaarden
//   shop-verkoper-foto:<uploadId>             foto geüpload door dit bedrijf
//   shop-verkoper-order:<tenantId>:<orderId>  het deel van een bestelling
// De stand van een verkoop (versturen, onderweg, vast…) volgt telkens uit de
// bestelling zelf, dus een annulering of terugbetaling werkt vanzelf door.
// ---------------------------------------------------------------------------

const akkoordKey = (tenantId: string) => `shop-verkoper:${tenantId}`;
const fotoKey = (uploadId: string) => `shop-verkoper-foto:${uploadId}`;
const orderKey = (tenantId: string, orderId: string) => `shop-verkoper-order:${tenantId}:${orderId}`;

const MAX_PRODUCTEN = 200;
const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const base = () => env.APP_BASE_URL.replace(/\/+$/, "");

export interface VerkoperAkkoord {
  versie: number;
  op: string;
  door: string;
}

export interface VerkoperStand {
  geverifieerd: boolean;
  inControle: boolean;
  akkoord: boolean;
  magVerkopen: boolean;
}

export async function verkoperStand(tenantId: string): Promise<VerkoperStand> {
  const [v, a] = await Promise.all([tenantVerification(tenantId), kvGet<VerkoperAkkoord>(akkoordKey(tenantId))]);
  const akkoord = a?.versie === VERKOOPVOORWAARDEN_VERSIE;
  return { geverifieerd: v.verified, inControle: Boolean(v.inControle), akkoord, magVerkopen: v.verified && akkoord };
}

export async function geefAkkoord(tenantId: string, userId: string): Promise<VerkoperAkkoord> {
  const rec: VerkoperAkkoord = { versie: VERKOOPVOORWAARDEN_VERSIE, op: new Date().toISOString(), door: userId };
  await kvSet(akkoordKey(tenantId), rec);
  return rec;
}

async function eisVerkoper(tenantId: string): Promise<void> {
  const s = await verkoperStand(tenantId);
  if (!s.geverifieerd) {
    throw AppError.precondition(
      s.inControle
        ? "We controleren nog of je bij dit bedrijf hoort. Zodra dat klaar is, kun je verkopen."
        : "Laat eerst je bedrijf verifiëren met je KVK-nummer (Werkgever → Jouw start). Alleen geverifieerde bedrijven verkopen op ZekerFlex.",
    );
  }
  if (!s.akkoord) throw AppError.precondition("Ga eerst akkoord met de verkoopvoorwaarden.");
}

/** Een productfoto van een verkoper: rechtop, zonder EXIF/GPS, als WebP op ons eigen domein. */
export async function bewaarVerkoperFoto(tenantId: string, userId: string, bytes: Buffer): Promise<{ id: string }> {
  await eisVerkoper(tenantId);
  // sharp alleen laden waar een foto binnenkomt, niet in de bestel- en betaalroutes
  const { cleanImage } = await import("@/lib/media/clean-image");
  const schoon = await cleanImage(bytes, 1600);
  const stored = await storeUpload({ filename: "product.webp", mimeType: schoon.mime, bytes: schoon.bytes, uploadedById: userId });
  await kvSet(fotoKey(stored.id), { tenantId, op: new Date().toISOString() });
  return { id: stored.id };
}

/** Alleen een foto die dit bedrijf zelf via de verkopersupload plaatste, mag aan een product: anders kon elke upload (een ID-bewijs) openbaar worden. */
async function eisEigenFoto(tenantId: string, uploadId: string): Promise<void> {
  const rec = await kvGet<{ tenantId: string }>(fotoKey(uploadId));
  if (rec?.tenantId !== tenantId) throw AppError.validation("Deze foto hoort niet bij je bedrijf. Upload hem opnieuw.");
}

export interface Maat {
  maat: string;
  voorraad: number;
}

export interface NieuwProduct {
  naam: string;
  omschrijving: string;
  categorie: VerkoperCategorie;
  prijsCents: number;
  /** voorraad als er geen maten zijn */
  voorraad: number;
  /** optioneel: maten met elk hun eigen voorraad */
  maten: Maat[];
  fotoUploadId: string | null;
}

const productSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  category: true,
  priceCents: true,
  imageUrl: true,
  active: true,
  sellerStatus: true,
  sellerNote: true,
  createdAt: true,
  updatedAt: true,
  variants: { select: { id: true, size: true, stock: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ShopProductSelect;

export type VerkoperProduct = Prisma.ShopProductGetPayload<{ select: typeof productSelect }>;

export function verkoperProductDto(p: VerkoperProduct) {
  return {
    id: p.id,
    slug: p.slug,
    naam: p.name,
    omschrijving: p.description,
    categorie: p.category,
    prijsCents: p.priceCents,
    fotoUrl: p.imageUrl,
    status: (isProductStatus(p.sellerStatus) ? p.sellerStatus : "in_beoordeling") as ProductStatus,
    reden: p.sellerNote,
    varianten: p.variants.map((v) => ({ id: v.id, maat: v.size, voorraad: v.stock })),
    bijgewerkt: p.updatedAt.toISOString(),
  };
}
export type VerkoperProductDto = ReturnType<typeof verkoperProductDto>;

export async function verkoperProducten(tenantId: string): Promise<VerkoperProduct[]> {
  return prisma.shopProduct.findMany({ where: { sellerTenantId: tenantId }, orderBy: { createdAt: "desc" }, select: productSelect, take: MAX_PRODUCTEN });
}

function meldNieuwProduct(tenantId: string, bedrijf: string, naam: string): void {
  alertOwnerLater({
    key: `verkoper-product:${tenantId}`,
    title: `Product van ${bedrijf} wacht op goedkeuring`,
    detail: `${bedrijf} bood "${naam}" aan in de ZekerFlex-shop. Bekijk het en keur het goed of af in Admin → Verkopers.`,
    severity: "warning",
    url: "/admin/verkopers",
  });
}

export async function maakVerkoperProduct(tenantId: string, input: NieuwProduct): Promise<VerkoperProduct> {
  await eisVerkoper(tenantId);
  const aantal = await prisma.shopProduct.count({ where: { sellerTenantId: tenantId } });
  if (aantal >= MAX_PRODUCTEN) throw AppError.validation(`Je hebt al ${MAX_PRODUCTEN} producten. Haal er eerst een weg.`);
  if (input.fotoUploadId) await eisEigenFoto(tenantId, input.fotoUploadId);
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const uniek = randomBytes(3).toString("hex");
  const varianten =
    input.maten.length > 0
      ? input.maten.map((m, i) => ({ size: m.maat, stock: m.voorraad, sku: `vk-${uniek}-${i}` }))
      : [{ size: null, stock: input.voorraad, sku: `vk-${uniek}-0` }];
  const product = await prisma.shopProduct.create({
    data: {
      name: input.naam,
      slug: verkoperSlug(input.naam, uniek),
      description: input.omschrijving,
      category: input.categorie,
      priceCents: input.prijsCents,
      stock: varianten.reduce((s, v) => s + v.stock, 0),
      imageUploadId: input.fotoUploadId,
      imageUrl: input.fotoUploadId ? `/api/shop/media/${input.fotoUploadId}` : null,
      active: false,
      sortOrder: 1000,
      sellerTenantId: tenantId,
      sellerStatus: "in_beoordeling",
      variants: { create: varianten },
    },
    select: productSelect,
  });
  meldNieuwProduct(tenantId, tenant?.name ?? "Een verkoper", input.naam);
  return product;
}

export interface ProductWijziging {
  naam?: string;
  omschrijving?: string;
  categorie?: VerkoperCategorie;
  prijsCents?: number;
  fotoUploadId?: string;
  /** voorraad per variant-id */
  voorraad?: Record<string, number>;
  pauze?: boolean;
}

async function eigenProduct(tenantId: string, productId: string) {
  const p = await prisma.shopProduct.findFirst({
    where: { id: productId, sellerTenantId: tenantId },
    select: { id: true, name: true, sellerStatus: true, imageUploadId: true, variants: { select: { id: true } } },
  });
  if (!p) throw AppError.notFound("Dit product bestaat niet (meer).");
  return p;
}

export async function wijzigVerkoperProduct(tenantId: string, productId: string, w: ProductWijziging): Promise<VerkoperProduct> {
  await eisVerkoper(tenantId);
  const p = await eigenProduct(tenantId, productId);
  if (w.fotoUploadId) await eisEigenFoto(tenantId, w.fotoUploadId);
  const status: ProductStatus = isProductStatus(p.sellerStatus) ? p.sellerStatus : "in_beoordeling";
  let nieuw: ProductStatus = status;
  if (vraagtNieuweBeoordeling(w)) nieuw = "in_beoordeling";
  else if (w.pauze === true && status === "goedgekeurd") nieuw = "gepauzeerd";
  else if (w.pauze === false && status === "gepauzeerd") nieuw = "goedgekeurd";

  const eigenVarianten = new Set(p.variants.map((v) => v.id));
  const voorraad = Object.entries(w.voorraad ?? {}).filter(([id]) => eigenVarianten.has(id));
  await prisma.$transaction([
    ...voorraad.map(([id, n]) => prisma.shopProductVariant.update({ where: { id }, data: { stock: n } })),
    prisma.shopProduct.update({
      where: { id: p.id },
      data: {
        ...(w.naam !== undefined ? { name: w.naam } : {}),
        ...(w.omschrijving !== undefined ? { description: w.omschrijving } : {}),
        ...(w.categorie !== undefined ? { category: w.categorie } : {}),
        ...(w.prijsCents !== undefined ? { priceCents: w.prijsCents } : {}),
        ...(w.fotoUploadId !== undefined ? { imageUploadId: w.fotoUploadId, imageUrl: `/api/shop/media/${w.fotoUploadId}` } : {}),
        sellerStatus: nieuw,
        active: nieuw === "goedgekeurd",
        ...(nieuw === "in_beoordeling" ? { sellerNote: null } : {}),
      },
    }),
  ]);
  if (voorraad.length > 0) {
    const som = await prisma.shopProductVariant.aggregate({ where: { productId: p.id }, _sum: { stock: true } });
    await prisma.shopProduct.update({ where: { id: p.id }, data: { stock: som._sum.stock ?? 0 } });
  }
  if (nieuw === "in_beoordeling" && status !== "in_beoordeling") {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    meldNieuwProduct(tenantId, tenant?.name ?? "Een verkoper", w.naam ?? p.name);
  }
  // een vervangen foto is niet meer in gebruik
  if (w.fotoUploadId && p.imageUploadId && p.imageUploadId !== w.fotoUploadId) await ruimFotoOp(p.imageUploadId);
  return prisma.shopProduct.findUniqueOrThrow({ where: { id: p.id }, select: productSelect });
}

async function ruimFotoOp(uploadId: string): Promise<void> {
  await deleteUpload(uploadId).catch((err) => logger.warn("verkoper: foto niet opgeruimd", { error: (err as Error).message }));
  await kvDelete(fotoKey(uploadId)).catch(() => undefined);
}

export async function verwijderVerkoperProduct(tenantId: string, productId: string): Promise<void> {
  const p = await eigenProduct(tenantId, productId);
  await prisma.shopProduct.delete({ where: { id: p.id } });
  if (p.imageUploadId) await ruimFotoOp(p.imageUploadId);
}

// ---- beoordelen (beheer) ----------------------------------------------------

async function beheerdersVan(tenantId: string): Promise<string[]> {
  const leden = await prisma.membership.findMany({ where: { tenantId, role: "HQ_ADMIN" }, select: { user: { select: { email: true } } } });
  return [...new Set(leden.map((l) => l.user.email).filter(Boolean))];
}

async function mailBeheerders(tenantId: string, onderwerp: string, tekst: string, html: string): Promise<void> {
  const { sendMail, mailShell } = await import("@/lib/mail");
  for (const to of await beheerdersVan(tenantId)) {
    await sendMail({ to, kind: "shop-verkoper", subject: onderwerp, text: tekst, html: mailShell(onderwerp, html) }).catch((err) =>
      logger.warn("verkoper: mail niet verstuurd", { error: (err as Error).message }),
    );
  }
}

export async function teBeoordelen() {
  return prisma.shopProduct.findMany({
    where: { sellerStatus: "in_beoordeling" },
    orderBy: { updatedAt: "asc" },
    select: { ...productSelect, sellerTenantId: true, seller: { select: { id: true, name: true, kvkNumber: true } } },
    take: 200,
  });
}

export async function beoordeelProduct(productId: string, oordeel: "goedkeuren" | "afwijzen", reden: string | null): Promise<{ naam: string; tenantId: string }> {
  const p = await prisma.shopProduct.findFirst({ where: { id: productId, sellerTenantId: { not: null } }, select: { id: true, name: true, slug: true, sellerTenantId: true } });
  if (!p?.sellerTenantId) throw AppError.notFound("Dit verkopersproduct bestaat niet (meer).");
  const ok = oordeel === "goedkeuren";
  await prisma.shopProduct.update({
    where: { id: p.id },
    data: { sellerStatus: ok ? "goedgekeurd" : "afgewezen", active: ok, sellerNote: ok ? null : (reden ?? "").slice(0, 400) || "Past niet in de ZekerFlex-shop." },
  });
  const link = `${base()}/studio/verkopen`;
  if (ok) {
    await mailBeheerders(
      p.sellerTenantId,
      `"${p.name}" staat in de ZekerFlex-shop`,
      `Je product "${p.name}" is goedgekeurd en staat nu in de ZekerFlex-shop: ${base()}/shop/${p.slug}\n\nBestellingen zie je in de Websitestudio: ${link}`,
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42">Je product <strong>${esc(p.name)}</strong> is goedgekeurd en staat nu in de ZekerFlex-shop.</p>
       <p style="margin:0 0 8px"><a href="${base()}/shop/${esc(p.slug)}" style="color:#0E5C4A;font-weight:600">Bekijk het in de shop</a></p>
       <p style="margin:0;font-size:13px;color:#667469">Bestellingen zie je in de Websitestudio onder Verkopen.</p>`,
    );
  } else {
    const r = reden?.trim() || "Het past niet in de ZekerFlex-shop.";
    await mailBeheerders(
      p.sellerTenantId,
      `"${p.name}" is niet goedgekeurd`,
      `Je product "${p.name}" is niet goedgekeurd voor de ZekerFlex-shop.\n\nReden: ${r}\n\nPas het aan in de Websitestudio, dan bekijken we het opnieuw: ${link}`,
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42">Je product <strong>${esc(p.name)}</strong> is niet goedgekeurd voor de ZekerFlex-shop.</p>
       <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">Reden: ${esc(r)}</p>
       <p style="margin:0"><a href="${link}" style="color:#0E5C4A;font-weight:600">Pas het aan in de Websitestudio</a>; dan bekijken we het opnieuw.</p>`,
    );
  }
  return { naam: p.name, tenantId: p.sellerTenantId };
}

// ---- bestellingen ------------------------------------------------------------

export interface VerkoperOrder extends VerkoperDeel {
  orderId: string;
  at: string;
  zending?: { vervoerder: Vervoerder; code: string; op: string } | undefined;
  /** gezet door de beheerder bij het uitbetalen */
  uitbetaaldOp?: string | undefined;
}

/** Leg bij een nieuwe bestelling per verkoper zijn deel vast. */
export async function legVerkopersVast(orderId: string, regels: OrderRegel[], shippingCents: number, at = new Date()): Promise<VerkoperOrder[]> {
  const delen = verdeelPerVerkoper(regels, shippingCents);
  const recs = delen.map((d) => ({ ...d, orderId, at: at.toISOString() }) satisfies VerkoperOrder);
  for (const r of recs) await kvSet(orderKey(r.tenantId, orderId), r);
  return recs;
}

export interface OrderRegelMetVerkoper extends OrderRegel {
  name: string;
  imageUrl?: string | null;
}

export interface VerkoopRij extends VerkoperOrder {
  status: VerkoopStatus;
  /** alleen na betaling: naam en adres om te versturen */
  koper: { naam: string; adres: string; postcode: string; plaats: string } | null;
  producten: { naam: string; aantal: number; prijsCents: number }[];
}

/** Alle verkopen van een bedrijf met hun actuele stand, nieuwste eerst. */
export async function verkoperBestellingen(tenantId: string, now = new Date()): Promise<VerkoopRij[]> {
  const recs = await kvListValues<VerkoperOrder>(`shop-verkoper-order:${tenantId}:`, 2000);
  if (recs.length === 0) return [];
  const orders = await prisma.shopOrder.findMany({
    where: { id: { in: recs.map((r) => r.orderId) } },
    select: { id: true, status: true, createdAt: true, firstName: true, lastName: true, address: true, postalCode: true, city: true, itemsJson: true },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));
  return recs
    .map((r): VerkoopRij => {
      const o = byId.get(r.orderId);
      const status: VerkoopStatus = o ? verkoopStatus({ status: o.status as ShopOrderStatusLike, createdAt: o.createdAt }, { verzonden: Boolean(r.zending), uitbetaald: Boolean(r.uitbetaaldOp) }, now) : "vervallen";
      const regels = ((o?.itemsJson as OrderRegelMetVerkoper[] | null) ?? []).filter((l) => l.sellerTenantId === tenantId);
      return {
        ...r,
        status,
        koper: o && adresZichtbaar(status) ? { naam: `${o.firstName} ${o.lastName}`, adres: o.address, postcode: o.postalCode, plaats: o.city } : null,
        producten: regels.map((l) => ({ naam: l.name, aantal: l.qty, prijsCents: l.priceCents })),
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** De verkoper meldt dat zijn deel verstuurd is; de koper krijgt de track-en-trace. */
export async function markeerVerzonden(tenantId: string, orderId: string, vervoerder: Vervoerder, code: string): Promise<VerkoperOrder> {
  const rec = await kvGet<VerkoperOrder>(orderKey(tenantId, orderId));
  if (!rec) throw AppError.notFound("Deze bestelling hoort niet bij jouw producten.");
  const order = await prisma.shopOrder.findUnique({ where: { id: orderId } });
  if (!order) throw AppError.notFound("Deze bestelling bestaat niet (meer).");
  const status = verkoopStatus({ status: order.status as ShopOrderStatusLike, createdAt: order.createdAt }, { verzonden: Boolean(rec.zending), uitbetaald: Boolean(rec.uitbetaaldOp) });
  if (status === "wacht") throw AppError.precondition("Deze bestelling is nog niet betaald. Verstuur pas na betaling.");
  if (status === "vervallen") throw AppError.precondition("Deze bestelling is geannuleerd. Niet versturen.");
  const bijgewerkt: VerkoperOrder = { ...rec, zending: { vervoerder, code: code.trim(), op: new Date().toISOString() } };
  await kvSet(orderKey(tenantId, orderId), bijgewerkt);

  // bestaat de bestelling alleen uit verkopersproducten en is alles verstuurd, dan is hij verzonden
  const regels = (order.itemsJson as OrderRegelMetVerkoper[] | null) ?? [];
  const verkopers = [...new Set(regels.map((l) => l.sellerTenantId).filter((t): t is string => Boolean(t)))];
  if (verkopers.length > 0 && regels.every((l) => l.sellerTenantId)) {
    const delen = await kvGetMany<VerkoperOrder>(verkopers.map((t) => orderKey(t, orderId)));
    const alles = verkopers.every((t) => (t === tenantId ? true : Boolean(delen.get(orderKey(t, orderId))?.zending)));
    if (alles) {
      await prisma.shopOrder.updateMany({
        where: { id: orderId, status: { in: ["RECEIVED", "CONFIRMED"] } },
        data: { status: "SHIPPED", ...(verkopers.length === 1 ? { carrier: vervoerder, trackingNumber: code.trim() } : {}) },
      });
    }
  }

  const eigen = regels.filter((l) => l.sellerTenantId === tenantId);
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const link = trackUrl(vervoerder, code);
  const lijst = eigen.map((l) => `${l.qty}x ${l.name}`).join("\n");
  const { sendMail, mailShell } = await import("@/lib/mail");
  await sendMail({
    to: order.email,
    kind: "shop-verzonden",
    subject: "Je pakket is onderweg",
    text: `Hoi ${order.firstName},\n\n${tenant?.name ?? "De verkoper"} heeft je bestelling verstuurd met ${vervoerder}.\n\n${lijst}\n\nTrack-en-trace: ${code.trim()}${link ? `\nVolg je pakket: ${link}` : ""}\n\nBestelreferentie: ${orderId}`,
    html: mailShell(
      "Je pakket is onderweg",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${esc(order.firstName)}, ${esc(tenant?.name ?? "de verkoper")} heeft je bestelling verstuurd met ${esc(vervoerder)}.</p>
       <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${eigen.map((l) => `${l.qty}x ${esc(l.name)}`).join("<br/>")}</p>
       <p style="margin:0 0 6px;font-size:14px;color:#3C4A42">Track-en-trace: <strong>${esc(code.trim())}</strong></p>
       ${link ? `<p style="margin:0"><a href="${esc(link)}" style="color:#0E5C4A;font-weight:600">Volg je pakket</a></p>` : ""}
       <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${esc(orderId)}</p>`,
    ),
  }).catch((err) => logger.warn("verkoper: verzendmail niet verstuurd", { error: (err as Error).message }));
  return bijgewerkt;
}

/** Na betaling: elke verkoper in de bestelling krijgt een mail met wat hij moet versturen. Faalt stil. */
export async function meldVerkopersBetaald(order: { id: string; firstName: string; lastName: string; address: string; postalCode: string; city: string; itemsJson: unknown }): Promise<void> {
  try {
    const regels = (order.itemsJson as OrderRegelMetVerkoper[] | null) ?? [];
    const verkopers = [...new Set(regels.map((l) => l.sellerTenantId).filter((t): t is string => Boolean(t)))];
    for (const tenantId of verkopers) {
      const eigen = regels.filter((l) => l.sellerTenantId === tenantId);
      const rec = await kvGet<VerkoperOrder>(orderKey(tenantId, order.id));
      const lijst = eigen.map((l) => `${l.qty}x ${l.name} (${euro(l.priceCents * l.qty)})`).join("\n");
      const adres = `${order.firstName} ${order.lastName}\n${order.address}\n${order.postalCode} ${order.city}`;
      const link = `${base()}/studio/verkopen`;
      await mailBeheerders(
        tenantId,
        `Nieuwe bestelling in de ZekerFlex-shop: verstuur binnen ${VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen`,
        `Er is een betaalde bestelling met jouw producten.\n\n${lijst}\n\nVersturen naar:\n${adres}\n\n${rec ? `Jij krijgt: ${euro(rec.uitbetalingCents)} (na ${euro(rec.commissieCents)} commissie).\n\n` : ""}Meld de track-en-trace in de Websitestudio, dan krijgt de koper hem meteen: ${link}\n\nBestelreferentie: ${order.id}`,
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42">Er is een betaalde bestelling met jouw producten. Verstuur hem binnen ${VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen.</p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${eigen.map((l) => `${l.qty}x ${esc(l.name)} (${euro(l.priceCents * l.qty)})`).join("<br/>")}</p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42"><strong>Versturen naar</strong><br/>${esc(order.firstName)} ${esc(order.lastName)}<br/>${esc(order.address)}<br/>${esc(order.postalCode)} ${esc(order.city)}</p>
         ${rec ? `<p style="margin:0 0 12px;font-size:14px;color:#3C4A42">Jij krijgt <strong>${euro(rec.uitbetalingCents)}</strong> (na ${euro(rec.commissieCents)} commissie).</p>` : ""}
         <p style="margin:0"><a href="${link}" style="color:#0E5C4A;font-weight:600">Meld de track-en-trace</a></p>
         <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${esc(order.id)}</p>`,
      );
    }
  } catch (err) {
    logger.warn("verkoper: melding na betaling mislukt", { error: (err as Error).message });
  }
}

// ---- uitbetalen (beheer) -----------------------------------------------------

export interface VerkoperOverzicht {
  tenantId: string;
  bedrijf: string;
  rekening: PartnerRekening | null;
  rijen: VerkoopRij[];
}

export async function alleVerkopers(now = new Date()): Promise<VerkoperOverzicht[]> {
  const recs = await kvListValues<VerkoperOrder>("shop-verkoper-order:", 5000);
  const tenantIds = [...new Set(recs.map((r) => r.tenantId))];
  if (tenantIds.length === 0) return [];
  const [tenants, rijenPer, rekeningen] = await Promise.all([
    prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
    Promise.all(tenantIds.map(async (id) => [id, await verkoperBestellingen(id, now)] as const)),
    Promise.all(tenantIds.map(async (id) => [id, await partnerRekening(id)] as const)),
  ]);
  const naam = new Map(tenants.map((t) => [t.id, t.name]));
  const rek = new Map(rekeningen);
  return rijenPer.map(([tenantId, rijen]) => ({ tenantId, bedrijf: naam.get(tenantId) ?? "Onbekend bedrijf", rekening: rek.get(tenantId) ?? null, rijen }));
}

/** Markeer alle verkopen van dit bedrijf die vaststaan als uitbetaald. */
export async function markeerVerkoperUitbetaald(tenantId: string, now = new Date()): Promise<{ aantal: number; cents: number }> {
  const vast = (await verkoperBestellingen(tenantId, now)).filter((r) => r.status === "vast");
  let cents = 0;
  let aantal = 0;
  for (const r of vast) {
    const rec = await kvGet<VerkoperOrder>(orderKey(tenantId, r.orderId));
    if (!rec || rec.uitbetaaldOp) continue;
    await kvSet(orderKey(tenantId, r.orderId), { ...rec, uitbetaaldOp: now.toISOString() } satisfies VerkoperOrder);
    cents += rec.uitbetalingCents;
    aantal += 1;
  }
  return { aantal, cents };
}
