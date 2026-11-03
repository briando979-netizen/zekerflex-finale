import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { notFound } from "next/navigation";
import { laadRijschool } from "@/lib/rijschool/pagina";
import { websiteVan } from "@/lib/rijschool/website";

// De omlijsting van alles onder /rijschool/<slug>: de kleuren van de rijschool
// als CSS-variabelen, en de naam van de rijschool in de titel. Niet in Google
// zolang de website niet online staat.

type Props = { children: ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await laadRijschool((await params).slug);
  if (!r) return {};
  return {
    title: { default: r.naam, template: `%s · ${r.naam}` },
    description: websiteVan(r.website, r).intro,
    applicationName: r.naam,
    appleWebApp: { capable: true, title: r.naam, statusBarStyle: "default" },
    robots: r.online ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: `/rijschool/${r.slug}` },
    // eigen app op het beginscherm: naam, icoon en kleur van de rijschool
    manifest: `/rijschool/${r.slug}/manifest.webmanifest`,
    icons: { apple: `/rijschool/${r.slug}/app-icoon.png?maat=192` },
    openGraph: { title: r.naam, siteName: r.naam, type: "website", locale: "nl_NL" },
  };
}

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const r = await laadRijschool((await params).slug);
  return r ? { themeColor: r.kleur } : {};
}

export default async function RijschoolLayout({ children, params }: Props) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  const stijl = { "--rs-kleur": r.kleur, "--rs-accent": r.accent } as CSSProperties;
  return (
    <div style={stijl} className="min-h-screen bg-paper text-ink">
      {children}
    </div>
  );
}
