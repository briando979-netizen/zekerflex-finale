import type { Metadata } from "next";
import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrderTracking } from "@/components/marketing/OrderTracking";
import { bonPad, bonToken, controleerBonToken } from "@/lib/shop/bon-token";
import { magBeoordelen } from "@/lib/shop/beoordeling";
import { teBeoordelen } from "@/lib/shop/beoordeling-server";
import type { ShopOrderLine } from "@/lib/shop/bestelling-betaald";
import { platformBankgegevens } from "@/lib/billing/overschrijving-bron";
import { shopOverschrijvingVoor } from "@/lib/shop/overschrijving";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Je bestelling", robots: { index: false } };

export default async function ShopOrderPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { id } = await props.params;
  const { t } = await props.searchParams;
  const token = typeof t === "string" ? t : undefined;
  const order = await prisma.shopOrder
    .findUnique({ where: { id }, select: { email: true, status: true, totalCents: true, stripeSessionId: true, itemsJson: true } })
    .catch(() => null);

  // De bon-link (PDF) krijgt alleen wie het token uit de mail heeft, of de
  // ingelogde klant die de bestelling onder zijn eigen e-mailadres deed.
  // Hetzelfde token opent het beoordelen (lib/shop/beoordeling.ts): alleen wie het product echt kocht.
  let bonUrl: string | null = null;
  let koperToken: string | null = null;
  if (token && controleerBonToken(id, token) === "geldig") {
    bonUrl = `/api/shop/orders/${id}/pdf?t=${encodeURIComponent(token)}`;
    koperToken = token;
  } else {
    const principal = await getPrincipal().catch(() => null);
    if (principal && order && order.email.toLowerCase() === principal.email.toLowerCase()) {
      bonUrl = bonPad(id);
      koperToken = bonToken(id);
    }
  }

  // Verzonden: de koper kan zijn producten beoordelen, op deze pagina (de link staat in de verzendmail).
  const beoordelen =
    order && koperToken && magBeoordelen(order.status)
      ? { token: koperToken, producten: await teBeoordelen(id, (order.itemsJson as ShopOrderLine[] | null) ?? []).catch(() => []) }
      : null;

  // Per overschrijving (lib/shop/overschrijving.ts): de rekening van ZekerFlex, het bedrag en het kenmerk. Geen geheim (de rekening staat
  // ook op elke factuur); het bedrag gaf de openbare status-API al.
  const bank = platformBankgegevens();
  const overschrijving = order
    ? shopOverschrijvingVoor({ iban: bank.iban, naam: bank.naam, orderId: id, totaalCents: order.totalCents, status: order.status, stripeSessionId: order.stripeSessionId })
    : null;

  return <OrderTracking orderId={id} bonUrl={bonUrl} overschrijving={overschrijving} beoordelen={beoordelen && beoordelen.producten.length ? beoordelen : null} />;
}
