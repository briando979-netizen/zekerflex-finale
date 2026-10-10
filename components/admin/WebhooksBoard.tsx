"use client";

import { useEffect, useState } from "react";

interface Subscription {
  id: string;
  url: string;
  eventTypes: string[];
  active: boolean;
  createdAt: string;
  tenant: { id: string; name: string } | null;
}
interface Delivery {
  id: string;
  subscriptionId: string;
  eventType: string;
  statusCode: number | null;
  attempts: number;
  deliveredAt: string | null;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  subscription: { url: string; tenant: { name: string } | null };
}

function DeliveryStatus({ d }: { d: Delivery }) {
  if (d.deliveredAt) return <span className="pill-ok flex-shrink-0">{d.statusCode} afgeleverd</span>;
  if (d.nextAttemptAt) return <span className="pill-warn flex-shrink-0">wordt opnieuw geprobeerd ({d.attempts}×)</span>;
  return <span className="pill-crit flex-shrink-0">mislukt na {d.attempts} pogingen</span>;
}

export function WebhooksBoard() {
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  useEffect(() => {
    fetch("/api/admin/webhooks", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { subscriptions: [], deliveries: [] }))
      .then((d) => {
        setSubscriptions(d.subscriptions);
        setDeliveries(d.deliveries);
      })
      .catch(() => {
        setSubscriptions([]);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-ink">Webhooks</h2>
        <p className="mt-1 text-sm text-neutralx-600">
          Abonnementen die partners zelf aanmaken via <code>POST /api/public/v1/webhooks</code>, en of de
          afleveringen ook echt aankomen.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Geregistreerde abonnementen</div>
        {!subscriptions ? (
          <div className="space-y-px">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-12 animate-pulse bg-paper-soft" />)}</div>
        ) : subscriptions.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutralx-400">Nog geen partner heeft een webhook geregistreerd.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {subscriptions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{s.url}</p>
                  <p className="truncate text-xs text-neutralx-400">
                    {s.tenant?.name ?? "onbekende organisatie"} · {s.eventTypes.join(", ")}
                  </p>
                </div>
                <span className={`flex-shrink-0 ${s.active ? "pill-ok" : "pill-neutral"}`}>
                  {s.active ? "actief" : "uitgeschakeld"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Recente afleveringen</div>
        {deliveries.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutralx-400">Nog geen webhook-events verzonden.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {deliveries.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {d.eventType} → {d.subscription.url}
                  </p>
                  <p className="truncate text-xs text-neutralx-400">
                    {d.subscription.tenant?.name ?? "onbekende organisatie"} ·{" "}
                    {new Date(d.createdAt).toLocaleString("nl-NL")}
                    {d.lastError ? ` · ${d.lastError}` : ""}
                  </p>
                </div>
                <DeliveryStatus d={d} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
