"use client";

import { BEHEER_API, KAART, KNOP_LICHT, Melding, Pil, dagNaam, useBeheerData, vraag } from "@/components/voorstel/beheer/api";
import { INTERESSES, INTERESSE_LABEL, type Interesse } from "@/lib/voorstel/indoor-regels";

// Interesselijst voor het nieuwe indoor megacenter: wie het als eerste wil
// weten, en waarvoor. Er gaat vanuit de site geen mail uit; bij de opening
// exporteert het team de lijst naar Excel of hun nieuwsbriefprogramma.

interface Aanmelding {
  id: string;
  email: string;
  naam: string;
  interesses: Interesse[];
  groep?: number;
  dag: string;
}

const URL_INDOOR = `${BEHEER_API}/indoor`;

export function Indoor({ openKlant }: { openKlant: (email: string) => void }) {
  const { data, setData, fout, setFout, laad } = useBeheerData<{ aanmeldingen: Aanmelding[]; perInteresse: Record<Interesse, number> }>(URL_INDOOR);
  const lijst = data?.aanmeldingen ?? [];

  async function verwijder(a: Aanmelding) {
    if (!window.confirm(`${a.email} van de interesselijst halen?`)) return;
    try {
      await vraag(URL_INDOOR, { method: "DELETE", body: { id: a.id } });
      setData((d) => {
        if (!d) return d;
        const aanmeldingen = d.aanmeldingen.filter((x) => x.id !== a.id);
        const perInteresse = { ...d.perInteresse };
        for (const i of a.interesses) perInteresse[i] = Math.max(0, (perInteresse[i] ?? 0) - 1);
        return { aanmeldingen, perInteresse };
      });
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Verwijderen mislukt.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto max-w-2xl text-sm text-schw-mute">
          Gasten die het als eerste willen weten als het indoor megacenter opengaat. Er gaat vanuit de site geen mail uit: exporteer de lijst bij de opening. Aanmeldingen
          vervallen na 18 maanden vanzelf.
        </p>
        <a href={`${URL_INDOOR}?formaat=csv`} className={KNOP_LICHT}>
          Export (Excel)
        </a>
        <button type="button" onClick={() => void laad()} className={KNOP_LICHT}>
          Vernieuwen
        </button>
      </div>
      <Melding fout={fout} />
      {data && (
        <section aria-label="Per interesse" className={KAART}>
          <p className="font-display text-3xl font-bold">
            {lijst.length} <span className="text-base font-semibold text-schw-mute">{lijst.length === 1 ? "aanmelding" : "aanmeldingen"}</span>
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {INTERESSES.map((i) => (
              <li key={i} className="rounded-full bg-schw-sand px-3 py-1 text-sm">
                {INTERESSE_LABEL[i]}: <strong>{data.perInteresse[i] ?? 0}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data && lijst.length === 0 && <p className="text-schw-mute">Nog niemand aangemeld.</p>}
      <ul className="space-y-3">
        {lijst.map((a) => (
          <li key={a.id} className={KAART}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  <a href={`mailto:${a.email}`} className="underline">
                    {a.email}
                  </a>
                  {a.naam && <span className="font-normal"> · {a.naam}</span>}
                  {a.groep ? <span className="font-normal text-schw-mute"> · ± {a.groep} personen</span> : null}
                </p>
                <p className="mt-1 text-sm text-schw-mute first-letter:uppercase">aangemeld op {dagNaam(a.dag, { day: "numeric", month: "long", year: "numeric" })}</p>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {a.interesses.length === 0 ? (
                    <span className="text-sm text-schw-mute">Geen voorkeur opgegeven</span>
                  ) : (
                    a.interesses.map((i) => <Pil key={i} label={INTERESSE_LABEL[i]} kleur="bg-schw-sun text-schw-night" />)
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => openKlant(a.email)} className={KNOP_LICHT}>
                  Klantdossier
                </button>
                <button type="button" onClick={() => void verwijder(a)} className={`${KNOP_LICHT} text-[#B91C1C]`}>
                  Verwijderen
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
