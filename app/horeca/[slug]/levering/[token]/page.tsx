import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { zaakVanSlug } from "@/lib/horeca/store";
import { leesMet } from "@/lib/horeca/link";
import { leveringVoorGast } from "@/lib/horeca/bezorgen-server";
import { LeverStatus } from "@/components/horeca/site/LeverStatus";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Je bestelling", robots: { index: false, follow: false } };

// De gast volgt zijn online afhaal- of bezorgbestelling: alleen met de ondertekende link uit de bestelling
// (lib/horeca/link.ts, doel "levering"). Geen adres of telefoon op deze pagina.
export default async function LeveringPagina({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const z = await zaakVanSlug(slug).catch(() => null);
  if (!z) notFound();
  const id = leesMet(env.AUTH_SECRET, "levering", decodeURIComponent(token));
  const stand = id ? await leveringVoorGast(z.id, id) : null;
  if (!stand) notFound();
  return (
    <>
      <section className="bg-[var(--rs-nacht)] text-[var(--rs-creme)]">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--rs-accent-op-nacht)]">{stand.soort === "bezorgen" ? "Bezorgen" : "Afhalen"}</p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {z.naam} · bestelling {stand.nummer}
          </h1>
        </div>
      </section>
      <LeverStatus slug={z.slug} token={decodeURIComponent(token)} begin={stand} telefoon={z.telefoon} />
    </>
  );
}
