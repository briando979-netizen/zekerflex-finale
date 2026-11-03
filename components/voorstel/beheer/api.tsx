"use client";

import { useCallback, useEffect, useState } from "react";

// Gedeelde helpers voor de Schwarzwald-beheeromgeving.

export const BEHEER_API = "/api/voorstel/schwarzwald/beheer";

export async function vraag<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(url, {
    method: init?.method ?? "GET",
    cache: "no-store",
    ...(init?.body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) } : {}),
  });
  const d = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(d.error?.message ?? "Er ging iets mis.");
  return d;
}

/** Laadt een beheer-endpoint en geeft data, fout en een herlaadfunctie. */
export function useBeheerData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [fout, setFout] = useState("");
  const laad = useCallback(async () => {
    try {
      setData(await vraag<T>(url));
      setFout("");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }, [url]);
  useEffect(() => {
    void laad();
  }, [laad]);
  return { data, setData, fout, setFout, laad };
}

export const dagNaam = (datum: string, opties: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) =>
  new Intl.DateTimeFormat("nl-NL", { ...opties, timeZone: "UTC" }).format(new Date(`${datum}T12:00:00Z`));

export const KAART = "rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-6";
/** zonder breedte, voor velden die naast elkaar staan */
export const VELD_BASIS = "rounded-xl border-0 bg-white px-3 py-2.5 text-schw-night ring-1 ring-schw-night/15 focus:outline-none focus:ring-2 focus:ring-schw-orange";
export const VELD = `w-full ${VELD_BASIS}`;
export const KNOP = "rounded-full bg-schw-night px-5 py-2.5 text-sm font-bold text-schw-cream disabled:opacity-50";
export const KNOP_LICHT = "rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-schw-night/15 disabled:opacity-50";

export function Melding({ fout, ok }: { fout?: string; ok?: string }) {
  if (fout) return <p role="alert" className="rounded-2xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">{fout}</p>;
  if (ok) return <p role="status" className="rounded-2xl bg-[#DCFCE7] p-3 text-sm font-semibold text-[#15803D]">{ok}</p>;
  return null;
}
