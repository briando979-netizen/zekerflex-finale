import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { zaakVanSlug } from "@/lib/horeca/store";
import { leesMet } from "@/lib/horeca/link";
import { magAnnuleren } from "@/lib/horeca/reserveren";
import { nuNL, reserveringVoorGast } from "@/lib/horeca/reserveringen";
import { telefoonWeergave } from "@/lib/rijschool/format";
import { AnnuleerKnop } from "@/components/horeca/site/AnnuleerKnop";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reservering annuleren", robots: { index: false, follow: false } };

const dag = (d: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

// De link uit de bevestigingsmail: laat zien wat de gast annuleert, met een
// knop om het te bevestigen. Een ongeldige of oude link geeft een nette melding.
export default async function AnnuleerPagina({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const z = await zaakVanSlug(slug).catch(() => null);
  if (!z) notFound();
  const id = leesMet(env.AUTH_SECRET, "annuleer", decodeURIComponent(token));
  const r = id ? await reserveringVoorGast(z.id, id) : null;
  const tel = z.telefoon ? telefoonWeergave(z.telefoon) : "";
  const kan = r ? magAnnuleren(r, nuNL()) : false;

  return (
    <section className="mx-auto max-w-2xl px-4 py-14 sm:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--rs-accent-tekst)]">Reservering</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Reservering annuleren</h1>
      {!r ? (
        <p role="status" className="mt-6 rounded-[1.75rem] bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
          Deze link klopt niet (meer). {tel ? `Bel ons gerust op ${tel}.` : ""}
        </p>
      ) : r.status === "GEANNULEERD" ? (
        <p role="status" className="mt-6 rounded-[1.75rem] bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
          Deze reservering is al geannuleerd.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="rounded-[1.75rem] bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
            <p className="text-lg">
              <strong className="capitalize">{dag(r.datum)}</strong> om {r.tijd} uur, {r.personen} {r.personen === 1 ? "persoon" : "personen"}
            </p>
            <p className="mt-1 text-[#4B5563]">Op naam van {r.naam}</p>
          </div>
          {kan ? (
            <AnnuleerKnop slug={z.slug} token={decodeURIComponent(token)} />
          ) : (
            <p role="status" className="rounded-[1.75rem] bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
              Deze reservering kun je niet meer online annuleren. {tel ? `Bel ons even op ${tel}.` : ""}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
