"use client";

import { WebhookEvent, getEventDescription } from "@/lib/shop/webhook-events";

interface ShopWebhookLogProps {
  events?: WebhookEvent[];
}

export function ShopWebhookLog({ events = [] }: ShopWebhookLogProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold" style={{ color: "var(--a-text)" }}>
          Webhook Log
        </h3>
        <p className="text-sm" style={{ color: "var(--a-mute)" }}>
          Recente Stripe-events
        </p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center" style={{ borderColor: "var(--a-border)" }}>
          <p style={{ color: "var(--a-mute)" }}>Nog geen events</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 20).map((event) => (
            <div
              key={event.id}
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--a-border)", backgroundColor: "var(--a-bg)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-medium" style={{ color: "var(--a-text)" }}>
                    {getEventDescription(event.type)}
                  </p>
                  <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                    {event.timestamp.toLocaleString("nl-NL")}
                  </p>
                </div>
                <span
                  className="inline-block rounded px-2 py-1 text-xs font-medium"
                  style={{
                    backgroundColor:
                      event.status === "processed"
                        ? "rgba(0, 200, 0, 0.1)"
                        : event.status === "failed"
                          ? "rgba(200, 0, 0, 0.1)"
                          : "rgba(200, 150, 0, 0.1)",
                    color:
                      event.status === "processed"
                        ? "var(--a-ok)"
                        : event.status === "failed"
                          ? "var(--a-crit)"
                          : "var(--a-warn)",
                  }}
                >
                  {event.status}
                </span>
              </div>
              {event.error && (
                <p className="mt-2 text-xs" style={{ color: "var(--a-crit)" }}>
                  Fout: {event.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
