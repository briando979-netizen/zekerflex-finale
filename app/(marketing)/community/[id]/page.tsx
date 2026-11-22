import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { breadcrumbJsonLd, canonical, SITE } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { seoBeschrijving, seoSjabloonTitel } from "@/lib/seo-tekst";
import { WELKOM_ID, categorieNaam, idUitPad, onderwerpPad } from "@/lib/community/regels";
import { leesOnderwerp, leesReacties } from "@/lib/community/store";
import { schrijfStatus } from "@/lib/community/toegang";
import { berichtWeergave, schrijversVan, type AuteurWeergave } from "@/lib/community/weergave";
import { BerichtKaart } from "@/components/community/BerichtKaart";
import { DoeMee } from "@/components/community/DoeMee";
import { ReactieFormulier } from "@/components/community/ReactieFormulier";

// Eén onderwerp uit de community met alle reacties (/community/<id>-<slug>). Iedereen kan lezen; reageren met een gratis
// account. Een adres met een oude of zonder slug gaat blijvend naar het juiste adres. Een onderwerp zonder reacties komt
// (nog) niet in Google; met reacties wel, ook in de sitemap (app/sitemap.ts).

export const dynamic = "force-dynamic";

async function laad(param: string) {
  const id = idUitPad(param);
  return id ? leesOnderwerp(id).catch(() => null) : null;
}

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const o = await laad(id);
  if (!o || o.status !== "zichtbaar") return { title: "Community", robots: { index: false, follow: false } };
  const pad = onderwerpPad(o);
  const beschrijving = seoBeschrijving(o.tekst);
  const c = canonical(pad, { title: o.titel, description: beschrijving });
  return {
    title: seoSjabloonTitel(o.titel),
    description: beschrijving,
    ...c,
    openGraph: { ...c.openGraph, type: "article", publishedTime: o.at, modifiedTime: o.laatsteOp },
    ...(o.aantalReacties === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

const persoon = (a: AuteurWeergave) => (a.team ? { "@type": "Organization", name: SITE.name, url: SITE.url } : { "@type": "Person", name: a.naam });

export default async function OnderwerpPage(props: { params: Promise<{ id: string }> }) {
  const { id: param } = await props.params;
  const o = await laad(param);
  if (!o || o.status === "verwijderd") notFound();
  const pad = onderwerpPad(o);
  if (param !== pad.slice("/community/".length)) permanentRedirect(pad);

  const nu = new Date();
  const [reacties, principal] = await Promise.all([leesReacties(o.id).catch(() => []), getPrincipal().catch(() => null)]);
  const kijker = principal?.userId ?? null;

  // verborgen na meldingen of door beheer: alleen de schrijver ziet het nog (met de uitleg)
  if (o.status === "verborgen" && kijker !== o.auteurId) {
    const beheer = principal ? hasRole(principal, "PLATFORM_ADMIN") : false;
    return (
      <section className="bg-paper">
        <div className="shell max-w-3xl py-16 md:py-20">
          <p className="eyebrow text-neutralx-500">Community</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-ink">Dit onderwerp is verborgen</h1>
          <p className="mt-4 text-neutralx-600">
            Het is gemeld of door beheer verborgen, en staat uit tot we het hebben bekeken. Lees gerust verder in de community.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/community" className="btn-primary">
              Naar de community
            </Link>
            {beheer && (
              <Link href="/admin/community" className="btn-ghost">
                Bekijk in Beheer
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  const [schrijvers, status] = await Promise.all([
    schrijversVan([o, ...reacties]).catch(() => new Map()),
    principal ? schrijfStatus(principal, nu).catch(() => null) : Promise.resolve(null),
  ]);
  const hoofd = berichtWeergave(o, o.id, null, schrijvers, kijker, nu);
  const lijst = reacties.map((r) => berichtWeergave(r, o.id, r.id, schrijvers, kijker, nu));
  const zichtbaar = lijst.filter((r) => r.status === "zichtbaar");
  const ingelogd = Boolean(principal);

  const ld =
    o.status === "zichtbaar"
      ? {
          "@context": "https://schema.org",
          "@type": "DiscussionForumPosting",
          "@id": `${SITE.url}${pad}#onderwerp`,
          headline: o.titel,
          text: o.tekst,
          url: `${SITE.url}${pad}`,
          mainEntityOfPage: `${SITE.url}${pad}`,
          datePublished: o.at,
          dateModified: o.laatsteOp,
          inLanguage: "nl-NL",
          author: persoon(hoofd.auteur),
          ...(hoofd.fotos.length ? { image: hoofd.fotos.map((f) => `${SITE.url}${f}`) } : {}),
          interactionStatistic: [
            { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: zichtbaar.length },
            { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: hoofd.handig },
          ],
          comment: zichtbaar.slice(0, 100).map((r) => ({
            "@type": "Comment",
            text: r.tekst,
            datePublished: r.at,
            author: persoon(r.auteur),
            ...(r.handig ? { interactionStatistic: { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: r.handig } } : {}),
          })),
        }
      : null;

  return (
    <>
      {ld && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: ldJson([
              ld,
              breadcrumbJsonLd([
                ["Community", "/community"],
                [o.titel, pad],
              ]),
            ]),
          }}
        />
      )}
      <div className="hero-ink text-white">
        <div className="shell py-12 md:py-16">
          <Link href="/community" className="text-sm font-medium text-white/60 hover:text-white">
            ← Community
          </Link>
          <p className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
            {o.vastgepind && <span className="rounded-full bg-brand-mint px-2.5 py-1 text-ink">Vastgepind</span>}
            <Link href={`/community?categorie=${o.categorie}`} className="rounded-full bg-white/10 px-2.5 py-1 text-white hover:bg-white/20">
              {categorieNaam(o.categorie)}
            </Link>
          </p>
          <h1 className="mt-4 max-w-3xl break-words text-balance font-display text-3xl font-bold leading-tight md:text-[2.5rem]">{o.titel}</h1>
          <p className="mt-4 text-sm text-white/60">{zichtbaar.length === 1 ? "1 reactie" : `${zichtbaar.length} reacties`}</p>
        </div>
      </div>

      <article className="bg-paper">
        <div className="shell max-w-3xl py-10 md:py-14">
          <BerichtKaart bericht={hoofd} onderwerpId={o.id} ingelogd={ingelogd} terug={pad} groot />
          {o.id === WELKOM_ID && (
            <p className="mt-3 text-sm text-neutralx-600">
              Alle regels en hoe melden werkt:{" "}
              <Link href="/community/regels" className="font-semibold text-ink underline underline-offset-4">
                huisregels van de community
              </Link>
              .
            </p>
          )}

          <h2 className="mt-12 font-display text-xl font-bold text-ink">{zichtbaar.length === 0 ? "Nog geen reacties" : zichtbaar.length === 1 ? "1 reactie" : `${zichtbaar.length} reacties`}</h2>
          {lijst.length === 0 ? (
            <p className="mt-2 text-sm text-neutralx-600">Wees de eerste die reageert.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {lijst.map((r) => (
                <li key={r.id} id={`reactie-${r.id}`}>
                  <BerichtKaart bericht={r} onderwerpId={o.id} ingelogd={ingelogd} terug={pad} />
                </li>
              ))}
            </ol>
          )}

          <div className="mt-10">
            {o.status !== "zichtbaar" ? null : principal && status?.kan ? (
              <ReactieFormulier onderwerpId={o.id} />
            ) : principal ? (
              <p role="status" className="rounded-2xl border border-hair bg-paper-soft p-5 text-sm leading-relaxed text-neutralx-700">
                {status && !status.kan ? status.reden : "Reageren lukt op dit moment even niet. Probeer het straks opnieuw."}
              </p>
            ) : (
              <DoeMee terug={pad} />
            )}
          </div>

          <div className="mt-10 flex flex-wrap gap-3 border-t border-hair pt-8">
            <Link href="/community" className="btn-ghost">
              Meer onderwerpen
            </Link>
            <Link href="/community/regels" className="btn-ghost">
              Huisregels
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
