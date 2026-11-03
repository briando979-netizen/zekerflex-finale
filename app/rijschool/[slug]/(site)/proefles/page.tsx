import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { laadRijschool } from "@/lib/rijschool/pagina";
import { ProeflesPlanner } from "@/components/rijschool/site/ProeflesPlanner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Proefles plannen" };

export default async function ProeflesPage({ params }: { params: Promise<{ slug: string }> }) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--rs-kleur-tekst)" }}>
        Proefles
      </p>
      <h1 className="mt-3 font-display text-[clamp(2.4rem,6vw,3.75rem)] font-bold leading-[1] tracking-[-0.03em]">Plan je proefles</h1>
      {r.proeflesOnline ? (
        <>
          <p className="mt-4 text-lg text-schw-mute">
            Kies een moment dat jou uitkomt. De proefles duurt {r.lesMinuten} minuten en je instructeur haalt je op.
          </p>
          <div className="mt-8 rounded-xl3 bg-white p-5 shadow-[0_20px_50px_-30px_rgba(10,18,14,0.35)] sm:p-7">
            <ProeflesPlanner slug={r.slug} schoolNaam={r.naam} />
          </div>
        </>
      ) : (
        <p className="mt-4 text-lg text-schw-mute">
          {r.naam} plant proeflessen nu niet online. Bel of mail ons gerust{r.telefoon ? ` op ${r.telefoon}` : ""}
          {r.email ? ` of via ${r.email}` : ""}.
        </p>
      )}
    </div>
  );
}
