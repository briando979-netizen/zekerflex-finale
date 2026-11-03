"use client";

import { useState } from "react";
import type { UserPrefs, JobAlert } from "@/lib/prefs/store";
import { useToast } from "@/components/ui/Toast";
import { useFT } from "@/components/i18n/useFT";

const PART_KEYS = ["morning", "afternoon", "evening"] as const;

export function AvailabilityForm({ initial }: { initial: UserPrefs }) {
  const toast = useToast();
  const ft = useFT();
  const t = ft.avail;
  // Korte dagnamen in de app-taal, met hoofdletter (zo=0 … za=6, zoals availability opslaat).
  const DAYS = ft.date.wd.map((d) => d.charAt(0).toUpperCase() + d.slice(1));
  const PARTS = PART_KEYS.map((k) => ({ k, l: t[k] }));
  const [avail, setAvail] = useState<UserPrefs["availability"]>(initial.availability ?? {});
  const [minRate, setMinRate] = useState(initial.minHourlyRateCents ? initial.minHourlyRateCents / 100 : 0);
  const [desiredRate, setDesiredRate] = useState(initial.desiredHourlyRateCents ? initial.desiredHourlyRateCents / 100 : 0);
  const [maxTravel, setMaxTravel] = useState(initial.maxTravelMinutes ?? 60);
  const [standby, setStandby] = useState(initial.standby);
  const [alerts, setAlerts] = useState<JobAlert[]>(initial.jobAlerts ?? []);
  const [saving, setSaving] = useState(false);
  const [alertLabel, setAlertLabel] = useState("");
  const [alertRate, setAlertRate] = useState(0);

  function toggle(day: number, part: string) {
    setAvail((prev) => {
      const cur = new Set(prev[day] ?? []);
      cur.has(part as never) ? cur.delete(part as never) : cur.add(part as never);
      return { ...prev, [day]: [...cur] as never };
    });
  }

  async function put(body: Record<string, unknown>, okMsg: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/me/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as UserPrefs;
      if (!res.ok) toast.error(t.saveFailed);
      else {
        setAlerts(data.jobAlerts ?? []);
        toast.success(okMsg);
      }
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  const saveAll = () =>
    put(
      {
        availability: avail,
        minHourlyRateCents: minRate ? Math.round(minRate * 100) : null,
        desiredHourlyRateCents: desiredRate ? Math.round(desiredRate * 100) : null,
        maxTravelMinutes: maxTravel,
        standby,
      },
      t.saved,
    );

  const addAlert = () => {
    if (!alertLabel.trim()) return;
    put(
      { addAlert: { label: alertLabel.trim(), ...(alertRate ? { minRateCents: Math.round(alertRate * 100) } : {}) } },
      t.alertAdded,
    );
    setAlertLabel("");
    setAlertRate(0);
  };

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="font-display text-lg font-semibold">{t.whenTitle}</h2>
        <p className="mt-1 text-sm text-neutralx-600">{t.whenBody}</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[420px] text-center text-sm">
            <thead>
              <tr>
                <th></th>
                {DAYS.map((d) => (
                  <th key={d} className="pb-2 font-medium text-neutralx-500">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PARTS.map((p) => (
                <tr key={p.k}>
                  <td className="py-1 pr-3 text-right text-xs text-neutralx-500">{p.l}</td>
                  {DAYS.map((_, day) => {
                    const on = (avail[day] ?? []).includes(p.k as never);
                    return (
                      <td key={day} className="p-1">
                        <button
                          type="button"
                          onClick={() => toggle(day, p.k)}
                          className={`h-8 w-full rounded-md border text-xs transition ${
                            on ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong hover:bg-paper-soft"
                          }`}
                          aria-pressed={on}
                          aria-label={`${DAYS[day]} ${p.l}`}
                        >
                          {on ? "✓" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-lg font-semibold">{t.rateTitle}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="field-label">{t.minRate}</span>
            <input type="number" min={0} step={0.5} value={minRate || ""} onChange={(e) => setMinRate(Number(e.target.value))} className="field-input" />
            <span className="mt-1 block text-xs text-neutralx-400">{t.minRateHint}</span>
          </label>
          <label className="block">
            <span className="field-label">{t.desiredRate}</span>
            <input type="number" min={0} step={0.5} value={desiredRate || ""} onChange={(e) => setDesiredRate(Number(e.target.value))} className="field-input" />
            <span className="mt-1 block text-xs text-neutralx-400">{t.desiredRateHint}</span>
          </label>
          <label className="block">
            <span className="field-label">{t.maxTravel(maxTravel)}</span>
            <input type="range" min={10} max={90} value={maxTravel} onChange={(e) => setMaxTravel(Number(e.target.value))} className="mt-3 w-full accent-brand-500" />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-neutralx-700">
          <input type="checkbox" checked={standby} onChange={(e) => setStandby(e.target.checked)} />
          {t.standby}
        </label>
      </section>

      <button type="button" onClick={saveAll} disabled={saving} className="btn-primary">
        {saving ? t.saving : t.save}
      </button>

      <section className="card p-6">
        <h2 className="font-display text-lg font-semibold">{t.alertsTitle}</h2>
        <p className="mt-1 text-sm text-neutralx-600">{t.alertsBody}</p>
        {alerts.length > 0 && (
          <ul className="mt-4 space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg border border-hair px-3 py-2 text-sm">
                <span>
                  {a.label}
                  {a.minRateCents ? <span className="ml-2 text-xs text-neutralx-400">{t.alertMin(Math.round(a.minRateCents / 100))}</span> : null}
                </span>
                <button type="button" onClick={() => put({ removeAlertId: a.id }, t.alertRemoved)} className="text-xs text-neutralx-400 hover:text-crit">
                  {t.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="block flex-1">
            <span className="field-label">{t.description}</span>
            <input value={alertLabel} onChange={(e) => setAlertLabel(e.target.value)} placeholder={t.descPlaceholder} className="field-input" />
          </label>
          <label className="block w-28">
            <span className="field-label">{t.minPerHour}</span>
            <input type="number" min={0} value={alertRate || ""} onChange={(e) => setAlertRate(Number(e.target.value))} className="field-input" />
          </label>
          <button type="button" onClick={addAlert} disabled={saving || !alertLabel.trim()} className="btn-ghost">
            {t.add}
          </button>
        </div>
      </section>
    </div>
  );
}
