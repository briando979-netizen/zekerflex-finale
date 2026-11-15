"use client";

import { useCallback, useEffect, useState } from "react";
import type { PersoneelTeksten } from "@/lib/horeca-personeel/teksten";

// De loonstroken van één medewerker in het horeca-beheer (components/horeca/beheer/PersoneelTab.tsx): een pdf met een periode
// toevoegen, downloaden en verwijderen. Alle tekst komt van de server (lib/horeca-personeel/teksten.ts).

const API = "/api/horeca/personeel/loonstroken";

interface Strook {
  id: string;
  periode: string;
  bestand: string;
  grootte: number;
  op: string;
}

const veld = "mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

export function LoonstrokenBeheer({ t, taal, medewerkerId }: { t: PersoneelTeksten["beheer"]; taal: string; medewerkerId: string }) {
  const [lijst, setLijst] = useState<Strook[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [periode, setPeriode] = useState("");
  const [bestand, setBestand] = useState<File | null>(null);
  const [sleutel, setSleutel] = useState(0);

  const antwoord = useCallback(
    async (res: Response) => {
      const data = (await res.json().catch(() => ({}))) as { loonstroken?: Strook[]; error?: { message?: string } };
      if (!res.ok || !data.loonstroken) throw new Error(data.error?.message ?? t.fout);
      setLijst(data.loonstroken);
    },
    [t.fout],
  );

  useEffect(() => {
    void (async () => {
      try {
        await antwoord(await fetch(`${API}?medewerker=${encodeURIComponent(medewerkerId)}`, { cache: "no-store" }));
      } catch (e) {
        setFout(e instanceof Error ? e.message : t.fout);
      }
    })();
  }, [medewerkerId, antwoord, t.fout]);

  async function voegToe() {
    if (!bestand) return;
    setBezig(true);
    setFout(null);
    try {
      const form = new FormData();
      form.set("file", bestand);
      form.set("medewerkerId", medewerkerId);
      form.set("periode", periode);
      await antwoord(await fetch(API, { method: "POST", body: form }));
      setPeriode("");
      setBestand(null);
      setSleutel((s) => s + 1); // het bestandsveld leegmaken
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
      await antwoord(await fetch(API, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, medewerkerId }) }));
    } catch (e) {
      setFout(e instanceof Error ? e.message : t.fout);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-hair p-3">
      <p className="text-xs text-neutralx-500">{t.loonstrokenUitleg}</p>
      {fout && (
        <p role="alert" className="text-sm font-medium text-crit">
          {fout}
        </p>
      )}
      {lijst && lijst.length === 0 && <p className="text-sm text-neutralx-500">{t.geenLoonstroken}</p>}
      {lijst && lijst.length > 0 && (
        <ul className="divide-y divide-hair">
          {lijst.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{l.periode}</p>
                <p className="text-xs text-neutralx-500">{new Intl.DateTimeFormat(taal, { dateStyle: "medium", timeZone: "Europe/Amsterdam" }).format(new Date(l.op))}</p>
              </div>
              <a href={`${API}/${encodeURIComponent(l.id)}`} className="btn-ghost inline-flex min-h-[44px] items-center text-sm">
                {t.downloaden}
              </a>
              <button type="button" className="min-h-[44px] text-sm font-semibold text-crit hover:underline" disabled={bezig} onClick={() => void weg(l.id)}>
                {t.verwijder}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void voegToe();
        }}
      >
        <div>
          <label htmlFor={`lstr-p-${medewerkerId}`} className="block text-sm font-medium text-ink">
            {t.periode}
          </label>
          <input id={`lstr-p-${medewerkerId}`} className={veld} required maxLength={40} value={periode} onChange={(e) => setPeriode(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`lstr-f-${medewerkerId}`} className="block text-sm font-medium text-ink">
            {t.pdfKies}
          </label>
          <input key={sleutel} id={`lstr-f-${medewerkerId}`} type="file" accept="application/pdf" required className={veld} onChange={(e) => setBestand(e.target.files?.[0] ?? null)} />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary min-h-[44px]" disabled={bezig || !bestand || periode.trim().length === 0}>
            {bezig ? t.bezig : t.toevoegen}
          </button>
        </div>
      </form>
    </div>
  );
}
