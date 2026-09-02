"use client";

import { useMemo, useState } from "react";
import type { DisputeDto } from "@/types/disputes";
import { GpsCheckinTimeline } from "./GpsCheckinTimeline";
import { ResolveDisputeForm } from "./ResolveDisputeForm";
import {
  formatDateTime,
  formatEuro,
  formatHm,
  formatHours,
} from "./format";

function DeltaBadge({ minutes }: { minutes: number }) {
  if (minutes === 0) {
    return (
      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
        geen verschil
      </span>
    );
  }
  const over = minutes > 0;
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${
        over ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {over ? "+" : ""}
      {formatHm(minutes)} {over ? "meer geclaimd" : "minder geclaimd"}
    </span>
  );
}

function RiskFlags({ dispute }: { dispute: DisputeDto }) {
  const flags: string[] = [];
  if (dispute.gps.checkIn === null) flags.push("geen check-in");
  if (dispute.gps.checkOut === null) flags.push("geen check-out");
  if (dispute.gps.anyOutsideGeofence) flags.push("buiten geofence");
  if (dispute.gps.anyMocked) flags.push("mock-locatie");
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f}
          className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700"
        >
          {f}
        </span>
      ))}
    </div>
  );
}

const ORIGIN_LABEL: Record<DisputeDto["origin"], string> = {
  MANAGER_REVIEW: "handmatig",
  FREELANCER_SUBMISSION: "bezwaar freelancer",
  GEOFENCE_VIOLATION: "auto · buiten geofence",
  MOCK_LOCATION: "auto · mock-locatie",
};

function OriginBadge({
  origin,
  system,
}: {
  origin: DisputeDto["origin"];
  system: boolean;
}) {
  const auto = origin === "GEOFENCE_VIOLATION" || origin === "MOCK_LOCATION";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
        auto ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
      }`}
      title={system ? "Automatisch aangemaakt door het systeem" : undefined}
    >
      {ORIGIN_LABEL[origin]}
    </span>
  );
}

export function DisputeConsole({ disputes }: { disputes: DisputeDto[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(
    disputes[0]?.id ?? null,
  );
  const selected = useMemo(
    () => disputes.find((d) => d.id === selectedId) ?? null,
    [disputes, selectedId],
  );

  const stats = useMemo(() => {
    const totalDeltaMin = disputes.reduce(
      (s, d) => s + Math.abs(d.deltaMinutes),
      0,
    );
    const gpsIssues = disputes.filter(
      (d) =>
        d.gps.checkIn === null ||
        d.gps.anyOutsideGeofence ||
        d.gps.anyMocked,
    ).length;
    return { open: disputes.length, totalDeltaMin, gpsIssues };
  }, [disputes]);

  if (disputes.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
        Geen openstaande disputen. 🎉
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <dt className="text-xs text-slate-500">Openstaand</dt>
          <dd className="text-xl font-semibold">{stats.open}</dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <dt className="text-xs text-slate-500">Totale urenafwijking</dt>
          <dd className="text-xl font-semibold">
            {formatHm(stats.totalDeltaMin)}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <dt className="text-xs text-slate-500">Met GPS-signalen</dt>
          <dd className="text-xl font-semibold text-red-700">
            {stats.gpsIssues}
          </dd>
        </div>
      </dl>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* List */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Freelancer / vestiging</th>
                <th className="px-3 py-2">Geclaimd</th>
                <th className="px-3 py-2">Voorstel</th>
                <th className="px-3 py-2">Afwijking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {disputes.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={`cursor-pointer hover:bg-slate-50 ${
                    d.id === selectedId ? "bg-brand-50" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">
                      {d.freelancerName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {d.branchName}, {d.branchCity} · {formatDateTime(d.createdAt)}
                    </div>
                    <div className="mt-1">
                      <RiskFlags dispute={d} />
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatHours(d.claimedMinutes)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatHours(d.proposedMinutes)}
                  </td>
                  <td className="px-3 py-2">
                    <DeltaBadge minutes={d.deltaMinutes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detail */}
        {selected && (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  {selected.freelancerName}
                </h2>
                <OriginBadge origin={selected.origin} system={selected.systemRaised} />
              </div>
              <p className="text-sm text-slate-500">
                {selected.branchName}, {selected.branchCity}
              </p>
            </div>

            <div className="rounded-md bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-700">Reden dispuut</p>
              <p className="text-slate-600">{selected.reason}</p>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Gepland</dt>
                <dd>
                  {formatDateTime(selected.timesheet.scheduledStart)} –{" "}
                  {formatDateTime(selected.timesheet.scheduledEnd)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Geregistreerd (app)</dt>
                <dd>
                  {selected.timesheet.actualStart
                    ? formatDateTime(selected.timesheet.actualStart)
                    : "—"}{" "}
                  –{" "}
                  {selected.timesheet.actualEnd
                    ? formatDateTime(selected.timesheet.actualEnd)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Uurtarief</dt>
                <dd>{formatEuro(selected.timesheet.hourlyRateCents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  Financieel effect afwijking
                </dt>
                <dd>
                  {formatEuro(
                    Math.round(
                      (selected.deltaMinutes / 60) *
                        selected.timesheet.hourlyRateCents,
                    ),
                  )}
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-1 text-sm font-medium text-slate-700">
                GPS check-in registratie
              </h3>
              <GpsCheckinTimeline gps={selected.gps} />
            </div>

            <div className="border-t border-slate-100 pt-3">
              <h3 className="mb-2 text-sm font-medium text-slate-700">
                Beheeractie
              </h3>
              <ResolveDisputeForm key={selected.id} dispute={selected} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
