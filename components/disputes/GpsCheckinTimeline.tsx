import type { DisputeDto, GpsEventDto } from "@/types/disputes";
import { formatDistance, formatTime } from "./format";

const DOT: Record<GpsEventDto["type"], string> = {
  CHECK_IN: "bg-emerald-500",
  HEARTBEAT: "bg-slate-300",
  CHECK_OUT: "bg-blue-500",
};

const LABEL: Record<GpsEventDto["type"], string> = {
  CHECK_IN: "Check-in",
  HEARTBEAT: "Locatie-ping",
  CHECK_OUT: "Check-out",
};

function Row({ event }: { event: GpsEventDto }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[event.type]}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-800">
            {LABEL[event.type]}
          </span>
          <time className="tabular-nums text-sm text-slate-500">
            {formatTime(event.recordedAt)}
          </time>
        </div>
        <p className="text-xs text-slate-500">
          {formatDistance(event.distanceToBranchMeters)} van vestiging ·
          nauwkeurigheid ±{Math.round(event.accuracyMeters)} m
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {!event.withinGeofence && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
              buiten geofence
            </span>
          )}
          {event.mocked && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
              mock-locatie
            </span>
          )}
          {event.withinGeofence && !event.mocked && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
              geverifieerd
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

export function GpsCheckinTimeline({ gps }: { gps: DisputeDto["gps"] }) {
  const events: GpsEventDto[] = [
    ...(gps.checkIn ? [gps.checkIn] : []),
    ...gps.heartbeats,
    ...(gps.checkOut ? [gps.checkOut] : []),
  ].sort(
    (a, b) =>
      new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );

  if (events.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
        Geen GPS-registratie voor deze shift. Handmatige beoordeling vereist.
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {events.map((e, i) => (
          <Row key={`${e.type}-${e.recordedAt}-${i}`} event={e} />
        ))}
      </ul>
      {gps.measuredOnSiteMinutes !== null && (
        <p className="mt-2 text-xs text-slate-500">
          Gemeten aanwezigheid (check-in → check-out, minus pauze):{" "}
          <span className="font-medium text-slate-700">
            {(gps.measuredOnSiteMinutes / 60).toFixed(2)} u
          </span>
        </p>
      )}
    </div>
  );
}
