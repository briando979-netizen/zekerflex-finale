import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { bonToken } from "@/lib/shop/bon-token";
import { isReservedTestAddress, mailButton, mailShell, sendMail } from "@/lib/mail";
import { zakelijkeRegels } from "@/lib/shop/zakelijk";
import type { ShopOverschrijving } from "@/lib/shop/overschrijving-kenmerk";

// ---------------------------------------------------------------------------
// Wat er gebeurt als een shopbestelling betaald is: voorraad eraf en de mails (aan de shop en aan de klant). Eén plek voor de
// Stripe-webhook (app/api/webhooks/stripe/route.ts) en voor "Overschrijving ontvangen" in Beheer (15 nov 2026,
// app/api/shop/orders/[id]/betaald), zodat een betaling per overschrijving precies hetzelfde afloopt. Plus de mail bij een nieuwe
// bestelling die per overschrijving betaald wordt (lib/shop/overschrijving.ts).
// ---------------------------------------------------------------------------

const money = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const html = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface ShopOrderLine {
  name: string;
  priceCents: number;
  qty: number;
  imageUrl?: string | null;
  variantId?: string;
  size?: string | null;
  color?: string | null;
}

export interface BetaaldeBestelling {
  id: string;
  /** zakelijk bestellen (optioneel): bedrijf, btw-nummer, eigen referentie */
  companyName?: string | null;
  vatNumber?: string | null;
  reference?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  itemsJson: unknown;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}

/** Decrements variant stock for a just-paid order. Best-effort per line: if a
 * variant was oversold in the window between checkout and payment (rare race),
 * the order still gets marked paid — the customer already paid — but the
 * shortfall is recorded so admin can follow up. */
export async function decrementVariantStock(orderId: string, lines: ShopOrderLine[], actorLabel = "integration:stripe"): Promise<void> {
  const shortfalls: string[] = [];
  for (const line of lines) {
    if (!line.variantId) continue;
    const res = await prisma.shopProductVariant.updateMany({
      where: { id: line.variantId, stock: { gte: line.qty } },
      data: { stock: { decrement: line.qty } },
    });
    if (res.count === 0) shortfalls.push(`${line.name} x${line.qty}`);
  }
  if (shortfalls.length > 0) {
    logger.warn("shop order oversold", { orderId, shortfalls });
    await recordAudit({
      category: "ADMIN",
      action: "shop.order.oversold",
      actorLabel,
      summary: `Shopbestelling ${orderId} betaald maar niet genoeg voorraad voor: ${shortfalls.join(", ")}`,
      targetType: "shop-order",
      targetId: orderId,
      metadata: { shortfalls },
    });
  }
}

function regels(order: BetaaldeBestelling) {
  const lines = (order.itemsJson as ShopOrderLine[] | null) ?? [];
  const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");
  const absImg = (u: string | null | undefined) => (u ? (u.startsWith("http") ? u : `${baseUrl}${u}`) : null);
  const lineRows = lines.map((l) => `${l.qty}x ${l.name} — ${money(l.priceCents * l.qty)}`).join("\n");
  const zak = zakelijkeRegels(order);
  const zakText = zak.length ? `\n${zak.map((r) => `${r.label}: ${r.waarde}`).join("\n")}` : "";
  const zakHtml = zak.length ? `<p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${zak.map((r) => `${r.label}: ${r.waarde.replace(/</g, "&lt;")}`).join("<br/>")}</p>` : "";
  const lineRowsHtml = lines
    .map((l) => {
      const img = absImg(l.imageUrl);
      return `<tr>
        <td style="padding:6px 8px 6px 0;width:48px">${img ? `<img src="${img}" alt="" width="40" height="40" style="border-radius:8px;object-fit:cover;display:block">` : ""}</td>
        <td style="padding:6px 0">${l.qty}x ${l.name.replace(/</g, "&lt;")}</td>
        <td style="padding:6px 0;text-align:right">${money(l.priceCents * l.qty)}</td>
      </tr>`;
    })
    .join("");
  return { baseUrl, lineRows, zakText, zakHtml, lineRowsHtml };
}

