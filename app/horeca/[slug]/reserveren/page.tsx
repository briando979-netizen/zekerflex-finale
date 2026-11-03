import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { zaakVanSlug } from "@/lib/horeca/store";
import { heeftModule } from "@/lib/horeca/modules";
import { leesInstellingen } from "@/lib/horeca/reserveren";
import { nuNL } from "@/lib/horeca/reserveringen";
import { telefoonWeergave } from "@/lib/rijschool/format";
import { ReserveerFormulier } from "@/components/horeca/site/ReserveerFormulier";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reserveren" };

// Online een tafel reserveren (module reserveren). De layout bewaakt of de
// site zichtbaar is.
export default async function ReserverenPagina({ params }: { params: Promise<{ slug: string }> }) {
  const z = await zaakVanSlug((await params).slug).catch(() => null);
  if (!z) notFound();
  const inst = leesInstellingen(z.reserveren);
  const tel = z.telefoon ? telefoonWeergave(z.telefoon) : "";
  return (
    <>
      <section className="bg-[var(--rs-nacht)] text-[var(--rs-creme)]">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--rs-accent-op-nacht)]">Reserveren</p>
          <h1 className="mt-3 font-display text-[clamp(2.2rem,6vw,3.5rem)] font-bold leading-[0.95] tracking-[-0.03em]">Reserveer een tafel bij {z.naam}</h1>
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        {heeftModule(z, "reserveren") ? (
          <ReserveerFormulier slug={z.slug} vandaag={nuNL().datum} maxGroep={inst.maxGroep} dagenVooruit={inst.dagenVooruit} telefoon={tel} />
        ) : (
          <p role="status" className="rounded-[1.75rem] bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
            Online reserveren staat hier (nog) uit. {tel ? `Bel ons gerust op ${tel}.` : "Neem gerust contact met ons op."}
          </p>
        )}
      </section>
    </>
  );
}
