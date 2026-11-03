import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { laadRijschool } from "@/lib/rijschool/pagina";
import { websiteVan, whatsappNummer } from "@/lib/rijschool/website";
import { ldJson } from "@/lib/seo/json-ld";
import { euro } from "@/lib/payroll/format";
import { siteUrl } from "@/lib/rijschool/mail";

export const dynamic = "force-dynamic";

// De homepagina van een rijschool. Alle teksten komen uit het beheer
// (lib/rijschool/website.ts), de pakketten en instructeurs uit de database.

const STAPPEN = [
  { titel: "Proefles", tekst: "Je rijdt een eerste keer en krijgt een eerlijke inschatting van het aantal lessen." },
  { titel: "Vaste instructeur", tekst: "Je lessen plan je samen; de bevestiging krijg je per mail." },
  { titel: "Voortgang in de app", tekst: "Na elke les zie je per onderdeel waar je staat en wat je huiswerk is." },
  { titel: "Examen", tekst: "Als alles op examenniveau is, plannen we samen je praktijkexamen." },
];

export default async function RijschoolHome({ params }: { params: Promise<{ slug: string }> }) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  const w = websiteVan(r.website, r);
  const wa = whatsappNummer(w.whatsapp);
  const basis = `/rijschool/${r.slug}`;
  const [producten, instructeurs] = await Promise.all([
    prisma.rijschoolProduct.findMany({ where: { rijschoolId: r.id, zichtbaar: true }, orderBy: [{ volgorde: "asc" }, { createdAt: "asc" }] }),
    prisma.rijschoolInstructeur.findMany({ where: { rijschoolId: r.id, actief: true }, select: { id: true, naam: true, bio: true, categorieen: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const ld = {
    "@context": "https://schema.org",
    "@type": "DrivingSchool",
    name: r.naam,
    url: siteUrl(r),
    ...(r.telefoon ? { telephone: r.telefoon } : {}),
    ...(r.email ? { email: r.email } : {}),
    ...(r.adres || r.plaats ? { address: { "@type": "PostalAddress", streetAddress: r.adres, addressLocality: r.plaats, addressCountry: "NL" } } : {}),
    ...(w.werkgebied.length ? { areaServed: w.werkgebied } : {}),
    ...(producten.length
      ? { makesOffer: producten.map((p) => ({ "@type": "Offer", name: p.naam, price: (p.prijsCent / 100).toFixed(2), priceCurrency: "EUR" })) }
      : {}),
  };

  return (
    <>
      {r.online && <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />}

      <section
        className="text-white"
        style={{ backgroundColor: "var(--rs-kleur)", backgroundImage: "linear-gradient(135deg, var(--rs-kleur), color-mix(in srgb, var(--rs-kleur) 70%, black))" }}
      >
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:py-20 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            {w.slagingspercentage !== null && (
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--rs-accent)" }} aria-hidden />
                {w.slagingspercentage}% slaagt in één keer
              </p>
            )}
            <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">{w.kop}</h1>
            <p className="mt-4 max-w-xl text-lg text-white/85">{w.intro}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              {r.proeflesOnline && (
                <Link href={`${basis}/proefles`} className="rounded-full px-6 py-3 font-semibold text-ink shadow-lg transition hover:brightness-105" style={{ background: "var(--rs-accent)" }}>
                  Plan je proefles
                </Link>
              )}
              <a href="#pakketten" className="rounded-full border border-white/30 px-6 py-3 font-semibold text-white hover:bg-white/10">
                Bekijk pakketten
              </a>
              {wa && (
                <a href={`https://wa.me/${wa}`} rel="noopener" className="rounded-full border border-white/30 px-6 py-3 font-semibold text-white hover:bg-white/10">
                  WhatsApp ons
                </a>
              )}
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {w.sterkePunten.slice(0, 4).map((p) => (
              <li key={p.titel} className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <p className="font-semibold">{p.titel}</p>
                <p className="mt-1 text-sm text-white/80">{p.tekst}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {producten.length > 0 && (
        <section id="pakketten" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
          <h2 className="font-display text-3xl font-bold">Pakketten en prijzen</h2>
          <p className="mt-2 text-neutralx-600">Alle prijzen inclusief btw. Je tegoed zie je altijd in de app.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {producten.map((p) => (
              <article
                key={p.id}
                className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${p.populair ? "border-2" : "border-hair"}`}
                style={p.populair ? { borderColor: "var(--rs-kleur)" } : undefined}
              >
                {p.populair && (
                  <span className="absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: "var(--rs-kleur)" }}>
                    Meest gekozen
                  </span>
                )}
                <h3 className="text-lg font-semibold">{p.naam}</h3>
                <p className="num mt-2 font-display text-3xl font-bold">{euro(p.prijsCent)}</p>
                {p.lessen > 1 && <p className="text-sm text-neutralx-500">{euro(Math.round(p.prijsCent / p.lessen))} per les</p>}
                <p className="mt-3 flex-1 text-sm text-neutralx-600">{p.omschrijving}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {p.lessen > 0 && <li>✓ {p.lessen} {p.lessen === 1 ? "les" : "lessen"} van {p.lesMinuten} minuten</li>}
                  {p.examen && <li>✓ Inclusief praktijkexamen</li>}
                  {p.lessen > 0 && <li>✓ Voortgang en huiswerk in de app</li>}
                </ul>
              </article>
            ))}
          </div>
          {r.proeflesOnline && (
            <p className="mt-6 text-sm text-neutralx-600">
              Twijfel je welk pakket past?{" "}
              <Link href={`${basis}/proefles`} className="font-semibold underline underline-offset-2">
                Begin met een proefles
              </Link>
              , dan adviseert je instructeur je.
            </p>
          )}
        </section>
      )}

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-display text-3xl font-bold">Zo werkt het</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STAPPEN.map((s, i) => (
              <li key={s.titel} className="rounded-2xl border border-hair p-5">
                <span className="grid h-9 w-9 place-items-center rounded-full font-bold text-white" style={{ background: "var(--rs-kleur)" }}>
                  {i + 1}
                </span>
                <p className="mt-3 font-semibold">{s.titel}</p>
                <p className="mt-1 text-sm text-neutralx-600">{s.tekst}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl font-bold">Over {r.naam}</h2>
          <p className="mt-4 whitespace-pre-line leading-relaxed text-neutralx-700">{w.overOns}</p>
          {w.werkgebied.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold">Werkgebied</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {w.werkgebied.map((p) => (
                  <li key={p} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-hair">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {instructeurs.length > 0 && (
          <div id="instructeurs" className="scroll-mt-20">
            <h2 className="font-display text-3xl font-bold">Instructeurs</h2>
            <ul className="mt-4 space-y-3">
              {instructeurs.map((i) => (
                <li key={i.id} className="flex gap-4 rounded-2xl border border-hair bg-white p-4">
                  <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full text-lg font-bold text-white" style={{ background: "var(--rs-kleur)" }} aria-hidden>
                    {i.naam.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <span className="block font-semibold">{i.naam}</span>
                    <span className="block text-xs text-neutralx-500">Rijbewijs {i.categorieen.join(", ")}</span>
                    {i.bio && <span className="mt-1 block text-sm text-neutralx-600">{i.bio}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {w.faq.length > 0 && (
        <section className="bg-white">
          <div className="mx-auto max-w-3xl px-4 py-14">
            <h2 className="font-display text-3xl font-bold">Veelgestelde vragen</h2>
            <div className="mt-6 divide-y divide-hair rounded-2xl border border-hair">
              {w.faq.map((q) => (
                <details key={q.vraag} className="group p-5">
                  <summary className="cursor-pointer list-none font-semibold marker:hidden">
                    <span className="flex items-center justify-between gap-3">
                      {q.vraag}
                      <span className="text-xl transition group-open:rotate-45" aria-hidden>
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-2 text-neutralx-600">{q.antwoord}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {r.proeflesOnline && (
        <section className="mx-auto max-w-6xl px-4 pt-14">
          <div className="flex flex-col items-start gap-4 rounded-3xl p-8 text-white sm:flex-row sm:items-center" style={{ background: "var(--rs-kleur)" }}>
            <div className="min-w-0 sm:flex-1">
              <h2 className="font-display text-2xl font-bold">Klaar om te beginnen?</h2>
              <p className="mt-1 text-white/85">Kies zelf een moment voor je proefles. Binnen een minuut geregeld.</p>
            </div>
            <Link href={`${basis}/proefles`} className="rounded-full px-6 py-3 font-semibold text-ink" style={{ background: "var(--rs-accent)" }}>
              Plan je proefles
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
