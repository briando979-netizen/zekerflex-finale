import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { canonical } from "@/lib/seo";
import { ZF_APPS } from "@/lib/apps/catalogus";
import { robotsVerborgen } from "@/lib/seo/verbergen";

// De apps van ZekerFlex per doelgroep (15 nov 2026): een overzicht met per app een eigen installeerpagina.
const title = "De apps van ZekerFlex";
const description = "Een eigen app voor je werk: voor flexwerkers, bedrijven, horeca, rijscholen, webshops en websites. Installeren kan direct, zonder store.";

const metaBasis: Metadata = {
  title,
  description,
  ...canonical("/apps", { title, description }),
};
// vlag `publiek-alleen-flexwerk`: uit Google als de vlag aan is; de pagina blijft bereikbaar via een directe link
export async function generateMetadata(): Promise<Metadata> {
  return { ...metaBasis, ...(await robotsVerborgen("/apps")) };
}

export default function AppsPage() {
  const apps = ZF_APPS.filter((a) => a.beschikbaar);
  return (
    <Section>
      <SectionHead
        kop="h1"
        eyebrow="Apps"
        title="Een eigen app voor jouw werk"
        intro="Kies de app die bij je past. Elke app opent meteen op het juiste scherm en staat als losse app op je telefoon of computer. Installeren kan direct, zonder store."
      />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((a) => (
          <li key={a.id} className="relative flex flex-col rounded-2xl border border-hair bg-white p-5">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/apps/${a.id}/icoon.png?maat=192`} alt="" width={48} height={48} className="h-12 w-12 rounded-xl" />
              <div className="min-w-0">
                <p className="font-display font-bold text-ink">{a.naam}</p>
                <p className="text-sm text-neutralx-500">{a.voorWie}</p>
              </div>
            </div>
            <p className="mt-3 flex-1 text-sm text-neutralx-600">{a.uitleg}</p>
            <Link href={`/apps/${a.id}`} className="btn-primary mt-4 self-start">
              Bekijken en installeren
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
