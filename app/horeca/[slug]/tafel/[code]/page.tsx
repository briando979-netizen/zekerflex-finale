import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { zaakVanSlug, menukaart } from "@/lib/horeca/store";
import { tafelVanCode } from "@/lib/horeca/bestellingen";
import { heeftModule } from "@/lib/horeca/modules";
import { leesOpties } from "@/lib/horeca/opties";
import { BestelMenu, type MenuGroep } from "@/components/horeca/site/BestelMenu";
import type { Terug } from "@/components/horeca/site/AfrekenBlok";
import { onlineAfrekenenAan } from "@/lib/horeca/betalen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bestellen aan tafel", robots: { index: false, follow: false } };

// Bestellen aan tafel: de gast scant de QR-code op tafel en komt hier. De
// layout bewaakt of de site zichtbaar is; hier de tafel en de module.
export default async function TafelPagina({ params, searchParams }: { params: Promise<{ slug: string; code: string }>; searchParams: Promise<{ betaling?: string; b?: string }> }) {
  const { slug, code } = await params;
  const q = await searchParams;
  const z = await zaakVanSlug(slug).catch(() => null);
  if (!z) notFound();
  const tafel = code.length <= 40 ? await tafelVanCode(z.id, code) : null;
  const melding = !heeftModule(z, "qr")
    ? "Bestellen via de QR-code staat bij deze zaak uit. De bediening helpt je graag."
    : !tafel
      ? "Deze QR-code werkt niet meer. Vraag de bediening om een nieuwe."
      : "";

  if (melding || !tafel) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="font-display text-3xl font-bold">Bestellen aan tafel</h1>
        <p role="status" className="mt-4 rounded-[1.75rem] bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
          {melding}
        </p>
      </section>
    );
  }

  const { categorieen, items } = await menukaart(z.id);
  // online afrekenen: module aan en het Stripe-account van de zaak klaar; een storing bij Stripe verbergt alleen de knop
  const afrekenen = heeftModule(z, "betalen") && (await onlineAfrekenenAan(z).catch(() => false));
  const terug: Terug =
    (q.betaling === "gelukt" || q.betaling === "geannuleerd") && afrekenen ? { betaling: q.betaling, b: typeof q.b === "string" ? q.b.slice(0, 40) : "" } : null;
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
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--rs-accent-op-nacht)]">Bestellen aan tafel</p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {z.naam} · {tafel.naam}
          </h1>
        </div>
      </section>
      <BestelMenu slug={z.slug} code={code} tafel={tafel.naam} groepen={groepen} afrekenen={afrekenen} terug={terug} />
    </>
  );
}
