"use client";

import { useEffect, useState } from "react";

// Speelse, maar niet-verzonnen visualisatie: de "kamers" en robotjes zijn
// illustratief, de cijfers op elk kamerbadge komen rechtstreeks uit de
// bestaande admin-APIs (shop-stats, mail-log, nieuwsbrief, sales-leads).

type RoomStats = {
  shop: { revenueCents: number; paidOrders: number; pendingOrders: number } | null;
  mail: { total: number; delivered: number } | null;
  newsletter: { count: number } | null;
  sales: { count: number; replied: number } | null;
};

const money = (cents: number) => `€ ${(cents / 100).toLocaleString("nl-NL", { maximumFractionDigits: 0 })}`;

type Bot = { id: string; emoji: string; dur: number; delay: number; path: 1 | 2 | 3 };

function Room({
  title,
  emoji,
  bots,
  badge,
  tone,
}: {
  title: string;
  emoji: string;
  bots: Bot[];
  badge: string;
  tone: string;
}) {
  return (
    <div className={`relative h-44 overflow-hidden rounded-2xl border p-3 ${tone}`}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
          <span aria-hidden>{emoji}</span> {title}
        </p>
      </div>
      <p className="mt-1 font-mono text-xs" style={{ color: "var(--a-mute)" }}>{badge}</p>
      <div className="pointer-events-none absolute inset-0">
        {bots.map((b) => (
          <span
            key={b.id}
            className={`office-bot office-path-${b.path} absolute text-xl`}
            style={{ animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}
            aria-hidden
          >
            {b.emoji}
          </span>
        ))}
      </div>
    </div>
  );
}

export function OfficeFloor() {
  const [stats, setStats] = useState<RoomStats>({ shop: null, mail: null, newsletter: null, sales: null });

  useEffect(() => {
    let stop = false;
    async function load() {
      const [shopRes, mailRes, nbRes, salesRes] = await Promise.allSettled([
        fetch("/api/shop/stats", { cache: "no-store" }),
        fetch("/api/admin/mail", { cache: "no-store" }),
        fetch("/api/admin/nieuwsbrief", { cache: "no-store" }),
        fetch("/api/admin/sales/leads", { cache: "no-store" }),
      ]);
      if (stop) return;
      const next: RoomStats = { shop: null, mail: null, newsletter: null, sales: null };
      if (shopRes.status === "fulfilled" && shopRes.value.ok) {
        const d = await shopRes.value.json();
        next.shop = { revenueCents: d.revenueCents ?? 0, paidOrders: d.paidOrderCount ?? 0, pendingOrders: d.pendingOrderCount ?? 0 };
      }
      if (mailRes.status === "fulfilled" && mailRes.value.ok) {
        const d = await mailRes.value.json();
        next.mail = { total: d.stats?.total ?? 0, delivered: d.stats?.delivered ?? 0 };
      }
      if (nbRes.status === "fulfilled" && nbRes.value.ok) {
        const d = await nbRes.value.json();
        next.newsletter = { count: d.stats?.total ?? 0 };
      }
      if (salesRes.status === "fulfilled" && salesRes.value.ok) {
        const d = await salesRes.value.json();
        const leads = Array.isArray(d.leads) ? d.leads : [];
        next.sales = { count: leads.length, replied: leads.filter((l: { status?: string }) => l.status === "REPLIED").length };
      }
      if (!stop) setStats(next);
    }
    void load();
    const t = setInterval(load, 20000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const hasActivity = (stats.shop?.pendingOrders ?? 0) > 0 || (stats.shop?.paidOrders ?? 0) > 0;

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes office-walk-1 { 0% { left: 6%; top: 60%; } 25% { left: 55%; top: 30%; } 50% { left: 80%; top: 65%; } 75% { left: 35%; top: 75%; } 100% { left: 6%; top: 60%; } }
        @keyframes office-walk-2 { 0% { left: 70%; top: 25%; } 30% { left: 20%; top: 55%; } 60% { left: 45%; top: 70%; } 100% { left: 70%; top: 25%; } }
        @keyframes office-walk-3 { 0% { left: 30%; top: 70%; } 40% { left: 65%; top: 40%; } 80% { left: 15%; top: 30%; } 100% { left: 30%; top: 70%; } }
        .office-bot { animation-name: office-walk-1; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
        .office-path-2 { animation-name: office-walk-2; }
        .office-path-3 { animation-name: office-walk-3; }
        @keyframes office-drive { 0% { left: -8%; } 100% { left: 108%; } }
        .office-car { animation: office-drive linear infinite; position: absolute; }
      `}</style>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Room
          title="Webshopbeheer"
          emoji="🛒"
          tone="border-brand-200 bg-brand-50/40"
          badge={stats.shop ? `${money(stats.shop.revenueCents)} omzet · ${stats.shop.pendingOrders} wachtend` : "laden…"}
          bots={[
            { id: "s1", emoji: "🤖", dur: 14, delay: 0, path: 1 },
            { id: "s2", emoji: "📦", dur: 11, delay: 2, path: 2 },
          ]}
        />
        <Room
          title="Marketing & nieuwsbrief"
          emoji="📣"
          tone="border-amber-200 bg-amber-50/40"
          badge={stats.newsletter ? `${stats.newsletter.count} abonnees` : "laden…"}
          bots={[{ id: "m1", emoji: "🤖", dur: 13, delay: 1, path: 3 }]}
        />
        <Room
          title="E-mail"
          emoji="✉️"
          tone="border-sky-200 bg-sky-50/40"
          badge={stats.mail ? `${stats.mail.delivered}/${stats.mail.total} afgeleverd` : "laden…"}
          bots={[{ id: "e1", emoji: "🤖", dur: 12, delay: 0.5, path: 2 }]}
        />
        <Room
          title="Sales — vergaderkamer"
          emoji="💼"
          tone="border-violet-200 bg-violet-50/40"
          badge={stats.sales ? `${stats.sales.count} leads · ${stats.sales.replied} in gesprek` : "laden…"}
          bots={[
            { id: "sa1", emoji: "🤖", dur: 15, delay: 0, path: 1 },
            { id: "sa2", emoji: "🧑‍💼", dur: 10, delay: 3, path: 3 },
          ]}
        />
      </div>

      <div className="relative h-16 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--a-border)", background: "var(--a-panel-2)" }}>
        <p className="absolute left-3 top-1.5 text-xs" style={{ color: "var(--a-mute)" }}>
          {hasActivity ? `Onderweg: ${stats.shop?.pendingOrders ?? 0} wachtend op betaling, ${stats.shop?.paidOrders ?? 0} betaald` : "Nog geen bestellingen vandaag"}
        </p>
        <span className="office-car text-2xl" style={{ animationDuration: "9s", top: "28px" }} aria-hidden>🚗</span>
        <span className="office-car text-2xl" style={{ animationDuration: "13s", animationDelay: "3s", top: "28px" }} aria-hidden>🚚</span>
      </div>
    </div>
  );
}
