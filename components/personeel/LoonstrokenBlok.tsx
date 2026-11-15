"use client";

import { useEffect, useState } from "react";
import type { PersoneelTeksten } from "@/lib/horeca-personeel/teksten";

// De eigen loonstroken van een medewerker (app/personeel): alleen een lijst met een downloadlink per strook. Het bestand komt via
// /api/personeel/loonstroken/[id], dat alleen stroken van deze medewerker teruggeeft.

interface Strook {
  id: string;
  periode: string;
  grootte: number;
  op: string;
}

export function LoonstrokenBlok({ t, taal }: { t: PersoneelTeksten["omgeving"]; taal: string }) {
  const [lijst, setLijst] = useState<Strook[] | null>(null);
  const [fout, setFout] = useState(false);

  useEffect(() => {
    let weg = false;
    void (async () => {
      try {
        const res = await fetch("/api/personeel/loonstroken", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { loonstroken?: Strook[] };
        if (!weg) {
          if (res.ok && data.loonstroken) setLijst(data.loonstroken);
          else setFout(true);
        }
      } catch {
        if (!weg) setFout(true);
      }
    })();
    return () => {
      weg = true;
    };
  }, []);

  return (
    <section aria-labelledby="pers-loon" className="space-y-3">
      <h2 id="pers-loon" className="font-display text-xl font-bold text-ink">
        {t.loonstrokenKop}
      </h2>
      {fout && (
        <p role="alert" className="text-sm font-medium text-crit">
          {t.fout}
        </p>
      )}
      {lijst === null && !fout ? (
        <p className="text-sm text-neutralx-500">{t.bezig}</p>
      ) : lijst && lijst.length === 0 ? (
        <p className="text-sm text-neutralx-500">{t.geenLoonstroken}</p>
      ) : (
        <ul className="divide-y divide-hair rounded-2xl border border-hair bg-white">
          {(lijst ?? []).map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{l.periode}</p>
                <p className="text-xs text-neutralx-500">{new Intl.DateTimeFormat(taal, { dateStyle: "medium", timeZone: "Europe/Amsterdam" }).format(new Date(l.op))}</p>
              </div>
              <a href={`/api/personeel/loonstroken/${encodeURIComponent(l.id)}`} className="btn-ghost inline-flex min-h-[44px] items-center text-sm">
                {t.downloaden}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
