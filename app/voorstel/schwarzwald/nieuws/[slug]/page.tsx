import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE } from "@/lib/voorstel/schwarzwald";
import { zichtbaarBericht } from "@/lib/voorstel/schwarzwald-nieuws";
import { alineas } from "@/lib/voorstel/nieuws-regels";
import { CtaBand } from "@/components/voorstel/SchwarzwaldCards";

export const dynamic = "force-dynamic";

// Eén nieuwsbericht. Alleen gepubliceerd en vanaf de datum zichtbaar; de tekst
// is platte tekst in alinea's (geen HTML).

type Props = { params: Promise<{ slug: string }> };

const datumNL = (d: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const b = await zichtbaarBericht((await params).slug);
  return b ? { title: b.titel, ...(b.samenvatting ? { description: b.samenvatting } : {}) } : { title: "Bericht niet gevonden" };
}

export default async function BerichtPage({ params }: Props) {
  const b = await zichtbaarBericht((await params).slug);
  if (!b) notFound();
  return (
    <>
      <section className="relative isolate overflow-hidden bg-schw-night text-schw-cream">
        {b.foto ? (
          <>
            <Image src={b.foto} alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-45" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-schw-night via-schw-night/60 to-schw-night/10" />
          </>
        ) : (
          <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 -z-10 h-96 w-96 rounded-full bg-schw-orange/25 blur-3xl" />
        )}
        <div className={`mx-auto max-w-[1280px] px-4 pb-14 sm:px-8 ${b.foto ? "pt-32 lg:pt-44" : "pt-14 lg:pt-20"}`}>
          <nav aria-label="Kruimelpad" className="text-sm text-schw-cream/70">
            <Link href={BASE} className="hover:text-schw-cream">
              Home
            </Link>
            <span aria-hidden="true"> / </span>
            <Link href={`${BASE}/nieuws`} className="hover:text-schw-cream">
              Nieuws
            </Link>
          </nav>
          <h1 className="mt-4 max-w-4xl font-display text-[clamp(2.4rem,6vw,4.5rem)] font-bold leading-[0.98] tracking-[-0.02em]">{b.titel}</h1>
          <p className="mt-4 text-sm font-semibold text-schw-sun first-letter:uppercase">{datumNL(b.datum)}</p>
        </div>
      </section>
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-8">
        {b.samenvatting && <p className="text-xl font-semibold leading-relaxed">{b.samenvatting}</p>}
        <div className="mt-6 space-y-5 text-lg leading-relaxed text-schw-night/85">
          {alineas(b.tekst).map((a, i) => (
            <p key={i} className="whitespace-pre-line">
              {a}
            </p>
          ))}
        </div>
        <Link href={`${BASE}/nieuws`} className="mt-10 inline-block font-semibold underline decoration-schw-orange decoration-2 underline-offset-4">
          ‹ Al het nieuws
        </Link>
      </article>
      <CtaBand />
    </>
  );
}
