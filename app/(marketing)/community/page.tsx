import { getSiteT } from "@/lib/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { getPrincipal } from "@/lib/auth";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { CATEGORIEEN, WELKOM, isCategorie, sorteerOnderwerpen, type Categorie, type Sortering } from "@/lib/community/regels";
import { alleOnderwerpen } from "@/lib/community/store";
import { schrijfStatus } from "@/lib/community/toegang";
import { onderwerpKaart, schrijversVan } from "@/lib/community/weergave";
import { DoeMee } from "@/components/community/DoeMee";
import { OnderwerpFormulier } from "@/components/community/OnderwerpFormulier";

// De ZekerFlex community (22 nov 2026, eigenaar: "een communicatie op zekerflex zelf … waar iedereen kan deelnemen praten
// uploaden openbaar"): het overzicht van de onderwerpen, vastgepind en actiefste eerst, met een filter op categorie. Lezen
// kan iedereen; meedoen met een gratis account (lib/community). Vervangt de lege Google Groep.

const TITLE = "Community: praat mee met werkers en bedrijven";
const DESCRIPTION =
  "De ZekerFlex community: stel je vraag over flexwerk, deel je ervaring en geef tips. Voor werkers en bedrijven. Lezen kan iedereen, meedoen met een gratis account.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/community", { title: TITLE, description: DESCRIPTION }),
};

// de onderwerpen komen uit de opslag: zonder dit legt de build een lege lijst vast
export const dynamic = "force-dynamic";

const PER_PAGINA = 30;

function adres(categorie: Categorie | null, sortering: Sortering, pagina = 1): string {
  const q = new URLSearchParams();
  if (categorie) q.set("categorie", categorie);
  if (sortering !== "actief") q.set("sorteer", sortering);
  if (pagina > 1) q.set("pagina", String(pagina));
  const s = q.toString();
  return s ? `/community?${s}` : "/community";
}

