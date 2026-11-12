"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFT } from "@/components/i18n/useFT";

// /dashboard/inchecken?b=&t=: de pagina die de QR-code op de werkplek opent.
// Haalt de locatie op en checkt in (of uit) op het urenbriefje van vandaag bij
// die vestiging, met de QR-code als bewijs (lib/checkin/baken.ts).

function deviceHash(): string {
  try {
    let id = localStorage.getItem("zf-device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("zf-device", id);
    }
    return id;
  } catch {
    return `session-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function BakenInchecken(props: { timesheetId: string; shiftId: string; token: string; ingecheckt: boolean; branchName: string }) {
  const ft = useFT();
  const c = ft.checkin;
  const [stand, setStand] = useState<{ ok: boolean; text: string } | null>(null);
  const type = props.ingecheckt ? "CHECK_OUT" : "CHECK_IN";

  useEffect(() => {
    let klaar = false;
    if (!navigator.geolocation) {
      setStand({ ok: false, text: c.noGeo });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (klaar) return;
        const res = await fetch(`/api/timesheets/${props.timesheetId}/baken`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, bron: "qr", token: props.token, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyMeters: Math.min(10_000, Math.round(pos.coords.accuracy)), deviceHash: deviceHash(), recordedAt: new Date().toISOString() }),
        }).catch(() => null);
        const d = res ? await res.json().catch(() => ({})) : {};
        if (!res?.ok) return setStand({ ok: false, text: d?.error?.message ?? c.failed });
        const at = new Date((type === "CHECK_IN" ? d.actualStart : d.actualEnd) ?? d.recordedAt).toLocaleTimeString(ft.intl, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
        setStand({ ok: true, text: (type === "CHECK_IN" ? c.proofIn : c.proofOut)(c.bronQr, at) });
      },
      (e) => setStand({ ok: false, text: e.code === 1 ? c.permission : c.failedGeo }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
    return () => {
      klaar = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card space-y-3 p-5 text-center">
      <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full text-2xl ${stand?.ok ? "bg-ok/15" : "bg-paper-soft"}`}>📍</span>
      <p className="text-sm font-semibold text-ink">{props.branchName}</p>
      <p role={stand?.ok ? "status" : "alert"} className={`text-sm ${!stand ? "text-neutralx-500" : stand.ok ? "text-ok" : "text-warn"}`}>
        {stand ? stand.text : c.locating}
      </p>
      <Link href={`/dashboard/inchecken/${props.timesheetId}`} className="btn-primary inline-block text-sm">
        {ft.checkinPage.toPage}
      </Link>
    </div>
  );
}
