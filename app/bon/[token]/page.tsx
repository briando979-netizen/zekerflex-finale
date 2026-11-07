import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { bonUitToken } from "@/lib/horeca/bon";
import { BonWeergave } from "@/components/horeca/live/Bon";
import { BonDelen } from "@/components/horeca/live/BonDelen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Je bon", robots: { index: false, follow: false } };

// De bon van een gast, geopend via de QR-code bij de kassa, de link in de mail of
// na afrekenen aan tafel. Alleen met een ondertekende link (lib/horeca/bon.ts);
// werkt ook als de site van de zaak niet online staat.
export default async function BonPagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gevonden = await bonUitToken(token).catch(() => null);
  if (!gevonden) notFound();
  const { bon, kop } = gevonden;
  return (
    <main className="min-h-dvh bg-[#F4F5F1] px-4 py-10 text-[#0A120E]">
      <div className="mx-auto max-w-md space-y-6">
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#4B5563]">Je bon</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{kop.naam}</h1>
        </header>
        <BonWeergave kop={kop} bon={bon} />
        <section aria-label="Bon bewaren" className="rounded-[1.75rem] bg-white p-5 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
          <BonDelen token={token} />
        </section>
        <p className="text-center text-xs text-[#4B5563]">Bon via ZekerFlex, namens {kop.naam}.</p>
      </div>
    </main>
  );
}
