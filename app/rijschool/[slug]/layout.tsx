import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { notFound } from "next/navigation";
import { laadRijschool } from "@/lib/rijschool/pagina";
import { websiteVan } from "@/lib/rijschool/website";
import { siteKleuren } from "@/lib/rijschool/kleuren";
import { eigenAdres } from "@/lib/rijschool/domein";
import { deelbeeldUrl, DEELBEELD } from "@/lib/rijschool/deelbeeld";

// De omlijsting van alles onder /rijschool/<slug>: de kleuren van de rijschool
// als CSS-variabelen, en de naam van de rijschool in de titel. Niet in Google
// zolang de website niet online staat.

type Props = { children: ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await laadRijschool((await params).slug);
  if (!r) return {};
  // met een actief eigen domein is dat het hoofdadres (lib/rijschool/domein.ts)
  const [eigen, beeld] = await Promise.all([eigenAdres(r.id), deelbeeldUrl(r)]);
  const intro = websiteVan(r.website, r).intro;
  // het deelbeeld op het hoofdadres (zonder eigen domein vult metadataBase zekerflex.com aan)
  const deelbeeld = { url: `${eigen ?? ""}${beeld}`, width: DEELBEELD.breed, height: DEELBEELD.hoog, alt: r.naam };
  return {
    title: { default: r.naam, template: `%s · ${r.naam}` },
    description: intro,
    applicationName: r.naam,
    appleWebApp: { capable: true, title: r.naam, statusBarStyle: "default" },
    robots: r.online ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: eigen ? `${eigen}/` : `/rijschool/${r.slug}` },
    // eigen app op het beginscherm: naam, icoon en kleur van de rijschool
    manifest: `/rijschool/${r.slug}/manifest.webmanifest`,
    // het icoon van de rijschool in het tabblad en bij Google (anders geen enkel icoon)
    icons: {
      icon: [{ url: `/rijschool/${r.slug}/app-icoon.png?maat=192`, type: "image/png", sizes: "192x192" }],
      apple: `/rijschool/${r.slug}/app-icoon.png?maat=192`,
    },
    // delen via WhatsApp, Facebook, LinkedIn en X: naam, tekst en beeld van de rijschool, niet van ZekerFlex
    openGraph: { title: r.naam, description: intro, siteName: r.naam, type: "website", locale: "nl_NL", images: [deelbeeld] },
    twitter: { card: "summary_large_image", title: r.naam, description: intro, images: [deelbeeld] },
  };
}

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const r = await laadRijschool((await params).slug);
  return r ? { themeColor: r.kleur } : {};
}

export default async function RijschoolLayout({ children, params }: Props) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  // de kleuren van de rijschool, met leesbare tekstkleuren erbij (lib/rijschool/kleuren.ts)
  const stijl = siteKleuren(r) as CSSProperties;
  return (
    <div style={stijl} className="min-h-screen bg-paper text-ink">
      {children}
    </div>
  );
}
