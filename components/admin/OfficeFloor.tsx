"use client";

import { useEffect, useState } from "react";
import { count, euro, percentOf } from "@/lib/admin/format";
import { KpiStrip } from "@/components/admin/kit";

// De cijfers per afdeling komen rechtstreeks uit de bestaande admin-APIs
// (shop-stats, mail-log, nieuwsbrief, sales-leads, facturen).

type RoomStats = {
  shop: { revenueCents: number; paidOrders: number; pendingOrders: number } | null;
  mail: { total: number; delivered: number } | null;
  newsletter: { count: number } | null;
  sales: { count: number; replied: number } | null;
  invoices: { outstandingCents: number; paidCents: number; count: number } | null;
};

export function OfficeFloor() {
  const [stats, setStats] = useState<RoomStats>({ shop: null, mail: null, newsletter: null, sales: null, invoices: null });

  useEffect(() => {
    let stop = false;
    async function load() {
      const [shopRes, mailRes, nbRes, salesRes, invoicesRes] = await Promise.allSettled([
        fetch("/api/shop/stats", { cache: "no-store" }),
        fetch("/api/admin/mail", { cache: "no-store" }),
        fetch("/api/admin/nieuwsbrief", { cache: "no-store" }),
        fetch("/api/admin/sales/leads", { cache: "no-store" }),
        fetch("/api/admin/invoices/stats", { cache: "no-store" }),
      ]);
      if (stop) return;
      const next: RoomStats = { shop: null, mail: null, newsletter: null, sales: null, invoices: null };
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
      if (invoicesRes.status === "fulfilled" && invoicesRes.value.ok) {
        const d = await invoicesRes.value.json();
        next.invoices = { outstandingCents: d.outstandingCents ?? 0, paidCents: d.paidCents ?? 0, count: d.count ?? 0 };
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

  const { shop, mail, newsletter, sales, invoices } = stats;

  return (
    <section aria-label="Cijfers per afdeling" className="space-y-2.5">
      <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Cijfers per afdeling</h2>
      <KpiStrip
        items={[
          { label: "Webshop", value: shop ? euro(shop.revenueCents) : "—", hint: shop ? `${count(shop.paidOrders)} betaald, ${count(shop.pendingOrders)} wachtend` : "laden", href: "/admin/shop" },
          { label: "Facturatie, open", value: invoices ? euro(invoices.outstandingCents) : "—", hint: invoices ? `${euro(invoices.paidCents)} betaald` : "laden", href: "/admin/facturen" },
          { label: "Sales", value: sales ? count(sales.count) : "—", hint: sales ? `${count(sales.replied)} in gesprek` : "laden", href: "/admin/sales" },
          { label: "E-mail afgeleverd", value: mail ? `${percentOf(mail.delivered, mail.total)}%` : "—", hint: mail ? `${count(mail.delivered)} van ${count(mail.total)}` : "laden", href: "/admin/mail" },
          { label: "Nieuwsbrief", value: newsletter ? count(newsletter.count) : "—", hint: "abonnees", href: "/admin/nieuwsbrief" },
        ]}
      />
    </section>
  );
}
