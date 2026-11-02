import Image from "next/image";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { BASE } from "@/lib/voorstel/schwarzwald";
import type { Blok, Pakket, Run } from "@/lib/voorstel/schwarzwald-paginas";

// Toont de letterlijk overgenomen inhoud van hetschwarzwald.nl in de nieuwe
// stijl. Tekstblokken staan in een smalle leeskolom, arrangementen en
// voordelen krijgen de volle breedte. Foto's die direct na elkaar komen worden
// één galerij.

const LINK = "font-semibold underline decoration-schw-orange decoration-2 underline-offset-4 hover:text-schw-orange";

function Linkje({ href, children }: { href: string; children: ReactNode }) {
  if (href.startsWith("/")) return <Link href={href} className={LINK}>{children}</Link>;
  if (/^(tel|mailto):/.test(href)) return <a href={href} className={LINK}>{children}</a>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  );
}

export function RunsWeergave({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) => {
        if (r.t === "\n") return <br key={i} />;
        const tekst = r.b ? <strong className="font-bold">{r.t}</strong> : r.t;
        return <Fragment key={i}>{r.href ? <Linkje href={r.href}>{tekst}</Linkje> : tekst}</Fragment>;
      })}
    </>
  );
}

function PakketKaart({ p }: { p: Pakket }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl3 bg-white shadow-[0_1px_2px_rgba(10,18,14,0.06),0_18px_40px_-24px_rgba(10,18,14,0.35)]">
      {p.foto && (
        <div className="relative aspect-[4/3]">
          <Image src={p.foto} alt="" fill sizes="(max-width: 768px) 100vw, 400px" className="object-cover" />
          {p.label && <span className="absolute left-3 top-3 rounded-full bg-schw-sun px-3 py-1 text-xs font-bold text-schw-night">{p.label}</span>}
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-display text-xl font-bold">{p.naam}</h3>
        {p.prijs && <p className="mt-1 font-display text-2xl font-bold text-schw-orange">{p.prijs}</p>}
        <ul className="mt-5 space-y-4 text-sm">
          {p.onderdelen.map((o, i) => (
            <li key={`${o.titel}-${i}`}>
              <p className="font-bold text-schw-night">{o.titel}</p>
              {o.tekst && <p className="mt-0.5 text-schw-mute">{o.tekst}</p>}
              {o.keuzes.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {o.keuzes.map((k) => (
                    <li key={k} className="rounded-full bg-schw-sand px-2.5 py-1 text-xs font-semibold">
                      {k}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-6">
          <Link
            href={`${BASE}/reserveren`}
            className="block rounded-full bg-schw-orange py-3 text-center text-sm font-bold text-schw-night transition-transform hover:-translate-y-0.5"
          >
            Reserveer dit arrangement
          </Link>
        </div>
      </div>
    </article>
  );
}

function Foto({ b, sizes }: { b: Extract<Blok, { type: "foto" }>; sizes: string }) {
  return (
    <Image src={b.src} alt={b.alt} width={b.w} height={b.h} sizes={sizes} className="h-full w-full rounded-2xl object-cover" />
  );
}

type Groep = { soort: "smal"; blokken: Blok[] } | { soort: "breed"; blok: Blok };

function groepeer(blokken: Blok[]): Groep[] {
  const out: Groep[] = [];
  for (const b of blokken) {
    if (b.type === "pakketten" || b.type === "usps") out.push({ soort: "breed", blok: b });
    else {
      const last = out[out.length - 1];
      if (last && last.soort === "smal") last.blokken.push(b);
      else out.push({ soort: "smal", blokken: [b] });
    }
  }
  return out;
}

function SmalleBlokken({ blokken }: { blokken: Blok[] }) {
  // opeenvolgende foto's samen als galerij
  const stukken: (Blok | Extract<Blok, { type: "foto" }>[])[] = [];
  for (const b of blokken) {
    const last = stukken[stukken.length - 1];
    if (b.type === "foto" && Array.isArray(last)) last.push(b);
    else stukken.push(b.type === "foto" ? [b] : b);
  }
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-8">
      {stukken.map((s, i) => {
        if (Array.isArray(s)) {
          const [eerste] = s;
          if (s.length === 1 && eerste) return <figure key={i} className="mt-8"><Foto b={eerste} sizes="(max-width: 768px) 100vw, 720px" /></figure>;
          return (
            <div key={i} className={`mt-8 grid gap-3 ${s.length === 2 || s.length === 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
              {s.map((f, j) => (
                <div key={j} className="aspect-square">
                  <Foto b={f} sizes="(max-width: 768px) 50vw, 240px" />
                </div>
              ))}
            </div>
          );
        }
        switch (s.type) {
          case "kop":
            if (s.niveau === 2) return <h2 key={i} className="mt-12 font-display text-3xl font-bold tracking-tight first:mt-0 sm:text-4xl">{s.tekst}</h2>;
            if (s.niveau === 3) return <h3 key={i} className="mt-10 font-display text-2xl font-bold first:mt-0">{s.tekst}</h3>;
            return <h4 key={i} className="mt-8 font-display text-xl font-bold first:mt-0">{s.tekst}</h4>;
          case "alinea":
            return (
              <p key={i} className="mt-4 text-lg leading-relaxed text-schw-night/85">
                <RunsWeergave runs={s.runs} />
              </p>
            );
          case "lijst":
            return (
              <ul key={i} className="mt-5 space-y-2.5">
                {s.items.map((it, j) => (
                  <li key={j} className="flex gap-3 text-lg leading-relaxed text-schw-night/85">
                    <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-schw-orange" />
                    <span>
                      <RunsWeergave runs={it} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "tabel":
            return (
              <div key={i} className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-schw-night/10">
                <table className="w-full text-left">
                  <tbody>
                    {s.rijen.map((r, j) => (
                      <tr key={j} className="border-b border-schw-night/10 last:border-0">
                        {r.map((c, k) => (
                          <td key={k} className={`px-4 py-3 ${k === 0 ? "font-semibold" : ""}`}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "knop":
            return (
              <p key={i} className="mt-6">
                <Link href={s.href} className="inline-block rounded-full bg-schw-night px-6 py-3 font-bold text-schw-cream transition-transform hover:-translate-y-0.5">
                  {s.tekst}
                </Link>
              </p>
            );
          case "video":
            return (
              <a
                key={i}
                href={`https://www.youtube.com/watch?v=${s.youtube}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 flex items-center gap-4 rounded-2xl bg-schw-night p-5 text-schw-cream transition-transform hover:-translate-y-0.5"
              >
                <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-schw-orange text-lg text-schw-night">▶</span>
                <span className="font-semibold">Bekijk de sfeervideo op YouTube</span>
              </a>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

export function SchwarzwaldBlokken({ blokken }: { blokken: Blok[] }) {
  return (
    <>
      {groepeer(blokken).map((g, i) => {
        if (g.soort === "smal") return <SmalleBlokken key={i} blokken={g.blokken} />;
        const b = g.blok;
        if (b.type === "pakketten") {
          return (
            <section key={i} className="my-14 bg-schw-sand py-14">
              <div className={`mx-auto grid max-w-[1280px] gap-6 px-4 sm:px-8 ${b.pakketten.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                {b.pakketten.map((p, j) => (
                  <PakketKaart key={`${p.naam}-${j}`} p={p} />
                ))}
              </div>
            </section>
          );
        }
        if (b.type === "usps") {
          return (
            <ul key={i} className="mx-auto my-10 grid max-w-[1280px] gap-3 px-4 sm:grid-cols-3 sm:px-8">
              {b.items.map((u) => (
                <li key={u} className="flex gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
                  <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-schw-orange text-xs font-bold text-schw-night">✓</span>
                  <span className="text-sm font-semibold leading-snug">{u}</span>
                </li>
              ))}
            </ul>
          );
        }
        return null;
      })}
    </>
  );
}
