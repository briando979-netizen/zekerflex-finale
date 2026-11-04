import Link from "next/link";
import type { ReactNode } from "react";
import { YouTubeEmbed } from "@/components/ui/YouTubeEmbed";
import type { Achtergrond, Blok, Knop } from "@/lib/ontwerp/paginas";

// ---------------------------------------------------------------------------
// De blokken van een eigen pagina (Site-ontwerper → Pagina's) op de echte site,
// in de huisstijl: dezelfde klassen als de vaste pagina's, dus kleuren,
// lettertypes en vormen uit de ontwerper gelden hier ook. Geen scripts behalve
// de YouTube-speler die pas na een klik laadt.
// ---------------------------------------------------------------------------

export interface MediaInfo {
  alt: string;
  soort: "foto" | "video";
}

const ACHTERGROND: Record<Achtergrond, string> = {
  licht: "bg-paper text-ink",
  zacht: "bg-paper-soft text-ink",
  donker: "hero-ink text-white",
  merk: "bg-brand-500 text-white",
};
const donker = (a: Achtergrond) => a === "donker" || a === "merk";

function Alineas({ tekst, className = "" }: { tekst: string; className?: string }) {
  const alineas = tekst.split(/\n\s*\n/).map((a) => a.trim()).filter(Boolean);
  return (
    <>
      {alineas.map((a, i) => (
        <p key={i} className={className}>
          {a.split("\n").map((regel, j) => (
            <span key={j}>
              {j > 0 ? <br /> : null}
              {regel}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

function Knoppen({ knoppen, opDonker, midden = false }: { knoppen: Knop[]; opDonker: boolean; midden?: boolean }) {
  const echte = knoppen.filter((k) => k.tekst && k.link);
  if (!echte.length) return null;
  return (
    <div className={`mt-8 flex flex-wrap gap-3 ${midden ? "justify-center" : ""}`}>
      {echte.map((k, i) => {
        const cls = i === 0 ? (opDonker ? "btn-mint text-base" : "btn-primary text-base") : opDonker ? "btn-ghost-invert text-base" : "btn-ghost text-base";
        return k.link.startsWith("/") ? (
          <Link key={i} href={k.link} className={cls}>
            {k.tekst}
          </Link>
        ) : (
          <a key={i} href={k.link} className={cls} {...(k.link.startsWith("https:") ? { rel: "noopener" } : {})}>
            {k.tekst}
          </a>
        );
      })}
    </div>
  );
}

function Beeld({ id, media, className, groot = false }: { id: string; media: Record<string, MediaInfo>; className: string; groot?: boolean }) {
  if (!id || media[id]?.soort !== "foto") return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/beeld/${id}`}
      srcSet={`/beeld/${id}?klein=1 800w, /beeld/${id} 2400w`}
      sizes={groot ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 33vw, 100vw"}
      alt={media[id]?.alt ?? ""}
      loading={groot ? "eager" : "lazy"}
      decoding="async"
      className={className}
    />
  );
}

function Vak({ blok, children, smal = false }: { blok: Blok; children: ReactNode; smal?: boolean }) {
  return (
    <section className={ACHTERGROND[blok.achtergrond]}>
      <div className={`shell py-16 md:py-24 ${smal ? "max-w-3xl" : ""}`}>{children}</div>
    </section>
  );
}

function Kop({ tekst, opDonker, midden = false }: { tekst: string; opDonker: boolean; midden?: boolean }) {
  if (!tekst) return null;
  return <h2 className={`fluid-h2 text-balance font-display font-bold ${opDonker ? "text-white" : "text-ink"} ${midden ? "text-center" : ""}`}>{tekst}</h2>;
}

export function BlokWeergave({ blok, media, eerste }: { blok: Blok; media: Record<string, MediaInfo>; eerste: boolean }) {
  const opDonker = donker(blok.achtergrond);
  const zacht = opDonker ? "text-white/75" : "text-neutralx-600";
  switch (blok.soort) {
    case "hero": {
      const midden = blok.uitlijning === "midden";
      const metBeeld = Boolean(blok.beeld) && !midden;
      const Tag = eerste ? "h1" : "h2";
      return (
        <section className={ACHTERGROND[blok.achtergrond]}>
          <div className={`shell py-20 md:py-28 ${metBeeld ? "grid items-center gap-12 lg:grid-cols-2" : ""}`}>
            <div className={midden ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
              {blok.bovenregel ? <p className={`eyebrow ${opDonker ? "text-brand-mint" : ""}`}>{blok.bovenregel}</p> : null}
              <Tag className="mt-4 text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl">{blok.kop}</Tag>
              {blok.tekst ? <Alineas tekst={blok.tekst} className={`fluid-lead mt-6 ${zacht}`} /> : null}
              <Knoppen knoppen={[blok.knop, blok.knop2]} opDonker={opDonker} midden={midden} />
            </div>
            {metBeeld ? <Beeld id={blok.beeld} media={media} groot className="aspect-[4/3] w-full rounded-3xl object-cover shadow-lift" /> : null}
          </div>
        </section>
      );
    }
    case "tekst":
      return (
        <Vak blok={blok} smal>
          <Kop tekst={blok.kop} opDonker={opDonker} />
          <div className={`space-y-4 text-lg leading-relaxed ${blok.kop ? "mt-6" : ""} ${opDonker ? "text-white/85" : "text-neutralx-700"}`}>
            <Alineas tekst={blok.tekst} />
          </div>
        </Vak>
      );
    case "beeldTekst":
      return (
        <Vak blok={blok}>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className={blok.kant === "links" ? "lg:order-2" : ""}>
              <Kop tekst={blok.kop} opDonker={opDonker} />
              <div className={`mt-5 space-y-4 text-lg leading-relaxed ${zacht}`}>
                <Alineas tekst={blok.tekst} />
              </div>
              <Knoppen knoppen={[blok.knop]} opDonker={opDonker} />
            </div>
            <Beeld id={blok.beeld} media={media} groot className={`aspect-[4/3] w-full rounded-3xl object-cover shadow-card ${blok.kant === "links" ? "lg:order-1" : ""}`} />
          </div>
        </Vak>
      );
    case "kolommen":
      return (
        <Vak blok={blok}>
          <Kop tekst={blok.kop} opDonker={opDonker} />
          <div className={`mt-10 grid gap-5 sm:grid-cols-2 ${blok.items.length >= 3 ? "lg:grid-cols-3" : ""}`}>
            {blok.items.map((item, i) => (
              <div key={i} className={`rounded-2xl p-6 ${opDonker ? "bg-white/5 ring-1 ring-white/10" : "bg-white shadow-card"}`}>
                <p className={`font-display text-xl font-semibold ${opDonker ? "text-white" : "text-ink"}`}>{item.kop}</p>
                <p className={`mt-2 leading-relaxed ${zacht}`}>{item.tekst}</p>
              </div>
            ))}
          </div>
        </Vak>
      );
    case "cijfers":
      return (
        <Vak blok={blok}>
          <Kop tekst={blok.kop} opDonker={opDonker} midden />
          <dl className={`mt-10 grid gap-8 text-center sm:grid-cols-2 ${blok.items.length >= 3 ? "lg:grid-cols-3" : ""}`}>
            {blok.items.map((item, i) => (
              <div key={i} className="flex flex-col">
                <dt className={`text-sm ${zacht}`}>{item.label}</dt>
                <dd className={`num order-first font-display text-5xl font-bold ${opDonker ? "text-brand-mint" : "text-brand-500"}`}>{item.getal}</dd>
              </div>
            ))}
          </dl>
        </Vak>
      );
    case "faq":
      return (
        <Vak blok={blok} smal>
          <Kop tekst={blok.kop} opDonker={opDonker} />
          <div className="mt-8 space-y-3">
            {blok.items.map((item, i) => (
              <details key={i} className={`group rounded-2xl p-5 ${opDonker ? "bg-white/5" : "bg-white shadow-card"}`}>
                <summary className={`cursor-pointer list-none font-semibold ${opDonker ? "text-white" : "text-ink"}`}>{item.vraag}</summary>
                <div className={`mt-3 space-y-3 leading-relaxed ${zacht}`}>
                  <Alineas tekst={item.antwoord} />
                </div>
              </details>
            ))}
          </div>
        </Vak>
      );
    case "citaat":
      return (
        <Vak blok={blok} smal>
          <figure className="text-center">
            <blockquote className={`text-balance font-display text-2xl font-semibold leading-snug md:text-4xl ${opDonker ? "text-white" : "text-ink"}`}>&ldquo;{blok.tekst}&rdquo;</blockquote>
            {blok.naam ? <figcaption className={`mt-6 text-sm ${zacht}`}>{blok.naam}</figcaption> : null}
          </figure>
        </Vak>
      );
    case "video": {
      if (!blok.bron) return null;
      return (
        <Vak blok={blok} smal>
          <Kop tekst={blok.kop} opDonker={opDonker} />
          <div className={blok.kop ? "mt-8" : ""}>
            {blok.bron.startsWith("yt:") ? (
              <YouTubeEmbed id={blok.bron.slice(3)} title={blok.kop || "Video"} />
            ) : media[blok.bron]?.soort === "video" ? (
              <video controls preload="metadata" playsInline src={`/beeld/${blok.bron}`} className="aspect-video w-full rounded-2xl bg-black" aria-label={blok.kop || "Video"} />
            ) : null}
          </div>
        </Vak>
      );
    }
    case "galerij":
      if (!blok.beelden.length) return null;
      return (
        <Vak blok={blok}>
          <Kop tekst={blok.kop} opDonker={opDonker} />
          <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${blok.kop ? "mt-8" : ""}`}>
            {blok.beelden.map((id) => (
              <Beeld key={id} id={id} media={media} className="aspect-square w-full rounded-2xl object-cover" />
            ))}
          </div>
        </Vak>
      );
    case "oproep":
      return (
        <Vak blok={blok} smal>
          <div className="text-center">
            <Kop tekst={blok.kop} opDonker={opDonker} midden />
            {blok.tekst ? <Alineas tekst={blok.tekst} className={`fluid-lead mt-4 ${zacht}`} /> : null}
            <Knoppen knoppen={[blok.knop]} opDonker={opDonker} midden />
          </div>
        </Vak>
      );
    case "ruimte":
      return <div aria-hidden="true" className={`${ACHTERGROND[blok.achtergrond]} ${blok.grootte === "klein" ? "h-8" : blok.grootte === "groot" ? "h-32" : "h-16"}`} />;
  }
}

export function Blokken({ blokken, media }: { blokken: Blok[]; media: Record<string, MediaInfo> }) {
  return (
    <>
      {blokken.map((b, i) => (
        <BlokWeergave key={b.id} blok={b} media={media} eerste={i === 0} />
      ))}
    </>
  );
}
