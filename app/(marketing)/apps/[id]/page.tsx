import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstallAppButton } from "@/components/marketing/InstallAppButton";
import { canonical } from "@/lib/seo";
import { ZF_APPS, appVan } from "@/lib/apps/catalogus";

export const dynamicParams = false;

export function generateStaticParams() {
  return ZF_APPS.filter((a) => a.beschikbaar).map((a) => ({ id: a.id }));
}

// De installeerpagina van één app (lib/apps/catalogus.ts). Het manifest van deze pagina is dat van de app zelf, dus
// "Installeer de app" zet precies deze app op het beginscherm, met zijn eigen naam, kleur, icoon en beginscherm.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const a = appVan((await params).id);
  if (!a) return {};
  const title = `${a.naam}: de app`;
  const description = `${a.voorWie}. ${a.uitleg}`;
  return {
    title,
    description,
    manifest: `/apps/${a.id}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: a.kort, statusBarStyle: "default" },
    icons: { apple: `/apps/${a.id}/icoon.png?maat=192` },
    ...canonical(`/apps/${a.id}`, { title, description }),
  };
}

export default async function AppPage({ params }: { params: Promise<{ id: string }> }) {
  const a = appVan((await params).id);
  if (!a) notFound();
  return (
    <>
      <section className="text-white" style={{ background: a.kleur }}>
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 md:py-20">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/apps/${a.id}/icoon.png?maat=192`} alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-2xl shadow-lg" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-white/75">{a.voorWie}</p>
              <h1 className="font-display text-3xl font-bold leading-tight md:text-4xl">{a.naam}</h1>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-lg text-white/90">{a.uitleg}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <InstallAppButton />
            {/* in de browser zonder het app-label in het adres: dat is voor de geïnstalleerde app */}
            <Link href={a.start.split("?")[0] ?? a.start} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold" style={{ color: a.kleur }}>
              Openen in de browser
            </Link>
          </div>
          <p className="mt-4 max-w-xl text-sm text-white/75">
            Zie je geen knop om te installeren? Op een Android-telefoon kies je in Chrome het menu (de drie puntjes) en dan
            &ldquo;App installeren&rdquo;. Op een iPhone tik je in Safari op Deel en kies je &ldquo;Zet op beginscherm&rdquo;.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h2 className="font-display text-lg font-bold text-ink">Andere apps van ZekerFlex</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {ZF_APPS.filter((x) => x.beschikbaar && x.id !== a.id).map((x) => (
            <li key={x.id}>
              <Link href={`/apps/${x.id}`} className="inline-block rounded-full border border-hairstrong bg-white px-3 py-1 text-sm text-neutralx-700 hover:border-brand-500">
                {x.naam}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
