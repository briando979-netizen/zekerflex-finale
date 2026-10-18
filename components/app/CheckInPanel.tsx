"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// GPS check-in / check-out on the klus location. Posts to the existing
// /api/timesheets/:id/gps ingestion (geofenced against the branch, fraud
// signals, sets actualStart/actualEnd). While checked in and the page is
// open, a heartbeat every 10 minutes keeps the trail honest.
// ---------------------------------------------------------------------------

type Ev = "CHECK_IN" | "HEARTBEAT" | "CHECK_OUT";

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

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Je telefoon of browser deelt geen locatie."));
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(e.code === 1 ? "Geef ZekerFlex toestemming voor je locatie (instellingen van je browser)." : "Locatie bepalen lukte niet — ga even naar buiten of naar een raam.")), {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    });
  });
}

const time = (d: string) => new Date(d).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

export function CheckInPanel(props: { timesheetId: string; scheduledStart: string; scheduledEnd: string; actualStart: string | null; actualEnd: string | null; branchName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Ev | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inAt, setInAt] = useState(props.actualStart);
  const [outAt, setOutAt] = useState(props.actualEnd);
  const beat = useRef<ReturnType<typeof setInterval> | null>(null);

  const now = Date.now();
  const start = new Date(props.scheduledStart).getTime();
  const end = new Date(props.scheduledEnd).getTime();
  const inWindow = now >= start - 60 * 60_000 && now <= end + 6 * 60 * 60_000; // from 1h before until 6h after

  async function send(type: Ev, quiet = false) {
    if (!quiet) {
      setBusy(type);
      setMsg(null);
    }
    try {
      const pos = await position();
      const res = await fetch(`/api/timesheets/${props.timesheetId}/gps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: Math.min(10_000, Math.round(pos.coords.accuracy)),
          deviceHash: deviceHash(),
          recordedAt: new Date().toISOString(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.message ?? "Registreren lukte niet.");
      if (quiet) return;
      const where = d.withinGeofence ? `op locatie (${Math.round(d.distanceToBranchMeters)} m)` : `${Math.round(d.distanceToBranchMeters)} m van ${props.branchName} — buiten de locatie, dit wordt gecontroleerd`;
      if (type === "CHECK_IN") setInAt(d.actualStart ?? d.recordedAt);
      if (type === "CHECK_OUT") setOutAt(d.actualEnd ?? d.recordedAt);
      setMsg({ ok: d.withinGeofence, text: `${type === "CHECK_IN" ? "Ingecheckt" : "Uitgecheckt"} om ${time(d.recordedAt)}, ${where}.` });
      router.refresh();
    } catch (err) {
      if (!quiet) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      if (!quiet) setBusy(null);
    }
  }

  // Heartbeat while checked in and not yet out.
  useEffect(() => {
    if (inAt && !outAt) {
      beat.current = setInterval(() => void send("HEARTBEAT", true), 10 * 60_000);
      return () => {
        if (beat.current) clearInterval(beat.current);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inAt, outAt]);

  if (!inWindow && !inAt) return null;

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 place-items-center rounded-full text-xl ${inAt && !outAt ? "animate-pulse bg-ok/15" : "bg-paper-soft"}`}>📍</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{outAt ? "Klaar voor vandaag" : inAt ? "Je bent ingecheckt" : "Inchecken op locatie"}</span>
          <span className="block text-xs text-neutralx-500">
            {inAt ? `In: ${time(inAt)}` : `Gepland ${time(props.scheduledStart)} – ${time(props.scheduledEnd)}`}
            {outAt ? ` · Uit: ${time(outAt)}` : ""}
          </span>
        </span>
      </div>
      {!outAt && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => send(inAt ? "CHECK_OUT" : "CHECK_IN")}
          className={`w-full rounded-xl py-3 text-base font-semibold text-white disabled:opacity-60 ${inAt ? "bg-ink" : "bg-brand-500"}`}
        >
          {busy ? "Locatie bepalen…" : inAt ? "Uitchecken" : "Inchecken"}
        </button>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-warn"}`}>{msg.text}</p>}
      <p className="text-xs text-neutralx-400">Je locatie wordt alleen bij in- en uitchecken (en elke 10 minuten terwijl je ingecheckt bent en deze pagina open staat) vastgelegd, om je uren te onderbouwen.</p>
    </div>
  );
}
