import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { laatsteDag } from "@/lib/afspraken/model";
import { openInstellingenVanSlug } from "@/lib/afspraken/store";
import { BoekFlow } from "@/components/afspraken/BoekFlow";

export const dynamic = "force-dynamic";

// /boeken/<adres>: de boekpagina van een bedrijf. Een klant kiest een dienst en een tijd en vult zijn gegevens in; de
// afspraak komt in de agenda van het bedrijf (/werkgever/afspraken). Niet voor zoekmachines: het is een werkpagina.

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const open = await openInstellingenVanSlug((await params).slug);
  return { title: open ? `Een afspraak maken bij ${open.instellingen.bedrijfsnaam}` : "Afspraak maken", robots: { index: false, follow: false } };
}

export default async function BoekPagina({ params }: Props) {
  const { slug } = await params;
  const open = await openInstellingenVanSlug(slug);
  if (!open) notFound();
  const i = open.instellingen;
  const nu = new Date();
  return (
    <main className="flex min-h-screen items-start justify-center bg-paper-soft px-4 py-10 sm:py-14">
      <div className="w-full max-w-lg">
        <h1 className="font-display text-2xl font-bold text-ink">{i.bedrijfsnaam}</h1>
        <p className="mb-5 mt-1 text-sm text-neutralx-600">Maak online een afspraak. Kies een dienst en een tijd die jou past.</p>
        <BoekFlow
          slug={slug}
          bedrijfsnaam={i.bedrijfsnaam}
          diensten={i.diensten.map((d) => ({ id: d.id, naam: d.naam, duurMin: d.duurMin, prijsCent: d.prijsCent }))}
          medewerkers={i.medewerkers.map((m) => ({ id: m.id, naam: m.naam }))}
          vanDag={amsterdamDayKey(nu)}
          totDag={laatsteDag(nu, i.maxDagenVooruit)}
        />
        <p className="mt-6 text-center text-xs text-neutralx-500">Afspraken via ZekerFlex namens {i.bedrijfsnaam}. Je gegevens gaan alleen naar dit bedrijf.</p>
      </div>
    </main>
  );
}