export default async function CommunityPage(props: { searchParams: Promise<{ categorie?: string; sorteer?: string; pagina?: string }> }) {
  const tx = await getSiteT();
  const sp = await props.searchParams;
  const categorie = isCategorie(sp.categorie) ? sp.categorie : null;
  const sortering: Sortering = sp.sorteer === "nieuw" ? "nieuw" : "actief";
  const pagina = Math.min(200, Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1));
  const nu = new Date();

  const [alle, principal] = await Promise.all([alleOnderwerpen().catch(() => [WELKOM]), getPrincipal().catch(() => null)]);
  const gesorteerd = sorteerOnderwerpen(alle, sortering, categorie);
  const deze = gesorteerd.slice((pagina - 1) * PER_PAGINA, pagina * PER_PAGINA);
  const [schrijvers, status] = await Promise.all([
    schrijversVan(deze).catch(() => new Map()),
    principal ? schrijfStatus(principal, nu).catch(() => null) : Promise.resolve(null),
  ]);
  const kaarten = deze.map((o) => onderwerpKaart(o, schrijvers, nu));
  const meer = gesorteerd.length > pagina * PER_PAGINA;
  const tab = (actief: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-semibold transition ${actief ? "border-ink bg-ink text-white" : "border-hair bg-paper text-ink hover:border-ink"}`;

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbJsonLd([["Community", "/community"]])) }}
      />
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">{tx("Community")}</p>
          <h1 className="mt-3 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">{tx("Praat mee met werkers en bedrijven")}</h1>
          <p className="mt-5 max-w-xl text-lg text-white/70">
            {tx("Stel je vraag over flexwerk, deel hoe je klus ging of geef een tip. Werkers, bedrijven en het ZekerFlex-team lezen mee. Lezen kan iedereen; meedoen kan met een gratis account.")}
          </p>
          <p className="mt-6 text-sm text-white/70">
            <Link href="/community/regels" className="font-semibold text-brand-mint underline underline-offset-4">
              {tx("Lees de huisregels")}
            </Link>{" "}
            {tx("· respectvol, geen reclame, geen privégegevens, meld wat niet klopt.")}
          </p>
        </div>
      </div>

      <section className="bg-paper">
        <div className="shell py-10 md:py-14">
          <div className="max-w-3xl">
            {principal && status?.kan ? (
              <OnderwerpFormulier categorie={categorie} />
            ) : principal ? (
              <p role="status" className="rounded-2xl border border-hair bg-paper-soft p-5 text-sm leading-relaxed text-neutralx-700">
                {status && !status.kan ? status.reden : "Meedoen lukt op dit moment even niet. Probeer het straks opnieuw."}
              </p>
            ) : (
              <DoeMee terug={adres(categorie, sortering, pagina)} />
            )}
          </div>

          <nav aria-label={tx("Categorieën")} className="mt-10 flex flex-wrap gap-2">
            <Link href={adres(null, sortering)} className={tab(!categorie)} aria-current={!categorie ? "page" : undefined}>
              {tx("Alles")}
            </Link>
            {CATEGORIEEN.map((c) => (
              <Link key={c.sleutel} href={adres(c.sleutel, sortering)} className={tab(categorie === c.sleutel)} aria-current={categorie === c.sleutel ? "page" : undefined}>
                {tx(c.naam)}
              </Link>
            ))}
          </nav>
          <nav aria-label={tx("Volgorde")} className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-neutralx-500">{tx("Volgorde:")}</span>
            <Link href={adres(categorie, "actief")} aria-current={sortering === "actief" ? "page" : undefined} className={sortering === "actief" ? "font-semibold text-ink underline underline-offset-4" : "text-neutralx-600 hover:text-ink"}>
              {tx("Actiefste eerst")}
            </Link>
            <Link href={adres(categorie, "nieuw")} aria-current={sortering === "nieuw" ? "page" : undefined} className={sortering === "nieuw" ? "font-semibold text-ink underline underline-offset-4" : "text-neutralx-600 hover:text-ink"}>
              {tx("Nieuwste eerst")}
            </Link>
          </nav>

          {kaarten.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-dashed border-hair bg-paper-soft p-6 text-neutralx-600">
              {categorie ? "In deze categorie staat nog geen onderwerp. Start er zelf een, of kijk bij Alles." : "Er staat nog geen onderwerp. Start er zelf een!"}
            </p>
          ) : (
            <ul className="mt-6 space-y-3">
              {kaarten.map((k) => (
                <li key={k.id}>
                  <Link
                    href={k.pad}
                    className="group block rounded-2xl border border-hair bg-white p-5 shadow-e1 transition hover:-translate-y-0.5 hover:border-ink/30 hover:shadow-e3 md:p-6"
                  >
                    <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutralx-500">
                      {k.vastgepind && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">{tx("Vastgepind")}</span>}
                      <span className="rounded-full bg-paper-200 px-2 py-0.5 text-neutralx-700">{k.categorieNaam}</span>
                      <span>
                        {tx(k.auteur.naam)}
                        {k.auteur.rolLabel ? ` · ${k.auteur.rolLabel}` : ""}
                      </span>
                    </span>
                    <h2 className="mt-2 break-words font-display text-lg font-semibold text-ink group-hover:underline group-hover:underline-offset-4">{tx(k.titel)}</h2>
                    <p className="mt-1.5 break-words text-sm leading-relaxed text-neutralx-600">{k.uittreksel}</p>
                    <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutralx-500">
                      <span>{k.aantalReacties === 1 ? "1 reactie" : `${k.aantalReacties} reacties`}</span>
                      {k.handig > 0 && <span>👍 {k.handig} handig</span>}
                      {k.fotos > 0 && <span>📷 {k.fotos === 1 ? "1 foto" : `${k.fotos} foto's`}</span>}
                      <span>{k.aantalReacties > 0 ? `laatste reactie ${k.laatste}` : `geplaatst ${k.wanneer}`}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {(pagina > 1 || meer) && (
            <nav aria-label={tx("Pagina's")} className="mt-8 flex flex-wrap gap-3">
              {pagina > 1 && (
                <Link href={adres(categorie, sortering, pagina - 1)} className="btn-ghost">
                  {tx("← Vorige")}
                </Link>
              )}
              {meer && (
                <Link href={adres(categorie, sortering, pagina + 1)} className="btn-ghost">
                  {tx("Volgende →")}
                </Link>
              )}
            </nav>
          )}

          <div className="mt-14 max-w-3xl rounded-2xl border border-hair bg-paper p-6 md:p-8">
            <h2 className="font-display text-xl font-bold text-ink">{tx("Zo werkt de community")}</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-neutralx-600">
              <li>{tx("Iedereen kan lezen. Met een gratis account start je een onderwerp, reageer je en deel je foto's, als werker of als bedrijf.")}</li>
              <li>
                {tx("Bij een bericht staan je voornaam, de eerste letter van je achternaam, je profielfoto en of je werker of bedrijf bent. Nooit je achternaam, e-mailadres of telefoonnummer.")}
              </li>
              <li>{tx("Uit foto's halen we de locatie en andere gegevens voordat ze online komen.")}</li>
              <li>
                {tx("Zie je iets wat niet klopt? Klik op Melden bij dat bericht, ook zonder account. Na meldingen van drie verschillende mensen verdwijnt een bericht vanzelf tot wij het hebben bekeken.")}
              </li>
            </ul>
            <p className="mt-4 text-sm">
              <Link href="/community/regels" className="font-semibold text-ink underline underline-offset-4">
                {tx("Alle huisregels en hoe melden werkt")}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
