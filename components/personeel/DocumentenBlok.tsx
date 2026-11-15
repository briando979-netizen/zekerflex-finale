"use client";

import { useEffect, useState } from "react";
import type { PersoneelTeksten } from "@/lib/horeca-personeel/teksten";

// De documenten van een medewerker (app/personeel): een lijst met een downloadlink per document. Het bestand komt via
// /api/personeel/documenten/[id], dat alleen documenten voor iedereen of voor deze medewerker teruggeeft.

interface Doc {
  id: string;
  titel: string;
  soort: "contract" | "huisregels" | "handboek" | "overig";
  op: string;
}

export function DocumentenBlok({ t, taal }: { t: PersoneelTeksten["documenten"]; taal: string }) {
  const [lijst, setLijst] = useState<Doc[] | null>(null);
  const [fout, setFout] = useState(false);

  useEffect(() => {
    let weg = false;
    void (async () => {
      try {
        const res = await fetch("/api/personeel/documenten", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { documenten?: Doc[] };
        if (!weg) {
          if (res.ok && data.documenten) setLijst(data.documenten);
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
    <section aria-labelledby="pers-docs" className="space-y-3">
      <h2 id="pers-docs" className="font-display text-xl font-bold text-ink">
        {t.kop}
      </h2>
      {fout && (
        <p role="alert" className="text-sm font-medium text-crit">
          {t.fout}
        </p>
      )}
      {lijst === null && !fout ? (
        <p className="text-sm text-neutralx-500">{t.bezig}</p>
      ) : lijst && lijst.length === 0 ? (
        <p className="text-sm text-neutralx-500">{t.geen}</p>
      ) : (
        <ul className="divide-y divide-hair rounded-2xl border border-hair bg-white">
          {(lijst ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{d.titel}</p>
                <p className="text-xs text-neutralx-500">
                  {t.soorten[d.soort]} · {new Intl.DateTimeFormat(taal, { dateStyle: "medium", timeZone: "Europe/Amsterdam" }).format(new Date(d.op))}
                </p>
              </div>
              <a href={`/api/personeel/documenten/${encodeURIComponent(d.id)}`} className="btn-ghost inline-flex min-h-[44px] items-center text-sm">
                {t.downloaden}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
