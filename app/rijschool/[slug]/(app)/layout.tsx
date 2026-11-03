import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { laadRijschool } from "@/lib/rijschool/pagina";

// De app-schermen van een rijschool (inloggen, leerling, instructeur): een
// smalle kop met de naam van de rijschool. Werkt ook als de website zelf nog
// niet online staat.

export default async function RijschoolAppLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  const kop = (
    <>
      <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: "var(--rs-kleur)" }} aria-hidden>
        {r.naam.slice(0, 1).toUpperCase()}
      </span>
      <span className="truncate font-display font-bold">{r.naam}</span>
    </>
  );
  return (
    <>
      <header className="border-b border-hair bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-3">
          {r.online ? (
            <Link href={`/rijschool/${r.slug}`} className="flex min-w-0 items-center gap-2.5">
              {kop}
            </Link>
          ) : (
            <span className="flex min-w-0 items-center gap-2.5">{kop}</span>
          )}
        </div>
      </header>
      <main id="inhoud" className="mx-auto max-w-3xl px-4 pb-28 pt-5">
        {children}
      </main>
    </>
  );
}
