"use client";

import dynamic from "next/dynamic";

// ---------------------------------------------------------------------------
// De kaart van één plek (de locatie van een klus), op ZekerFlex Kaart: onze eigen kaart van Nederland
// (zelf gehoste OpenStreetMap-gegevens, lib/kaart/stijl.ts) met een speld op het adres. Eerder haalde dit
// losse tegels bij de gratis server van OpenStreetMap; dat is vervangen zodat er niets meer van een
// ander wordt gehaald. De kaart laadt pas als hij in beeld komt en staat vast (scrollen blijft scrollen).
// Met routeLijn tekent hij ook de route van huis naar de klus (components/app/KlusRoute.tsx).
// ---------------------------------------------------------------------------

const VolgKaart = dynamic(() => import("@/components/kaart/VolgKaart").then((m) => m.VolgKaart), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-paper-soft" aria-hidden />,
});

export function ShiftMap({
  lat,
  lng,
  zoom = 15,
  height = 180,
  label,
  routeLijn,
}: {
  lat: number;
  lng: number;
  zoom?: number;
  height?: number;
  label?: string;
  /** de route van huis naar deze plek ([lon, lat]); null = nog geen, weglaten = geen route op deze kaart */
  routeLijn?: [number, number][] | null | undefined;
}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return (
      <div className="grid place-items-center rounded-xl border border-hair bg-paper-soft text-xs text-neutralx-400" style={{ height }}>
        Kaart niet beschikbaar
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-xl border border-hair" style={{ height }}>
      <VolgKaart bestemming={{ lat, lon: lng }} positie={null} interactief={false} zoom={zoom} routeLijn={routeLijn} className="h-full w-full rounded-none" />
      {label && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink/65 to-transparent px-3 pb-1.5 pt-7 text-xs font-semibold text-white">
          {label}
        </div>
      )}
    </div>
  );
}
