import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { CONTACTS } from "@/lib/seo";
import { getSite } from "@/lib/sites/store";
import { getWebsiteProposal, isExpired, proposalOffer, type ProposalPoint, type ProposalScore } from "@/lib/sales/website-proposal";
import { AcceptForm, ViewBeacon } from "@/components/websitevoorstel/ProposalClient";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// /websitevoorstel/<id> — what a company sees when sales sends it its proposal
// (lib/sales/website-proposal.ts): its new website (live at /site/<naam>), the
// score of its current one, what we put right, the packages with real prices
// and the launch discount, and a form to say yes. The id is the secret; the
// page stays out of search engines.
// ---------------------------------------------------------------------------

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getWebsiteProposal((await params).id);
  return { title: p ? `Websitevoorstel voor ${p.bedrijf}` : "Websitevoorstel", robots: { index: false, follow: false } };
}

const euro = (cents: number) => `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const datum = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

function ScoreRow({ s }: { s: ProposalScore }) {
  const tone = s.score < 50 ? "#9A3B2E" : s.score < 75 ? "#A8834F" : "#3E6B4F";
  return (
    <li className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 text-sm">
      <span>{s.label}</span>
      <span className="h-1.5 bg-lux-line" aria-hidden>
        <span className="block h-full" style={{ width: `${Math.max(3, s.score)}%`, background: tone }} />
      </span>
      <span className="text-right tabular-nums">{s.score}</span>
    </li>
  );
}

/** Points with the same remedy together: "what we do" once, with what we found under it. */
function groupByRemedy(points: ProposalPoint[]): { wij: string; found: ProposalPoint[] }[] {
  const sorted = [...points].sort((a, b) => (a.status === b.status ? 0 : a.status === "probleem" ? -1 : 1));
  const groups = new Map<string, ProposalPoint[]>();
  for (const p of sorted) groups.set(p.wij, [...(groups.get(p.wij) ?? []), p]);
  return [...groups.entries()].map(([wij, found]) => ({ wij, found }));
}

export default async function WebsiteProposalPage({ params }: Props) {
  const { id } = await params;
  const p = await getWebsiteProposal(id);
  if (!p || p.status === "ingetrokken") notFound();
  const principal = await getPrincipal().catch(() => null);
  const staff = Boolean(principal && (hasRole(principal, "PLATFORM_ADMIN") || hasRole(principal, "SALES")));
  const siteUrl = `/site/${p.slug}`;

  if (p.status === "overgezet") {
    return (
      <main className="mx-auto max-w-2xl px-5 py-24 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lux-mute">Websitevoorstel</p>
        <h1 className="mt-4 font-serif text-4xl">De website van {p.bedrijf} staat in je account</h1>
        <p className="mt-4 text-lux-mute">
          Log in bij ZekerFlex en ga naar Website → Website bouwen. Daar pas je hem aan, koppel je je eigen domein en zet je hem online met Website-beheer. Vragen? Mail ons op <a className="underline" href={`mailto:${CONTACTS.sales}`}>{CONTACTS.sales}</a>.
        </p>
        <p className="mt-8">
          <Link href="/login" className="inline-block bg-lux-ink px-7 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white hover:bg-black">Inloggen</Link>
        </p>
      </main>
    );
  }

  if (isExpired(p)) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-24 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lux-mute">Websitevoorstel</p>
        <h1 className="mt-4 font-serif text-4xl">Dit voorstel voor {p.bedrijf} is verlopen</h1>
        <p className="mt-4 text-lux-mute">Het was geldig tot {datum(p.expiresAt)}. Wil je het opnieuw zien? Mail ons op <a className="underline" href={`mailto:${CONTACTS.sales}`}>{CONTACTS.sales}</a>, dan zetten we het graag weer voor je klaar.</p>
      </main>
    );
  }

  const [offer, site] = await Promise.all([proposalOffer(), getSite(p.siteId)]);
  const home = site?.pages.find((pg) => pg.slug === "");
  const heroBlock = home?.blocks.find((b) => b.type === "hero");
  const heroId = heroBlock?.type === "hero" ? heroBlock.props.foto : null;
  const heroFile = heroId ? site?.media.find((m) => m.id === heroId)?.file : undefined;
  const logoFile = site?.theme.logo ? site.media.find((m) => m.id === site.theme.logo)?.file : undefined;
  const groups = groupByRemedy(p.punten);
  const problems = p.punten.filter((x) => x.status === "probleem").length;
  const websiteNow = offer.website.kortingCents ?? offer.website.cents;
  const discount = offer.website.kortingCents !== null && offer.pricing.kortingPct > 0;
  const plans = offer.plannen.map((pl) => ({ key: pl.key, label: pl.label, maand: euro(pl.priceCentsPerMonth) }));

  return (
    <>
      {!staff && <ViewBeacon id={p.id} />}
      {staff && (
        <p className="bg-lux-ink px-5 py-2 text-center text-xs text-white">
          Je bekijkt dit als medewerker van ZekerFlex; het telt niet als bezoek. Status: {p.status}, {p.views} keer bekeken.
        </p>
      )}
      <header className="border-b border-lux-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <span className="font-serif text-2xl">ZekerFlex</span>
          <span className="text-xs uppercase tracking-[0.18em] text-lux-mute">Websitevoorstel · geldig tot {datum(p.expiresAt)}</span>
        </div>
      </header>

      <main>
        {/* the new website */}
        <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A5C30]">Voor {p.bedrijf}</p>
            <h1 className="mt-4 font-serif text-5xl leading-[1.05] sm:text-6xl">Je nieuwe website staat al klaar</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-lux-mute">
              We hebben {p.host} bekeken en een nieuwe website voor {p.bedrijf} gemaakt: sneller, veiliger, beter te vinden in Google en met een rustige, luxe uitstraling. Je kunt hem nu al bekijken.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={siteUrl} target="_blank" rel="noopener" className="bg-lux-ink px-7 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white hover:bg-black">
                Bekijk je nieuwe website
              </a>
              <a href="#ja" className="border border-lux-ink px-7 py-4 text-sm font-semibold uppercase tracking-[0.14em] hover:bg-white">
                Ja, dit wil ik
              </a>
            </div>
            <p className="mt-4 text-xs text-lux-mute">Alleen jij hebt deze link. Zoekmachines zien de nieuwe website niet tot hij van jou is.</p>
          </div>
          <a href={siteUrl} target="_blank" rel="noopener" className="group block border border-lux-line bg-white shadow-[0_30px_80px_-40px_rgba(21,20,18,.45)]" aria-label={`Bekijk de nieuwe website van ${p.bedrijf}`}>
            <span className="flex items-center gap-1.5 border-b border-lux-line px-4 py-3" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-lux-line" />
              <span className="h-2.5 w-2.5 rounded-full bg-lux-line" />
              <span className="h-2.5 w-2.5 rounded-full bg-lux-line" />
              <span className="ml-3 truncate text-xs text-lux-mute">zekerflex.com{siteUrl}</span>
            </span>
            <span className="relative block aspect-[16/10] overflow-hidden bg-lux-ink">
              {heroFile && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${siteUrl}/media/${heroFile}`} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
              )}
              <span className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/75" />
              <span className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
                {logoFile ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${siteUrl}/media/${logoFile}`} alt="" className="mb-4 max-h-10 w-auto bg-white/90 p-1.5" />
                ) : null}
                <span className="block font-serif text-3xl leading-tight sm:text-4xl">{p.bedrijf}</span>
                <span className="mt-2 block text-sm text-white/80">{p.plaats ? `${p.plaats} · ` : ""}Klik om de hele website te bekijken</span>
              </span>
            </span>
          </a>
        </section>

        {/* the current website */}
        <section className="border-y border-lux-line bg-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lux-mute">Je huidige website</p>
              <p className="mt-4 font-serif text-7xl tabular-nums">
                {p.check.score}
                <span className="text-3xl text-lux-mute">/100</span>
              </p>
              <p className="mt-3 max-w-sm text-lux-mute">
                Gemeten op {datum(p.check.at)} met de website-check van ZekerFlex: {problems === 1 ? "1 probleem" : `${problems} problemen`} en {p.punten.length - problems} aandachtspunten op {p.host}.
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-lux-mute">Techniek</p>
                <ul className="space-y-3">{p.check.categorieen.map((s) => <ScoreRow key={s.id} s={s} />)}</ul>
              </div>
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-lux-mute">Klanten overtuigen</p>
                <ul className="space-y-3">{p.check.extra.map((s) => <ScoreRow key={s.id} s={s} />)}</ul>
              </div>
            </div>
          </div>
        </section>

        {/* what we put right */}
        <section className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A5C30]">Wat we verbeteren</p>
          <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-tight sm:text-5xl">Alles wat we vonden, is in je nieuwe website opgelost of klaar om in te vullen</h2>
          <ol className="mt-12 divide-y divide-lux-line border-y border-lux-line">
            {groups.map((g) => (
              <li key={g.wij} className="grid gap-4 py-7 md:grid-cols-[1fr_1fr] md:gap-12">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-lux-mute">Gevonden</p>
                  <ul className="mt-2 space-y-1.5">
                    {g.found.map((f) => (
                      <li key={f.id} className="text-[0.95rem]">
                        <span className={`mr-2 text-xs font-semibold uppercase tracking-wide ${f.status === "probleem" ? "text-[#9A3B2E]" : "text-lux-mute"}`}>{f.status === "probleem" ? "Probleem" : "Let op"}</span>
                        {f.titel}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-lux-mute">In je nieuwe website</p>
                  <p className="mt-2 font-serif text-xl leading-snug">{g.wij}</p>
                </div>
              </li>
            ))}
          </ol>
          {p.goed.length > 0 && (
            <p className="mt-6 text-sm text-lux-mute">
              Al goed op je huidige site, en dat blijft zo: {p.goed.slice(0, 8).join(", ").toLowerCase()}.
            </p>
          )}
        </section>

        {/* packages */}
        <section className="bg-lux-stone">
          <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A5C30]">Wat het kost</p>
            <h2 className="mt-4 font-serif text-4xl sm:text-5xl">Eén keer de website, daarna een vast bedrag per maand</h2>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              <div className="border border-lux-ink bg-lux-ink p-7 text-white">
                <p className="text-xs uppercase tracking-[0.14em] text-white/70">Je nieuwe website</p>
                <p className="mt-4 font-serif text-5xl">{euro(websiteNow)}</p>
                {discount ? (
                  <p className="mt-2 text-sm text-white/80">
                    <s>{euro(offer.website.cents)}</s> · {offer.pricing.kortingPct}% introductiekorting voor de eerste {offer.places.total} bedrijven, nog {offer.places.left} {offer.places.left === 1 ? "plek" : "plekken"}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-white/80">eenmalig</p>
                )}
                <ul className="mt-6 space-y-2 text-sm text-white/90">
                  <li>De website zoals je hem nu ziet, met jouw teksten en foto&apos;s erin</li>
                  <li>Openingstijden, reviews en KVK-nummer vullen we samen in</li>
                  <li>Zelf aan te passen in de websitebouwer, wanneer je wilt</li>
                </ul>
              </div>
              {offer.plannen.map((pl) => (
                <div key={pl.key} className="border border-lux-line bg-white p-7">
                  <p className="text-xs uppercase tracking-[0.14em] text-lux-mute">Website-beheer {pl.label}</p>
                  <p className="mt-4 font-serif text-5xl">
                    {euro(pl.priceCentsPerMonth)}
                    <span className="text-xl text-lux-mute"> per maand</span>
                  </p>
                  <p className="mt-2 text-sm text-lux-mute">{pl.blurb}</p>
                  <ul className="mt-6 space-y-2 text-sm">
                    <li>Hosting bij ZekerFlex, met https</li>
                    {pl.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="border border-lux-line bg-white p-7">
                <p className="text-xs uppercase tracking-[0.14em] text-lux-mute">Je eigen domein</p>
                <p className="mt-3 font-serif text-2xl leading-snug">Houd je domein waar het nu staat</p>
                <p className="mt-2 text-sm text-lux-mute">
                  Je laat {p.host.replace(/^www\./, "")} bij je huidige provider en zet daar twee regels die naar ZekerFlex wijzen. Wij geven je precies wat je moet invullen, en je site draait dan bij ons met een eigen beveiligd certificaat. Het koppelen kost niets extra. Liever alles bij ons onderbrengen? Dan regelen we de verhuizing van je domein samen met je.
                </p>
              </div>
              <div className="border border-lux-line bg-white p-7">
                <p className="text-xs uppercase tracking-[0.14em] text-lux-mute">Wat we nog meer doen</p>
                <ul className="mt-3 space-y-3 text-sm">
                  {offer.telefonieVanafCents !== null && (
                    <li>
                      <span className="font-semibold">Zakelijk telefoonnummer</span>: vanaf {euro(offer.telefonieVanafCents)} per maand, met opties als voicemail en doorschakelen
                    </li>
                  )}
                  <li>
                    <span className="font-semibold">Personeel nodig?</span> Flexkrachten via ZekerFlex, voor {euro(offer.feePerUurCents)} per gewerkt uur aan platformkosten
                  </li>
                  <li>
                    <span className="font-semibold">Bewaking van je website</span>: we zien het als hij uitvalt en checken hem elke week, inbegrepen bij Website-beheer
                  </li>
                </ul>
              </div>
            </div>
            <p className="mt-6 text-xs text-lux-mute">Alle bedragen exclusief btw. Website-beheer is maandelijks opzegbaar.</p>
          </div>
        </section>

        {/* yes */}
        <section id="ja" className="mx-auto max-w-3xl scroll-mt-8 px-5 py-16 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7A5C30]">Ja, dit wil ik</p>
          <h2 className="mt-4 font-serif text-4xl sm:text-5xl">Maak de website van {p.bedrijf}</h2>
          {p.akkoord ? (
            <div role="status" className="mt-8 border border-lux-line bg-white p-8">
              <p className="font-serif text-3xl">Je hebt ja gezegd op {datum(p.akkoord.at)}</p>
              <p className="mt-3 text-lux-mute">We nemen contact met je op om alles door te nemen. Vragen? Mail <a className="underline" href={`mailto:${CONTACTS.sales}`}>{CONTACTS.sales}</a>.</p>
            </div>
          ) : (
            <>
              <p className="mt-4 text-lux-mute">Laat je gegevens achter. We bellen of mailen je binnen één werkdag om alles door te nemen; er wordt nu nog niets betaald of afgesloten.</p>
              <div className="mt-8">
                <AcceptForm id={p.id} plans={plans} bedrijf={p.bedrijf} websitePrijs={euro(websiteNow)} />
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="border-t border-lux-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs text-lux-mute">
          <span>ZekerFlex · websites, hosting en flexwerk</span>
          <span>
            Vragen over dit voorstel? <a className="underline" href={`mailto:${CONTACTS.sales}`}>{CONTACTS.sales}</a>
          </span>
        </div>
      </footer>
    </>
  );
}