/** Sends the admin notification + customer confirmation for a just-paid shop order (product photos + a link to the PDF receipt). Best-effort — never throws. */
export async function notifyShopOrderPaid(order: BetaaldeBestelling): Promise<void> {
  const { baseUrl, lineRows, zakText, zakHtml, lineRowsHtml } = regels(order);
  const pdfUrl = `${baseUrl}/api/shop/orders/${order.id}/pdf?t=${bonToken(order.id)}`;

  await sendMail({
    to: env.MAIL_ADMIN,
    replyTo: order.email,
    kind: "shop-order",
    subject: `Betaalde shopbestelling — ${order.id}`,
    text: `Betaalde bestelling via de ZekerFlex-shop\n\n${order.firstName} ${order.lastName}\n${order.email}\n${order.address}, ${order.postalCode} ${order.city}${zakText}\n\n${lineRows}\n\nSubtotaal: ${money(order.subtotalCents)}\nVerzending: ${order.shippingCents === 0 ? "Gratis" : money(order.shippingCents)}\nTotaal: ${money(order.totalCents)}\n\nBestelreferentie: ${order.id}`,
    html: mailShell(
      "Betaalde shopbestelling",
      `<p style="margin:0 0 4px"><strong>${order.firstName} ${order.lastName}</strong></p>
       <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${order.email}<br/>${order.address}, ${order.postalCode} ${order.city}</p>
       ${zakHtml}
       <table style="width:100%;font-size:14px;color:#3C4A42">${lineRowsHtml}</table>
       <p style="margin:10px 0 0;font-size:14px;color:#3C4A42">Totaal: <strong>${money(order.totalCents)}</strong></p>
       <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${order.id}</p>`,
    ),
  }).catch((e) => logger.warn("shop order notify failed", { error: (e as Error).message }));

  await sendMail({
    to: order.email,
    from: env.MAIL_FROM,
    kind: "shop-order-bevestiging",
    subject: "Je betaling is gelukt — bestelling bij de ZekerFlex-shop",
    text: `Hoi ${order.firstName},\n\nBedankt voor je bestelling, je betaling is gelukt. We gaan 'm inpakken.\n\n${lineRows}\n\nTotaal: ${money(order.totalCents)}${zakText}\n\nBestelreferentie: ${order.id}\nFactuur (PDF): ${pdfUrl}`,
    html: mailShell(
      "Betaling gelukt",
      `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${order.firstName}, bedankt voor je bestelling — je betaling is gelukt. We gaan 'm inpakken.</p>
       <table style="width:100%;font-size:14px;color:#3C4A42">${lineRowsHtml}</table>
       <p style="margin:10px 0 0;font-size:14px;color:#3C4A42">Totaal: <strong>${money(order.totalCents)}</strong></p>
       ${zakHtml ? `<div style="margin-top:12px">${zakHtml}</div>` : ""}
       <p style="margin:14px 0 0"><a href="${pdfUrl}" style="font-size:13px;color:#0E5C4A;font-weight:600">Download je factuur (PDF)</a></p>
       <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${order.id}</p>`,
    ),
  }).catch((e) => logger.warn("shop order confirmation failed", { error: (e as Error).message }));
}

/**
 * Een nieuwe bestelling die per overschrijving betaald wordt: de klant krijgt de rekening, het bedrag en het kenmerk (en de link naar
 * de bestelpagina, waar het ook staat); de shop krijgt een seintje dat er een overschrijving aankomt. Dat seintje gaat naar een echt
 * intern adres, dus niet voor een testadres (AGENTS.md). Best-effort: gooit nooit.
 */
