"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFT } from "@/components/i18n/useFT";
import type { FreelancerDict } from "@/lib/i18n/freelancer";
import { AutoCheckin } from "@/components/app/AutoCheckin";
import { WACHTRIJ_GEBEURTENIS, bewaarTik, laadTikken, nieuwId, uitkomstVan, type BewaardeTik } from "@/lib/checkin/wachtrij";
import { meldWachtrij, verstuurBewaard, weigerTekst, type WachtrijMelding } from "@/lib/checkin/verzenden";
import { INCHECK_VOOR_MS, UITCHECK_NA_MS } from "@/lib/timesheets/offline";
import { LAATST_BEKEND_MAX_MS, laatstBekendBruikbaar } from "@/lib/checkin/plek";

// ---------------------------------------------------------------------------
// GPS check-in / check-out on the klus location. Posts to the existing
// /api/timesheets/:id/gps ingestion (geofenced against the branch, fraud
// signals, sets actualStart/actualEnd). While checked in and the page is
// open, a heartbeat every 10 minutes keeps the trail honest.
//
// Zonder bereik (kelder, koelcel, festivalterrein): komt een in- of uitcheck
// niet aan, dan bewaart de telefoon hem met het tijdstip en de plek van het
// tikken (lib/checkin/wachtrij.ts) en verstuurt hem later vanzelf
// (BewaardeTikken in de layout). Een gewone weigering (4xx) wordt niet bewaard.
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

function meting(opties: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opties));
}

/**
 * Een verse GPS-meting. Lukt dat niet zonder internet (kelder, koelcel), dan de laatst
 * bekende plek van hoogstens 5 minuten oud (lib/checkin/plek.ts). `laatstBekend`: zo'n tik
 * gaat nooit live (navigator.onLine is niet betrouwbaar) maar altijd in de wachtrij, zodat hij
 * bron "offline" en dus altijd een signaal voor de opdrachtgever krijgt.
 */
async function position(c: FreelancerDict["checkin"]): Promise<{ pos: GeolocationPosition; laatstBekend: boolean }> {
  if (!navigator.geolocation) throw new Error(c.noGeo);
  const online = navigator.onLine;
  try {
    return { pos: await meting({ enableHighAccuracy: true, timeout: online ? 20_000 : 10_000, maximumAge: 0 }), laatstBekend: false };
  } catch (e) {
    if ((e as GeolocationPositionError).code === 1) throw new Error(c.permission);
    if (!navigator.onLine) {
      const oud = await meting({ enableHighAccuracy: false, timeout: 3_000, maximumAge: LAATST_BEKEND_MAX_MS }).catch(() => null);
      if (oud && laatstBekendBruikbaar(oud.timestamp, Date.now(), navigator.onLine)) return { pos: oud, laatstBekend: true };
    }
    throw new Error(c.failedGeo);
  }
}

