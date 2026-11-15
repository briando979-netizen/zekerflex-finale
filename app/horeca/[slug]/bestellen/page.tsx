import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { zaakVanSlug, menukaart } from "@/lib/horeca/store";
import { heeftModule } from "@/lib/horeca/modules";
import { leesOpties } from "@/lib/horeca/opties";
import { leverOpties } from "@/lib/horeca/bezorgen-server";
import type { MenuGroep } from "@/components/horeca/site/BestelMenu";
import { LeverMenu } from "@/components/horeca/site/LeverMenu";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bestellen om af te halen of te laten bezorgen", robots: { index: false, follow: false } };

// Online bestellen om af te halen of te laten bezorgen (15 nov 2026, module bezorgen). De layout bewaakt of de site
// zichtbaar is; hier de module en wat er vandaag kan (tijden uit de openingstijden, lib/horeca/bezorgen-server.ts).
export default async function BestellenPagina({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const z = await zaakVanSlug(slug).catch(() => null);
  if (!z) notFound();
  if (!heeftModule(z, "bezorgen")) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="font-display text-3xl font-bold">Online bestellen</h1>
        <p role="status" className="mt-4 rounded-[1.75rem] bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
          Online bestellen om af te halen of te laten bezorgen kan bij deze zaak (nog) niet. Bel ons gerust.
        </p>
      </section>
    );
  }
  const { categorieen, items } = await menukaart(z.id);
  const groepen: MenuGroep[] = [
    ...categorieen.map((c) => ({ id: c.id, naam: c.naam, items: items.filter((i) => i.categorieId === c.id) })),
    { id: "overig", naam: "Overig", items: items.filter((i) => !i.categorieId) },
  ]
    .filter((g) => g.items.length)
    .map((g) => ({
      ...g,
      items: g.items.map((i) => ({ id: i.id, naam: i.naam, omschrijving: i.omschrijving, prijsCent: i.prijsCent, allergenen: i.allergenen, vegetarisch: i.vegetarisch, veganistisch: i.veganistisch, beschikbaar: i.beschikbaar, opties: leesOpties(i.opties), voorraad: i.voorraad })),
    }));

  return (
    <>
      <section className="bg-[var(--rs-nacht)] text-[var(--rs-creme)]">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--rs-accent-op-nacht)]">Online bestellen</p>
          <h1 className="mt-2 font-display text-3xl font-bold">{z.naam}</h1>
          <p className="mt-2 text-[var(--rs-creme)]/80">Afhalen of laten bezorgen. Je betaalt bij het ophalen of de bezorging.</p>
        </div>
      </section>
      <LeverMenu slug={z.slug} groepen={groepen} opties={leverOpties(z)} />
    </>
  );
}
