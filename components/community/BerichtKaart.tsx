import { Auteur } from "@/components/community/Auteur";
import { HandigKnop, MeldKnop, VerwijderKnop } from "@/components/community/BerichtKnoppen";
import { PlatteTekst } from "@/components/community/PlatteTekst";
import type { BerichtWeergave } from "@/lib/community/weergave";

/**
 * Eén bericht in een onderwerp (het onderwerp zelf of een reactie). Een verwijderd of verborgen bericht van een ander toont
 * alleen dat het er was; de schrijver ziet zijn eigen verborgen bericht met de uitleg erbij.
 */
export function BerichtKaart({
  bericht,
  onderwerpId,
  ingelogd,
  terug,
  groot = false,
}: {
  bericht: BerichtWeergave;
  onderwerpId: string;
  ingelogd: boolean;
  terug: string;
  /** het onderwerp zelf: grotere tekst */
  groot?: boolean;
}) {
  const weg = bericht.status === "verwijderd" || (bericht.status === "verborgen" && !bericht.vanMij);
  if (weg) {
    return (
      <div className="rounded-2xl border border-dashed border-hair bg-paper-soft px-5 py-4 text-sm text-neutralx-500">
        {bericht.status === "verwijderd" ? "Deze reactie is verwijderd." : "Deze reactie is verborgen."}
        {bericht.uitleg ? <span className="mt-1 block">{bericht.uitleg}</span> : null}
      </div>
    );
  }
  return (
    <div className="relative rounded-2xl border border-hair bg-white p-5 md:p-6">
      <Auteur auteur={bericht.auteur} wanneer={bericht.wanneer} />
      {bericht.uitleg && (
        <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-ink">
          {bericht.uitleg}
        </p>
      )}
      <PlatteTekst tekst={bericht.tekst} className={`mt-4 leading-relaxed text-neutralx-700 ${groot ? "text-[1.02rem]" : "text-[0.95rem]"}`} />
      {bericht.fotos.length > 0 && (
        <div className={`mt-4 grid gap-2 ${bericht.fotos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {bericht.fotos.map((f, i) => (
            <a key={f} href={f} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl border border-hair bg-paper-soft">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f} alt={`Foto ${i + 1} bij dit bericht`} loading="lazy" className="max-h-[28rem] w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {bericht.status === "zichtbaar" && (
          <HandigKnop
            onderwerpId={onderwerpId}
            reactieId={bericht.reactieId}
            aantal={bericht.handig}
            aan={bericht.ikVondHandig}
            ingelogd={ingelogd}
            eigen={bericht.vanMij}
            terug={terug}
          />
        )}
        {bericht.status === "zichtbaar" && !bericht.vanMij ? <MeldKnop onderwerpId={onderwerpId} reactieId={bericht.reactieId} /> : null}
        {bericht.vanMij && <VerwijderKnop onderwerpId={onderwerpId} reactieId={bericht.reactieId} />}
      </div>
    </div>
  );
}
