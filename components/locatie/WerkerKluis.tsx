"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KLUIS_SOORT_ICOON, type KluisItemMeta } from "@/lib/locatie/modules";
import { LOCATIE_TEKSTEN, type LocatieTeksten } from "@/lib/locatie/teksten";

// ---------------------------------------------------------------------------
// Werker → Toegangscodes: per dienst de codes die de werkgever klaarzette,
// zichtbaar van `minutenVooraf` vóór de dienst tot het einde. Een geheim
// ophalen staat in het logboek van de werkgever (lib/locatie/kluis.ts).
// ---------------------------------------------------------------------------

interface Dienst {
  shiftId: string;
  titel: string;
  tenantId: string;
  bedrijf: string;
  branchId: string;
  vestiging: string;
  startsAt: string;
  endsAt: string;
  items: KluisItemMeta[];
}

function klok(iso: string): string {
  const p = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("hour")}:${v("minute")}`;
}

export function WerkerKluis({ t = LOCATIE_TEKSTEN.nl, terugHref = "/dashboard/account" }: { t?: LocatieTeksten; terugHref?: string }) {
  const [diensten, setDiensten] = useState<Dienst[] | null>(null);
  const [open, setOpen] = useState<Record<string, string>>({});
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/kluis", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { diensten?: Dienst[] }) => setDiensten(d.diensten ?? []))
      .catch(() => setDiensten([]));
  }, []);

  const toon = async (d: Dienst, item: KluisItemMeta) => {
    setBezig(item.id);
    setFout(null);
    const r = await fetch("/api/me/kluis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: d.tenantId, itemId: item.id }) }).catch(() => null);
    const data = r ? ((await r.json().catch(() => ({}))) as { geheim?: string; error?: { message?: string } }) : null;
    setBezig(null);
    if (!r?.ok || !data?.geheim) return setFout(data?.error?.message ?? t.kluis.fout);
    setOpen((o) => ({ ...o, [item.id]: data.geheim! }));
  };

  return (
    <div>
      <Link href={terugHref} className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        {t.terug}
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-ink">🔐 {t.kluis.titel}</h1>
      <p className="mt-1 text-sm text-neutralx-500">{t.kluis.uitleg}</p>
      {fout && (
        <p role="alert" className="mt-4 rounded-xl border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}
      {diensten === null ? (
        <p className="mt-6 text-sm text-neutralx-400">…</p>
      ) : diensten.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-hair bg-white px-4 py-8 text-center text-sm text-neutralx-500">{t.kluis.leeg}</p>
      ) : (
        <div className="mt-6 space-y-4">
          {diensten.map((d) => (
            <section key={d.shiftId} className="overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
              <div className="border-b border-hair px-4 py-3">
                <p className="font-semibold text-ink">{d.titel}</p>
                <p className="text-xs text-neutralx-500">
                  {d.bedrijf} · {d.vestiging} · {klok(d.startsAt)}–{klok(d.endsAt)} · {t.kluis.tot(klok(d.endsAt))}
                </p>
              </div>
              <ul className="divide-y divide-hair">
                {d.items.map((i) => {
                  const geheim = open[i.id];
                  return (
                    <li key={i.id} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xl" aria-hidden>
                          {KLUIS_SOORT_ICOON[i.soort]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink">{i.titel}</p>
                          {i.gebruikersnaam && (
                            <p className="text-xs text-neutralx-500">
                              {t.kluis.gebruikersnaam}: <span className="font-mono text-ink">{i.gebruikersnaam}</span>
                            </p>
                          )}
                          {i.notitie && <p className="text-xs text-neutralx-500">{i.notitie}</p>}
                        </div>
                        {geheim === undefined ? (
                          <button type="button" disabled={bezig === i.id} onClick={() => void toon(d, i)} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                            {t.kluis.toon}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setOpen((o) => {
                                const k = { ...o };
                                delete k[i.id];
                                return k;
                              })
                            }
                            className="rounded-lg border border-hairstrong px-3 py-2 text-sm font-medium text-ink"
                          >
                            {t.kluis.verberg}
                          </button>
                        )}
                      </div>
                      {geheim !== undefined && (
                        <div className="mt-2 flex items-center gap-2">
                          <code className="flex-1 select-all break-all rounded-lg bg-paper-soft px-3 py-2 text-base font-semibold tracking-wide text-ink">{geheim}</code>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(geheim).then(() => {
                                setGekopieerd(i.id);
                                setTimeout(() => setGekopieerd(null), 1500);
                              });
                            }}
                            className="rounded-lg border border-hairstrong px-3 py-2 text-xs font-medium text-ink"
                          >
                            {gekopieerd === i.id ? t.kluis.gekopieerd : t.kluis.kopieer}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="text-center text-xs text-neutralx-400">{t.kluis.gelogd}</p>
        </div>
      )}
    </div>
  );
}
