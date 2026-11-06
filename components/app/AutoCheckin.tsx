"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { beginStand, besluit, meetInterval, type AutoStand } from "@/lib/checkin/auto";
import { haversineMeters } from "@/lib/geo/geofencing";

// ---------------------------------------------------------------------------
// Automatisch in- en uitchecken + locatiebaken, onder de gewone check-in-knop
// (CheckInPanel). Drie manieren, allemaal zonder app-winkel of extra kosten:
//   - geofence: zolang deze pagina open staat volgt de telefoon je locatie en
//     beslist lib/checkin/auto.ts wanneer je in- of uitcheckt;
//   - QR-code op de werkplek: scannen met de camera (of met de camera-app
//     van je telefoon, die opent /dashboard/inchecken);
//   - Bluetooth-baken: Chrome op Android/laptop kiest het baken uit de lijst.
// De gps-check-in zelf blijft dezelfde als bij de knop; QR en baken zijn extra
// bewijs dat je er echt was (werkgever ziet het bij de uren).
// ---------------------------------------------------------------------------

type Ev = "CHECK_IN" | "CHECK_OUT";

interface Info {
  branch: { id: string; name: string; latitude: number; longitude: number; geofenceRadiusMeters: number };
  baken: { qr: boolean; bleNaam: string | null; automatisch: boolean };
  bewijs: { type: Ev; bron: "qr" | "ble"; at: string }[];
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}
interface BluetoothLike {
  requestDevice(opts: { filters?: { namePrefix: string }[]; acceptAllDevices?: boolean }): Promise<{ name?: string }>;
}

const OPSLAG = "zf-autocheckin";

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

function positie(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("geen gps"));
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(String(e.code))), { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
  });
}

/** De code uit een gescande QR: de hele link, of alleen het token. */
export function tokenUit(tekst: string): string | null {
  const t = tekst.trim();
  try {
    const u = new URL(t);
    return u.searchParams.get("t");
  } catch {
    return /^[0-9a-f]{24}$/i.test(t) ? t : null;
  }
}

