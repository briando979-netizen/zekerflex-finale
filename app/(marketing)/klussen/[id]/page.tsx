import type { Metadata } from "next";
import { ldJson } from "@/lib/seo/json-ld";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/marketing/primitives";
import { jobPostingJsonLd, publicShift, publicShiftTenant } from "@/lib/public-shifts";
import { companyRatings } from "@/lib/reviews/ratings";
import { CITIES } from "@/lib/seo-cities";
import { breadcrumbJsonLd, canonical, SITE } from "@/lib/seo";

export const revalidate = 600;

const TZ = "Europe/Amsterdam";
const rate = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const s = await publicShift((await params).id);
  if (!s) return { title: "Klus niet meer beschikbaar", robots: { index: false } };
  const when = s.startsAt.toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: TZ });
  const title = `${s.title} in ${s.city} — ${rate(s.hourlyRateCents)} per uur`;
  const description = `Klus bij ${s.company} in ${s.city} op ${when}, ${rate(s.hourlyRateCents)} per uur. Reageer via ZekerFlex en kies zelf hoe snel je wordt uitbetaald.`;
  return { title, description, ...canonical(`/klussen/${s.id}`, { title, description }) };
}

export default async function KlusPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await publicShift(id);
  if (!s) notFound();
  const tenantId = await publicShiftTenant(s.id);
  const rating = tenantId ? (await companyRatings([tenantId])).get(tenantId) : undefined;
  const hours = (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000;
  const city = CITIES.find((c) => c.name.toLowerCase() === s.city.toLowerCase());
  const next = encodeURIComponent(`/dashboard/klussen/${s.id}`);

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson([
            jobPostingJsonLd(s, SITE.url),
            breadcrumbJsonLd([["Home", "/"], ["Klussen", "/klussen"], [s.title, `/klussen/${s.id}`]]),
          ]),
        }}
      />
      <Section>
        <Link href="/klussen" className="text-sm font-medium text-neutralx-500 hover:text-ink">
          ← Alle klussen
        </Link>
        <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold leading-tight tracking-tight text-ink md:text-[2.6rem]">{s.title}</h1>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-lg text-neutralx-600">
          <span>
            {s.company} · {s.city}
          </span>
          {rating && (
            <span className="rounded-full bg-money-soft px-2.5 py-0.5 text-sm font-bold text-money-ink">
              ★ {rating.average.toFixed(1).replace(".", ",")} · {rating.count} beoordeling{rating.count === 1 ? "" : "en"} van flexkrachten
            </span>
          )}
        </p>
        <dl className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-3">
          {[
            ["Wanneer", s.startsAt.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: TZ })],
            ["Tijd", `${s.startsAt.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}–${s.endsAt.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ })} (${hours.toFixed(1).replace(".", ",")} uur)`],
            ["Tarief", `${rate(s.hourlyRateCents)} per uur`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-hair bg-white p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">{k}</dt>
              <dd className="mt-1 font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {s.description && <p className="mt-8 max-w-3xl whitespace-pre-line text-neutralx-700">{s.description}</p>}
        <p className="mt-6 max-w-3xl text-sm text-neutralx-600">
          {s.viaUitzendbureau
            ? "Deze klus loopt via het ZekerFlex-uitzendbureau: je hebt geen KVK nodig en krijgt loon met vakantiegeld, pensioen (StiPP) en reiskosten."
            : "Voor zzp'ers en flexwerkers. Je stuurt geen facturen: ZekerFlex regelt de factuur, en je kiest zelf of je direct, binnen 3 dagen of gratis binnen 30 dagen wordt uitbetaald."}
          {s.positions > 1 ? ` Er zijn ${s.positions} plekken.` : ""}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/register?type=freelancer" className="btn-primary">
            Reageer op deze klus
          </Link>
          <Link href={`/login?callbackUrl=${next}`} className="btn-ghost">
            Ik heb al een account
          </Link>
        </div>
        {city && (
          <p className="mt-10 text-sm text-neutralx-500">
            Meer werk in de buurt:{" "}
            <Link href={`/freelance-werk/${city.slug}`} className="font-medium text-brand-600 hover:underline">
              freelance werk in {city.name}
            </Link>
          </p>
        )}
      </Section>
    </>
  );
}