export function CheckInPanel(props: { userId: string; timesheetId: string; scheduledStart: string; scheduledEnd: string; actualStart: string | null; actualEnd: string | null; branchName: string }) {
  const router = useRouter();
  const ft = useFT();
  const c = ft.checkin;
  // Dutch time: rendered on the UTC server first, and the shift runs in NL.
  const time = (d: string) => new Date(d).toLocaleTimeString(ft.intl, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
  const [busy, setBusy] = useState<Ev | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; wacht?: boolean } | null>(null);
  // bevestigd door de server
  const [inAt, setInAt] = useState(props.actualStart);
  const [outAt, setOutAt] = useState(props.actualEnd);
  // bewaard op dit toestel, nog niet aangekomen (pas na het laden gelezen: zelfde HTML als de server)
  const [wacht, setWacht] = useState<BewaardeTik[]>([]);
  const beat = useRef<ReturnType<typeof setInterval> | null>(null);
  const { userId, timesheetId, branchName } = props;

  const wachtIn = wacht.find((t) => t.type === "CHECK_IN");
  const wachtUit = wacht.find((t) => t.type === "CHECK_OUT");
  const shownIn = inAt ?? wachtIn?.tikOp ?? null;
  const shownOut = outAt ?? wachtUit?.tikOp ?? null;

  const now = Date.now();
  const start = new Date(props.scheduledStart).getTime();
  const end = new Date(props.scheduledEnd).getTime();
  const inWindow = now >= start - INCHECK_VOOR_MS && now <= end + UITCHECK_NA_MS; // from 1h before until 6h after

  // de bewaarde tikken van dit urenbriefje, en wat er van aankomt of geweigerd wordt
  useEffect(() => {
    const lees = () => setWacht(laadTikken(userId).filter((t) => t.timesheetId === timesheetId));
    lees();
    const tijd = (d: string) => new Date(d).toLocaleTimeString(ft.intl, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
    const opMelding = (e: Event) => {
      const d = (e as CustomEvent<WachtrijMelding>).detail;
      if (!d || d.userId !== userId) return;
      lees();
      const mijn = d.uitslagen.filter((u) => u.tik.timesheetId === timesheetId);
      for (const u of mijn) {
        const inn = u.tik.type === "CHECK_IN";
        if (u.uitkomst === "aangekomen" && u.antwoord) {
          const at = (inn ? u.antwoord.actualStart : u.antwoord.actualEnd) ?? u.antwoord.recordedAt ?? u.tik.tikOp;
          if (inn) setInAt(at);
          else setOutAt(at);
          const t = tijd(u.antwoord.recordedAt ?? u.tik.tikOp);
          const aangekomen = (inn ? c.arrivedIn : c.arrivedOut)(t);
          const text = u.antwoord.withinGeofence ? aangekomen : `${aangekomen} ${c.offSite(Math.round(u.antwoord.distanceToBranchMeters), branchName)}.`;
          setMsg({ ok: u.antwoord.withinGeofence, text });
        } else {
          setMsg({ ok: false, text: (inn ? c.refusedIn : c.refusedOut)(tijd(u.tik.tikOp), weigerTekst(c, u)) });
        }
      }
      if (mijn.some((u) => u.uitkomst === "aangekomen")) router.refresh();
    };
    window.addEventListener(WACHTRIJ_GEBEURTENIS, opMelding);
    return () => window.removeEventListener(WACHTRIJ_GEBEURTENIS, opMelding);
  }, [userId, timesheetId, branchName, ft.intl, c, router]);

  /** Niet aangekomen (geen bereik, server even weg): op het toestel bewaren en later versturen. */
  function bewaar(tik: BewaardeTik) {
    if (!bewaarTik(userId, tik)) {
      setMsg({ ok: false, text: c.notSaved });
      return;
    }
    setWacht((vorig) => [...vorig.filter((t) => t.id !== tik.id), tik]);
    setMsg({ ok: false, wacht: true, text: (tik.type === "CHECK_IN" ? c.savedIn : c.savedOut)(time(tik.tikOp)) });
    meldWachtrij(userId);
    // misschien is er alweer bereik (of wachtte er al iets: dan gaat deze erachteraan)
    void verstuurBewaard(userId);
  }

  async function send(type: Ev, quiet = false) {
    if (!quiet) {
      setBusy(type);
      setMsg(null);
    }
    // het moment van tikken, en een eigen id: twee keer versturen telt op de server één keer
    const tikOp = new Date().toISOString();
    const id = nieuwId();
    try {
      const { pos, laatstBekend } = await position(c);
      const plek = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyMeters: Math.min(10_000, Math.round(pos.coords.accuracy)),
        deviceHash: deviceHash(),
      };
      const tik: BewaardeTik | null = type === "HEARTBEAT" ? null : { id, timesheetId, type, tikOp, ...plek };
      // een oude plek telt alleen als offline tik (met signaal), nooit als gewone; zonder tik (hartslag) niets
      if (laatstBekend && !tik) throw new Error(c.failedGeo);
      // wacht er nog iets op bereik, dan deze erachter: de volgorde van in- en uitchecken blijft kloppen
      if (tik && (laatstBekend || laadTikken(userId).length > 0)) {
        bewaar(tik);
        return;
      }
      const res = await fetch(`/api/timesheets/${timesheetId}/gps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...plek, recordedAt: tikOp, ...(tik ? { clientId: id } : {}) }),
      }).catch(() => null);
      if (tik && uitkomstVan(res ? res.status : null) === "opnieuw") {
        bewaar(tik);
        return;
      }
      const d = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) throw new Error(d?.error?.message ?? c.failed);
      if (quiet) return;
      const where = d.withinGeofence ? c.onSite(Math.round(d.distanceToBranchMeters)) : c.offSite(Math.round(d.distanceToBranchMeters), branchName);
      if (type === "CHECK_IN") setInAt(d.actualStart ?? d.recordedAt);
      if (type === "CHECK_OUT") setOutAt(d.actualEnd ?? d.recordedAt);
      setMsg({ ok: d.withinGeofence, text: (type === "CHECK_IN" ? c.checkedIn : c.checkedOut)(time(d.recordedAt), where) });
      router.refresh();
    } catch (err) {
      if (!quiet) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      if (!quiet) setBusy(null);
    }
  }

  // Heartbeat while checked in (confirmed by the server) and not yet out.
  const heartbeat = Boolean(inAt && !shownOut && wacht.length === 0);
  useEffect(() => {
    if (heartbeat) {
      beat.current = setInterval(() => void send("HEARTBEAT", true), 10 * 60_000);
      return () => {
        if (beat.current) clearInterval(beat.current);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heartbeat]);

  if (!inWindow && !shownIn) return null;

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 place-items-center rounded-full text-xl ${shownIn && !shownOut ? "animate-pulse bg-ok/15" : "bg-paper-soft"}`}>📍</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{shownOut ? c.doneToday : shownIn ? c.youAreIn : c.title}</span>
          <span className="block text-xs text-neutralx-500">
            {shownIn ? c.inAt(time(shownIn)) : c.planned(time(props.scheduledStart), time(props.scheduledEnd))}
            {!inAt && wachtIn ? ` (${c.pendingTag})` : ""}
            {shownOut ? c.outAt(time(shownOut)) : ""}
            {!outAt && wachtUit ? ` (${c.pendingTag})` : ""}
          </span>
        </span>
      </div>
      {!shownOut && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void send(shownIn ? "CHECK_OUT" : "CHECK_IN")}
          className={`w-full rounded-xl py-3 text-base font-semibold text-white disabled:opacity-60 ${shownIn ? "bg-ink" : "bg-brand-500"}`}
        >
          {busy ? c.locating : shownIn ? c.checkOut : c.checkIn}
        </button>
      )}
      {msg && (
        <p role={msg.ok || msg.wacht ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-warn"}`}>
          {msg.text}
        </p>
      )}
      <p className="text-xs text-neutralx-400">{c.privacy}</p>
      {/* automatisch op de geofence, QR-code of Bluetooth-baken (lib/checkin) */}
      <AutoCheckin
        timesheetId={props.timesheetId}
        scheduledStart={props.scheduledStart}
        scheduledEnd={props.scheduledEnd}
        inAt={shownIn}
        outAt={shownOut}
        onEvent={(type, at, ok, text) => {
          if (type === "CHECK_IN") setInAt(at);
          else setOutAt(at);
          setMsg({ ok, text });
          router.refresh();
        }}
      />
    </div>
  );
}
