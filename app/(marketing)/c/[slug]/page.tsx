import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Reveal } from "@/components/marketing/Reveal";
import { campagneDoel, campagneFoto } from "@/lib/campagne/pagina";
import { campagnePagina } from "@/lib/campagne/pagina-server";
import { fotoPad } from "@/lib/marketing/fotos";

export const dynamic = "force-dynamic";

// De landingspagina van één campagne (17 nov 2026): een foto, een korte kop en één knop, gemaakt in
// Beheer → Sales & groei → Campagnepagina's (lib/campagne/pagina.ts). Voor wie op een advertentie klikt, niet voor
// zoekmachines: noindex. Een pagina die uit staat of niet bestaat, geeft 404.

async function laad(slug: string) {
  const p = await campagnePagina(slug).catch(() => null);
  if (!p || !p.aan) return null;
  const doel = campagneDoel(p.knopDoel);
  const foto = campagneFoto(p.foto);
  if (!doel || !foto) return null;
  return { p, doel, foto };
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const d = await laad(slug);
  if (!d) return { title: "Pagina niet gevonden", robots: { index: false, follow: false } };
  return { title: `${d.p.kop} ${d.p.kopAccent}`.trim(), description: d.p.tekst, robots: { index: false, follow: false } };
}

export default async function CampagnePaginaRoute(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const d = await laad(slug);
  if (!d) notFound();
  const { p, doel, foto } = d;

  return (
    <section className="relative isolate overflow-hidden bg-[#0C0E12] text-white">
      {/* telefoon: de foto bovenaan, de tekst eronder; groter scherm: de tekst links, de foto als strook rechts */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[24rem] md:inset-y-0 md:left-auto md:h-auto md:w-[45%]">
        <Image src={fotoPad(foto)} alt={foto.alt} fill priority sizes="(min-width: 768px) 45vw, 100vw" className="object-cover object-[50%_20%]" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0C0E12] via-[#0C0E12]/30 via-40% to-transparent md:bg-gradient-to-r md:via-[#0C0E12]/40 md:via-25% md:to-50%" />
      </div>
      <div className="shell-4k relative flex min-h-[80vh] items-end pb-12 pt-[17rem] md:items-center md:py-20">
        <Reveal className="max-w-xl md:max-w-md lg:max-w-xl">
          <p className="eyebrow text-brand-mint">{p.doelgroep === "werker" ? "Voor werkers" : "Voor bedrijven"}</p>
          <h1 className="fluid-hero mt-3 text-balance font-display font-bold">
            {p.kop}
            {p.kopAccent ? (
              <>
                {" "}
                <span className="bg-gradient-to-r from-brand-mint to-[#8FF0C4] bg-clip-text text-transparent">{p.kopAccent}</span>
              </>
            ) : null}
          </h1>
          <p className="fluid-lead mt-4 text-white/75">{p.tekst}</p>
          <div className="mt-6">
            <Link href={doel.href} className="btn-mint text-base">
              {p.knopTekst}
            </Link>
          </div>
          {p.punten.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-white/70">
              {p.punten.map((punt) => (
                <li key={punt} className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="flex-shrink-0 text-brand-mint">
                    <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {punt}
                </li>
              ))}
            </ul>
          )}
        </Reveal>
      </div>
    </section>
  );
}
