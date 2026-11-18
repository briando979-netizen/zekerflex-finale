import type { Metadata } from "next";
import { VerkopenRubriekPagina } from "@/components/marketing/Verkopen";
import { canonical } from "@/lib/seo";
import { rubriek, rubriekPad } from "@/lib/shop/partnerplatform";

// Partnerplatform → beleid: de inhoud staat in lib/shop/partnerplatform.ts. Een eigen map per rubriek (geen [slug]),
// zodat de pagina in de nachtelijke rondgang en de sitemap staat.
const r = rubriek("beleid");
const title = `${r.titel} · Partnerplatform`;

export const metadata: Metadata = {
  title,
  description: r.kort,
  ...canonical(rubriekPad(r.slug), { title, description: r.kort }),
};

export default function VerkopenBeleidPage() {
  return <VerkopenRubriekPagina slug="beleid" />;
}
