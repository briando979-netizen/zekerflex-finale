"use client";

import { useEffect, useRef, useState } from "react";
import { Portal } from "@/components/chat/Portal";
import { useDialog } from "@/components/app/useDialog";
import { useFT } from "@/components/i18n/useFT";

export interface LocFilter {
  lat: number;
  lng: number;
  label: string;
  maxKm: number; // 60 = "Overal"
}

interface Hit {
  label: string;
  lat: number;
  lng: number;
}

/**
 * "Waar wil je klussen doen?": een plaats zoeken (PDOK, /api/geo/search) of, pas als de werker op
 * de knop drukt, de huidige locatie van het toestel. De keuze gaat via onApply naar dezelfde plek
 * als altijd (het locatiefilter van de klussenlijst); er wordt niets opgeslagen of verstuurd.
 */
export function LocationSheet({
  open,
  onClose,
  home,
  homeLabel,
  value,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  home: { lat: number; lng: number } | null;
  homeLabel: string | null;
  value: LocFilter | null;
  onApply: (v: LocFilter | null) => void;
}) {
  const t = useFT().loc;
  const homeOption: Hit | null = home ? { label: homeLabel || t.thuis, lat: home.lat, lng: home.lng } : null;

  const [picked, setPicked] = useState<Hit | null>(value ? { label: value.label, lat: value.lat, lng: value.lng } : homeOption);
  const [maxKm, setMaxKm] = useState<number>(value?.maxKm ?? 60);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [gezocht, setGezocht] = useState(false);
  const [locating, setLocating] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const tId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useDialog(open, onClose);

  useEffect(() => {
    if (open) {
      setPicked(value ? { label: value.label, lat: value.lat, lng: value.lng } : homeOption);
      setMaxKm(value?.maxKm ?? 60);
      setQ("");
      setHits([]);
      setGezocht(false);
      setFout(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (tId.current) clearTimeout(tId.current);
    if (q.trim().length < 2) {
      setHits([]);
      setGezocht(false);
      return;
    }
    tId.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geo/search?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
        const d = await r.json();
        setHits(d.results ?? []);
      } catch {
        setHits([]);
      }
      setGezocht(true);
    }, 300);
  }, [q]);

  if (!open) return null;

  // Alleen na een druk op de knop: nooit vanzelf om de locatie vragen.
  function gebruikHuidige() {
    setFout(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setFout(t.geenSupport);
      return;
    }
    setLocating(true);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPicked({ label: t.huidigLabel, lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocating(false);
          setQ("");
          setHits([]);
        },
        (err) => {
          setLocating(false);
          // 1 = PERMISSION_DENIED; verder alles wat mislukt (geen bereik, time-out) is "niet te bepalen"
          setFout(err.code === 1 ? t.geweigerd : t.onbeschikbaar);
        },
        { enableHighAccuracy: false, timeout: 8000 },
      );
    } catch {
      setLocating(false);
      setFout(t.onbeschikbaar);
    }
  }

  function save() {
    if (!picked) return onApply(null);
    const isHome =
      homeOption && Math.abs(picked.lat - homeOption.lat) < 1e-4 && Math.abs(picked.lng - homeOption.lng) < 1e-4;
    if (isHome && maxKm >= 60) return onApply(null); // default = no filter
    onApply({ lat: picked.lat, lng: picked.lng, label: picked.label, maxKm });
  }

  const kmLabel = maxKm >= 60 ? t.overal : t.km.replace("{n}", String(maxKm));

  return (
    <Portal>
      <div className="fixed inset-0 z-[75] flex items-end justify-center bg-ink/50" onClick={onClose}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="locatie-titel"
          className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-lift"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-t-2xl bg-gradient-to-br from-brand-700 to-brand-500 px-5 pb-6 pt-5 text-white">
            <h2 id="locatie-titel" className="font-display text-xl font-bold leading-tight">{t.titel}</h2>
            <p className="mt-1 text-sm text-white/85">{t.uitleg}</p>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div>
              <label htmlFor="locatie-zoek" className="text-sm font-semibold text-ink">{t.zoekLabel}</label>
              <input
                id="locatie-zoek"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t.zoekPlaceholder}
                autoComplete="off"
                className="mt-1.5 w-full rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand-500"
              />
              {hits.length > 0 && (
                <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-hair">
                  {hits.map((h, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => {
                          setPicked(h);
                          setFout(null);
                          setQ("");
                          setHits([]);
                        }}
                        className="block w-full truncate px-3 py-2 text-left text-sm text-ink hover:bg-paper-soft"
                      >
                        {h.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {gezocht && hits.length === 0 && q.trim().length >= 2 && <p className="mt-1 text-xs text-neutralx-500">{t.geenResultaat}</p>}
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold uppercase text-neutralx-400" aria-hidden>
              <span className="h-px flex-1 bg-hair" />
              {t.of}
              <span className="h-px flex-1 bg-hair" />
            </div>

            <div>
              <button
                type="button"
                onClick={gebruikHuidige}
                disabled={locating}
                className="btn-primary w-full py-3 text-sm disabled:opacity-60"
              >
                {locating ? t.bepalen : t.huidige}
              </button>
              {fout && <p role="alert" className="mt-2 rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">{fout}</p>}
            </div>

            {(picked || homeOption) && (
              <div className="rounded-lg border border-hair bg-paper-soft px-3 py-2.5 text-sm">
                <p className="truncate font-semibold text-ink">{picked?.label ?? t.thuis}</p>
                {homeOption && picked && picked.label !== homeOption.label && (
                  <button type="button" onClick={() => setPicked(homeOption)} className="mt-0.5 text-xs font-medium text-brand-600 underline">
                    {homeOption.label}
                  </button>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="locatie-afstand" className="text-sm font-semibold text-ink">{t.afstand}</label>
                <span className="text-sm text-neutralx-500">{kmLabel}</span>
              </div>
              <input
                id="locatie-afstand"
                type="range"
                min={5}
                max={60}
                step={5}
                value={maxKm}
                onChange={(e) => setMaxKm(Number(e.target.value))}
                className="mt-2 w-full accent-brand-500"
              />
            </div>
          </div>

          <div className="border-t border-hair p-4">
            <button type="button" onClick={save} className="btn-primary w-full py-3 text-sm">
              {t.opslaan}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 block w-full text-center text-sm font-medium text-neutralx-500 underline hover:text-ink"
            >
              {t.annuleren}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