export function AutoCheckin(props: { timesheetId: string; scheduledStart: string; scheduledEnd: string; inAt: string | null; outAt: string | null; onEvent: (type: Ev, at: string, ok: boolean, text: string) => void }) {
  const ft = useFT();
  const c = ft.checkin;
  const time = (d: string) => new Date(d).toLocaleTimeString(ft.intl, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
  const [info, setInfo] = useState<Info | null>(null);
  const [aan, setAan] = useState(false);
  const [afstand, setAfstand] = useState<number | null>(null);
  const [scannen, setScannen] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bezig, setBezig] = useState(false);
  const stand = useRef<AutoStand>(beginStand());
  const laatst = useRef(0);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const { timesheetId, inAt, outAt, onEvent } = props;
  const start = new Date(props.scheduledStart).getTime();
  const einde = new Date(props.scheduledEnd).getTime();

  useEffect(() => {
    void fetch(`/api/timesheets/${timesheetId}/baken`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Info | null) => {
        if (!d) return;
        setInfo(d);
        try {
          const bewaard = localStorage.getItem(OPSLAG);
          setAan(bewaard === null ? d.baken.automatisch : bewaard === "1");
        } catch {
          setAan(d.baken.automatisch);
        }
      });
  }, [timesheetId]);

  const stuurGps = useCallback(
    async (type: Ev, pos: GeolocationPosition) => {
      const res = await fetch(`/api/timesheets/${timesheetId}/gps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyMeters: Math.min(10_000, Math.round(pos.coords.accuracy)), deviceHash: deviceHash(), recordedAt: new Date().toISOString() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.message ?? c.failed);
      const at = (type === "CHECK_IN" ? d.actualStart : d.actualEnd) ?? d.recordedAt;
      onEvent(type, at, Boolean(d.withinGeofence), (type === "CHECK_IN" ? c.autoDidIn : c.autoDidOut)(time(at)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timesheetId, onEvent],
  );

  // geofence volgen zolang de pagina open is
  useEffect(() => {
    if (!aan || !info || outAt || !navigator.geolocation) return;
    const now = Date.now();
    if (now < start - 60 * 60_000 || now > einde + 6 * 60 * 60_000) return;
    let druk = false;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const t = Date.now();
        if (t - laatst.current < meetInterval(t, start, einde) / 2) return;
        laatst.current = t;
        const m = haversineMeters({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, { latitude: info.branch.latitude, longitude: info.branch.longitude });
        setAfstand(Math.round(m));
        const uit = besluit(
          { now: t, afstandMeters: m, nauwkeurigheidMeters: pos.coords.accuracy, geofenceMeters: info.branch.geofenceRadiusMeters, geplandeStart: start, geplandEinde: einde, ingecheckt: inAt ? new Date(inAt).getTime() : null, uitgecheckt: outAt ? new Date(outAt).getTime() : null },
          stand.current,
        );
        stand.current = uit.stand;
        if (uit.actie && !druk) {
          druk = true;
          void stuurGps(uit.actie, pos)
            .catch((e: Error) => setMsg({ ok: false, text: e.message }))
            .finally(() => {
              druk = false;
            });
        }
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [aan, info, inAt, outAt, start, einde, stuurGps]);

  function zetAan(v: boolean) {
    setAan(v);
    try {
      localStorage.setItem(OPSLAG, v ? "1" : "0");
    } catch {
      /* geen opslag */
    }
  }

  async function metBaken(bron: "qr" | "ble", extra: { token?: string; bleNaam?: string }) {
    setBezig(true);
    setMsg(null);
    try {
      const pos = await positie().catch(() => {
        throw new Error(c.failedGeo);
      });
      const type: Ev = inAt ? "CHECK_OUT" : "CHECK_IN";
      const res = await fetch(`/api/timesheets/${timesheetId}/baken`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, bron, ...extra, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyMeters: Math.min(10_000, Math.round(pos.coords.accuracy)), deviceHash: deviceHash(), recordedAt: new Date().toISOString() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.message ?? c.failed);
      const at = (type === "CHECK_IN" ? d.actualStart : d.actualEnd) ?? d.recordedAt;
      const tekst = (type === "CHECK_IN" ? c.proofIn : c.proofOut)(bron === "qr" ? c.bronQr : c.bronBle, time(at));
      setInfo((cur) => (cur ? { ...cur, bewijs: d.bewijs ?? cur.bewijs } : cur));
      onEvent(type, at, true, tekst);
      setMsg({ ok: true, text: tekst });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBezig(false);
    }
  }

  // QR scannen met de camera (BarcodeDetector), anders plakken
  useEffect(() => {
    if (!scannen) return;
    let stop = false;
    const Detector = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setMsg({ ok: false, text: c.qrNoCamera });
      setScannen(false);
      return;
    }
    const detector = new Detector({ formats: ["qr_code"] });
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (stop) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        const tick = async () => {
          if (stop || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            const token = codes.map((x) => tokenUit(x.rawValue)).find(Boolean);
            if (token) {
              setScannen(false);
              await metBaken("qr", { token });
              return;
            }
          } catch {
            /* nog geen beeld */
          }
          setTimeout(() => void tick(), 500);
        };
        void tick();
      })
      .catch(() => {
        setMsg({ ok: false, text: c.qrNoCamera });
        setScannen(false);
      });
    return () => {
      stop = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannen]);

  async function zoekBaken() {
    const bt = (navigator as Navigator & { bluetooth?: BluetoothLike }).bluetooth;
    if (!bt || !info?.baken.bleNaam) return setMsg({ ok: false, text: c.bleUnsupported });
    try {
      const device = await bt.requestDevice({ filters: [{ namePrefix: info.baken.bleNaam }] });
      if (!device.name || device.name.toLowerCase() !== info.baken.bleNaam.toLowerCase()) return setMsg({ ok: false, text: c.bleWrong(device.name ?? "?") });
      await metBaken("ble", { bleNaam: device.name });
    } catch {
      /* geannuleerd */
    }
  }

  if (!info || outAt) return null;
  const heeftBaken = info.baken.qr || Boolean(info.baken.bleNaam);
  const nu = Date.now();
  const inVenster = nu >= start - 60 * 60_000 && nu <= einde + 6 * 60 * 60_000;
  if (!inVenster) return null;

  return (
    <div className="space-y-3 border-t border-hair pt-3">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="block font-semibold text-ink">{c.autoTitle}</span>
          <span className="block text-xs text-neutralx-500">
            {aan ? c.autoOn : c.autoOff}
            {aan && afstand !== null ? ` · ${c.autoWatching(afstand)}` : ""}
          </span>
        </span>
        <input type="checkbox" checked={aan} onChange={(e) => zetAan(e.target.checked)} />
      </label>
      {aan && <p className="text-xs text-neutralx-400">{c.autoNeedsPage}</p>}

      {heeftBaken && (
        <div className="space-y-2">
          <p className="text-xs text-neutralx-500">{c.bakenHint}</p>
          <div className="flex flex-wrap gap-2">
            {info.baken.qr && (
              <button type="button" disabled={bezig} onClick={() => setScannen((s) => !s)} className="btn-ghost text-sm">
                {scannen ? c.qrStop : c.qrScan}
              </button>
            )}
            {info.baken.bleNaam && (
              <button type="button" disabled={bezig} onClick={() => void zoekBaken()} className="btn-ghost text-sm">
                {c.bleFind}
              </button>
            )}
          </div>
          {scannen && <video ref={video} muted playsInline className="aspect-square w-full max-w-xs rounded-xl bg-black object-cover" />}
          {info.baken.qr && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const token = tokenUit(code);
                if (!token) return setMsg({ ok: false, text: c.qrWrong });
                void metBaken("qr", { token });
              }}
            >
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={c.qrPaste} className="min-w-0 flex-1 rounded-lg border border-hairstrong px-3 py-2 text-sm" aria-label={c.qrPaste} />
              <button type="submit" disabled={bezig || !code} className="btn-primary text-sm">
                {c.qrSend}
              </button>
            </form>
          )}
          {info.bewijs.length > 0 && (
            <ul className="text-xs text-ok">
              {info.bewijs.slice(-2).map((b) => (
                <li key={`${b.type}-${b.at}`}>{(b.type === "CHECK_IN" ? c.proofIn : c.proofOut)(b.bron === "qr" ? c.bronQr : c.bronBle, time(b.at))}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-warn"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
