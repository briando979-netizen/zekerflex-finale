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
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Plan je proefles</h1>
      {r.proeflesOnline ? (
        <>
          <p className="mt-2 text-neutralx-600">
            Kies een moment dat jou uitkomt. De proefles duurt {r.lesMinuten} minuten en je instructeur haalt je op.
          </p>
          <div className="mt-8">
            <ProeflesPlanner slug={r.slug} schoolNaam={r.naam} />
          </div>
        </>
      ) : (
        <p className="mt-2 text-neutralx-600">
          {r.naam} plant proeflessen nu niet online. Bel of mail ons gerust{r.telefoon ? ` op ${r.telefoon}` : ""}
          {r.email ? ` of via ${r.email}` : ""}.
        </p>
      )}
    </div>
  );
}