export async function meldOverschrijvingBesteld(order: BetaaldeBestelling, o: ShopOverschrijving): Promise<void> {
  const { baseUrl, lineRows, zakText, zakHtml, lineRowsHtml } = regels(order);
  const pagina = `${baseUrl}/shop/bestelling/${order.id}?t=${bonToken(order.id)}`;
  const gegevens = [`Rekeninghouder: ${o.naam}`, `IBAN: ${o.ibanLeesbaar}`, `Bedrag: ${money(o.bedragCents)}`, `Omschrijving: ${o.kenmerk}`];

  await sendMail({
    to: order.email,
    from: env.MAIL_FROM,
    kind: "shop-order-bevestiging",
    subject: `Je bestelling staat klaar — maak ${money(o.bedragCents)} over`,
    text: `Hoi ${order.firstName},\n\nBedankt voor je bestelling. Je betaalt per bankoverschrijving:\n\n${gegevens.join("\n")}\n\nZet ${o.kenmerk} in de omschrijving, dan herkennen we je betaling. Maak het bedrag binnen ${o.termijnDagen} dagen over. Zodra je betaling binnen is, pakken we je bestelling in en krijg je een mail.\n\n${lineRows}\n\nTotaal: ${money(order.totalCents)}${zakText}\n\nJe bestelling bekijken: ${pagina}\nBestelreferentie: ${order.id}`,
    html: mailShell(
      "Je bestelling staat klaar",
      `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${html(order.firstName)}, bedankt voor je bestelling. Je betaalt per bankoverschrijving:</p>
       <table style="width:100%;font-size:14px;color:#1F2A24;background:#FFF8E6;border-radius:10px;padding:10px 12px;margin:0 0 14px">
         <tr><td style="padding:3px 0;color:#667469">Rekeninghouder</td><td style="padding:3px 0;text-align:right"><strong>${html(o.naam)}</strong></td></tr>
         <tr><td style="padding:3px 0;color:#667469">IBAN</td><td style="padding:3px 0;text-align:right"><strong>${o.ibanLeesbaar}</strong></td></tr>
         <tr><td style="padding:3px 0;color:#667469">Bedrag</td><td style="padding:3px 0;text-align:right"><strong>${money(o.bedragCents)}</strong></td></tr>
         <tr><td style="padding:3px 0;color:#667469">Omschrijving</td><td style="padding:3px 0;text-align:right"><strong>${o.kenmerk}</strong></td></tr>
       </table>
       <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#3C4A42">Zet <strong>${o.kenmerk}</strong> in de omschrijving, dan herkennen we je betaling. Maak het bedrag binnen ${o.termijnDagen} dagen over. Zodra je betaling binnen is, pakken we je bestelling in en krijg je een mail.</p>
       <table style="width:100%;font-size:14px;color:#3C4A42">${lineRowsHtml}</table>
       <p style="margin:10px 0 0;font-size:14px;color:#3C4A42">Totaal: <strong>${money(order.totalCents)}</strong></p>
       ${zakHtml ? `<div style="margin-top:12px">${zakHtml}</div>` : ""}
       <p style="margin:18px 0 0">${mailButton(pagina, "Bekijk je bestelling")}</p>
       <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${order.id}</p>`,
    ),
  }).catch((e) => logger.warn("shop order transfer mail failed", { error: (e as Error).message }));

  if (isReservedTestAddress(order.email)) return;
  await sendMail({
    to: env.MAIL_ADMIN,
    replyTo: order.email,
    kind: "shop-order",
    subject: `Nieuwe shopbestelling, wacht op overschrijving — ${o.kenmerk}`,
    text: `Nieuwe bestelling via de ZekerFlex-shop, betaald per overschrijving.\n\nKenmerk: ${o.kenmerk}\nBedrag: ${money(o.bedragCents)}\n\n${order.firstName} ${order.lastName}\n${order.address}, ${order.postalCode} ${order.city}${zakText}\n\n${lineRows}\n\nZie je de betaling op de rekening, zet de bestelling dan in Beheer → Webshop op "Overschrijving ontvangen". Daarna gaan de voorraad en de bevestiging vanzelf.\n\nBestelreferentie: ${order.id}`,
    html: mailShell(
      "Wacht op overschrijving",
      `<p style="margin:0 0 8px;font-size:14px;color:#3C4A42">Kenmerk <strong>${o.kenmerk}</strong> · ${money(o.bedragCents)}</p>
       <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${html(order.firstName)} ${html(order.lastName)}<br/>${html(order.address)}, ${html(order.postalCode)} ${html(order.city)}</p>
       ${zakHtml}
       <table style="width:100%;font-size:14px;color:#3C4A42">${lineRowsHtml}</table>
       <p style="margin:12px 0 0;font-size:14px;color:#3C4A42">Zie je de betaling op de rekening, zet de bestelling dan in Beheer → Webshop op <strong>Overschrijving ontvangen</strong>.</p>
       <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${order.id}</p>`,
    ),
  }).catch((e) => logger.warn("shop order transfer notify failed", { error: (e as Error).message }));
}
