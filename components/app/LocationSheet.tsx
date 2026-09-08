"use client";

import { useEffect, useRef, useState } from "react";
import { Portal } from "@/components/chat/Portal";

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
  const homeOption: Hit | null = home ? { label: homeLabel || "Mijn thuislocatie", lat: home.lat, lng: home.lng } : null;

  const [picked, setPicked] = useState<Hit | null>(value ? { label: value.label, lat: value.lat, lng: value.lng } : homeOption);
  const [maxKm, setMaxKm] = useState<number>(value?.maxKm ?? 60);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [locating, setLocating] = useState(false);
  const tId = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setPicked(value ? { label: value.label, lat: value.lat, lng: value.lng } : homeOption);
      setMaxKm(value?.maxKm ?? 60);
      setPickerOpen(false);
      setQ("");
      setHits([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (tId.current) clearTimeout(tId.current);
    if (q.trim().length < 2) {
      setHits([]);
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
    }, 300);
  }, [q]);

  if (!open) return null;

  function useCurrent() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPicked({ label: "Huidige locatie", lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        setPickerOpen(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  function save() {
    if (!picked) return onApply(null);
    const isHome =
      homeOption && Math.abs(picked.lat - homeOption.lat) < 1e-4 && Math.abs(picked.lng - homeOption.lng) < 1e-4;
    if (isHome && maxKm >= 60) return onApply(null); // default = no filter
    onApply({ lat: picked.lat, lng: picked.lng, label: picked.label, maxKm });
  }

  const kmLabel = maxKm >= 60 ? "Overal" : `${maxKm} km`;

  return (
    <Portal>
      <div className="fixed inset-0 z-[75] flex items-end justify-center bg-ink/50" onClick={onClose}>
        <div
          className="w-full max-w-md rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-lift"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="border-b border-hair px-5 py-4 text-center font-display text-lg font-bold uppercase tracking-tight text-ink">
            Locatie
          </h2>

          <div className="space-y-5 px-5 py-5">
            <div>
              <p className="text-sm font-semibold text-ink">Waar wil je werken?</p>
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="mt-1.5 flex w-full items-center justify-between rounded-lg border border-hairstrong bg-paper-soft px-3 py-2.5 text-left text-sm"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] text-neutralx-400">Jouw locatie</span>
                  <span className="block truncate text-ink">{picked?.label ?? "Kies een locatie"}</span>
                </span>
                <span className={`text-neutralx-400 transition ${pickerOpen ? "rotate-180" : ""}`}>▾</span>
              </button>

              {pickerOpen && (
                <div className="mt-2 space-y-1.5 rounded-lg border border-hair p-2">
                  {homeOption && (
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(homeOption);
                        setPickerOpen(false);
                      }}
                      className="block w-full truncate rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-paper-soft"
                    >
                      {homeOption.label}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={useCurrent}
                    disabled={locating}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-brand-600 hover:bg-paper-soft disabled:opacity-50"
                  >
                    {locating ? "Locatie bepalen…" : "Gebruik huidige locatie"}
                  </button>
                  <div className="px-1 pt-1">
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Zoek locatie…"
                      className="w-full rounded-md border border-hairstrong px-3 py-2 text-sm outline-none focus:border-brand-500"
                    />
                    {hits.length > 0 && (
                      <ul className="mt-1 max-h-44 overflow-y-auto">
                        {hits.map((h, i) => (
                          <li key={i}>
                            <button
                              type="button"
                              onClick={() => {
                                setPicked(h);
                                setPickerOpen(false);
                                setQ("");
                                setHits([]);
                              }}
                              className="block w-full truncate rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-paper-soft"
                            >
                              {h.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Tot welke afstand?</p>
                <span className="text-sm text-neutralx-500">{kmLabel}</span>
              </div>
              <input
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
              Opslaan
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 block w-full text-center text-sm font-medium text-neutralx-500 underline hover:text-ink"
            >
              Annuleren
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
