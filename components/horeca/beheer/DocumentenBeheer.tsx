"use client";

import { useCallback, useEffect, useState } from "react";
import { DOCUMENT_SOORTEN, type DocumentSoort, type Medewerker } from "@/lib/horeca-personeel/model";
import type { PersoneelTeksten } from "@/lib/horeca-personeel/teksten";

// De documenten voor het personeel in het horeca-beheer: een pdf toevoegen voor iedereen of voor één medewerker, downloaden en
// verwijderen. Alle tekst komt van de server (lib/horeca-personeel/teksten.ts).

const API = "/api/horeca/personeel/documenten";
const veld = "mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

interface Doc {
  id: string;
  medewerkerId: string | null;
  soort: DocumentSoort;
  titel: string;
  bestand: string;
  op: string;
}

export function DocumentenBeheer({ t, taal, medewerkers }: { t: PersoneelTeksten["documenten"]; taal: string; medewerkers: Medewerker[] }) {
  const [lijst, setLijst] = useState<Doc[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [titel, setTitel] = useState("");
  const [soort, setSoort] = useState<DocumentSoort>("huisregels");
  const [voor, setVoor] = useState("");
  const [bestand, setBestand] = useState<File | null>(null);
  const [sleutel, setSleutel] = useState(0);

  const verwerk = useCallback(
    async (res: Response) => {
      const data = (await res.json().catch(() => ({}))) as { documenten?: Doc[]; error?: { message?: string } };
      if (!res.ok || !data.documenten) throw new Error(data.error?.message ?? t.fout);
      setLijst(data.documenten);
    },
    [t.fout],
  );

  useEffect(() => {
    void (async () => {
      try {
        await verwerk(await fetch(API, { cache: "no-store" }));
      } catch (e) {
        setFout(e instanceof Error ? e.message : t.fout);
      }
    })();
  }, [verwerk, t.fout]);

  async function voegToe() {
    if (!bestand) return;
    setBezig(true);
    setFout(null);
    try {
      const form = new FormData();
      form.set("file", bestand);
      form.set("titel", titel);
      form.set("soort", soort);
      form.set("medewerkerId", voor);
      await verwerk(await fetch(API, { method: "POST", body: form }));
      setTitel("");
      setBestand(null);
      setSleutel((s) => s + 1);
    } catch (e) {
      setFout(e instanceof Error ? e.message : t.fout);
    } finally {
      setBezig(false);
    }
  }

  async function weg(id: string) {
    setBezig(true);
    setFout(null);
    try {
      await verwerk(await fetch(API, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }));
    } catch (e) {
      setFout(e instanceof Error ? e.message : t.fout);
    } finally {
      setBezig(false);
    }
  }

  const naamVan = (id: string | null) => (id === null ? t.iedereen : medewerkers.find((m) => m.id === id)?.naam ?? "?");

  return (
    <section aria-labelledby="pers-docs-b" className="rounded-2xl border border-hair bg-white p-5">
      <h3 id="pers-docs-b" className="font-display text-lg font-bold text-ink">
        {t.kop}
      </h3>
      <p className="mt-1 text-sm text-neutralx-600">{t.uitleg}</p>
      {fout && (
        <p role="alert" className="mt-2 text-sm font-medium text-crit">
          {fout}
        </p>
      )}
      {lijst && lijst.length === 0 && <p className="mt-3 text-sm text-neutralx-500">{t.geen}</p>}
      {lijst && lijst.length > 0 && (
        <ul className="mt-3 divide-y divide-hair">
          {lijst.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{d.titel}</p>
                <p className="text-xs text-neutralx-500">
                  {t.soorten[d.soort]} · {naamVan(d.medewerkerId)} · {new Intl.DateTimeFormat(taal, { dateStyle: "medium", timeZone: "Europe/Amsterdam" }).format(new Date(d.op))}
                </p>
              </div>
              <a href={`${API}/${encodeURIComponent(d.id)}`} className="btn-ghost inline-flex min-h-[44px] items-center text-sm">
                {t.downloaden}
              </a>
              <button type="button" className="min-h-[44px] text-sm font-semibold text-crit hover:underline" disabled={bezig} onClick={() => void weg(d.id)}>
                {t.verwijder}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 grid gap-3 rounded-xl border border-hair p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void voegToe();
        }}
      >
        <div>
          <label htmlFor="doc-t" className="block text-sm font-medium text-ink">
            {t.titel}
          </label>
          <input id="doc-t" className={veld} required maxLength={80} value={titel} onChange={(e) => setTitel(e.target.value)} />
        </div>
        <div>
          <label htmlFor="doc-s" className="block text-sm font-medium text-ink">
            {t.soort}
          </label>
          <select id="doc-s" className={veld} value={soort} onChange={(e) => setSoort(e.target.value as DocumentSoort)}>
            {DOCUMENT_SOORTEN.map((s) => (
              <option key={s} value={s}>
                {t.soorten[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="doc-v" className="block text-sm font-medium text-ink">
            {t.voor}
          </label>
          <select id="doc-v" className={veld} value={voor} onChange={(e) => setVoor(e.target.value)}>
            <option value="">{t.iedereen}</option>
            {medewerkers
              .filter((m) => m.status !== "gestopt")
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.naam}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="doc-f" className="block text-sm font-medium text-ink">
            {t.pdfKies}
          </label>
          <input key={sleutel} id="doc-f" type="file" accept="application/pdf" required className={veld} onChange={(e) => setBestand(e.target.files?.[0] ?? null)} />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary min-h-[44px]" disabled={bezig || !bestand || titel.trim().length === 0}>
            {bezig ? t.bezig : t.toevoegen}
          </button>
        </div>
      </form>
    </section>
  );
}
