import Image from "next/image";
import Link from "next/link";
import { BASE, CATEGORIE_LABEL, type Activiteit } from "@/lib/voorstel/schwarzwald";

// Bouwstenen die op meerdere Schwarzwald-pagina's terugkomen. Geen hooks, dus
// bruikbaar in server- én clientcomponenten.

/** Foto, of een gekleurd vlak met de naam als er (nog) geen foto is. */
export function Beeld({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
}: {
  src: string | undefined;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (src) {
    return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={`object-cover ${className}`} />;
  }
  return (
    <div
      role="img"
      aria-label={alt}
      className="absolute inset-0 grid place-items-center overflow-hidden bg-[radial-gradient(circle_at_30%_20%,#FF8A3D_0%,#FF5F1F_35%,#1C3A2B_100%)]"
    >
      <span aria-hidden="true" className="select-none px-4 text-center font-display text-4xl font-bold uppercase leading-none text-schw-night/25 sm:text-5xl">
        {alt}
      </span>
    </div>
  );
}

export function ActiviteitKaart({ a, priority = false }: { a: Activiteit; priority?: boolean }) {
  return (
    <Link
      href={`${BASE}/activiteiten/${a.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-xl3 bg-white shadow-[0_1px_2px_rgba(10,18,14,0.06),0_18px_40px_-24px_rgba(10,18,14,0.35)] transition-transform duration-300 ease-spring hover:-translate-y-1"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Beeld
          src={a.foto}
          alt={a.naam}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
          priority={priority}
          className="transition-transform duration-700 ease-spring group-hover:scale-105"
        />
        <span className="absolute left-3 top-3 rounded-full bg-schw-night/80 px-3 py-1 text-xs font-semibold text-schw-cream backdrop-blur">
          {CATEGORIE_LABEL[a.categorie]}
        </span>
        {a.binnen && (
          <span className="absolute right-3 top-3 rounded-full bg-schw-sun px-3 py-1 text-xs font-bold text-schw-night">Binnen</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl font-bold text-schw-night">{a.naam}</h3>
        <p className="mt-1 text-sm text-schw-mute">{a.kort}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div className="text-sm">
            <p className="font-bold text-schw-night">{a.prijs}</p>
            <p className="text-schw-mute">{a.duur}</p>
          </div>
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-schw-orange text-schw-night transition-transform duration-300 group-hover:rotate-[-35deg]"
          >
            →
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Ontvangst → activiteit → eten: het all-in programma als tijdlijn. */
export function ArrangementBlok({ stappen, prijs, titel = "All-in arrangement" }: { stappen: string[]; prijs: string; titel?: string }) {
  return (
    <div className="rounded-xl3 bg-schw-night p-6 text-schw-cream sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">{titel}</p>
      <ol className="mt-5 space-y-4">
        {stappen.map((s, i) => (
          <li key={s} className="flex gap-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-schw-orange font-display text-sm font-bold text-schw-night">
              {i + 1}
            </span>
            <span className="pt-1">{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 border-t border-white/10 pt-5 font-display text-2xl font-bold">{prijs}</p>
    </div>
  );
}

export function Sterren({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`tracking-[0.1em] text-schw-sun ${className}`}>
      ★★★★★
    </span>
  );
}
