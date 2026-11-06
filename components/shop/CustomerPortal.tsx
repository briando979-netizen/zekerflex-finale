"use client";

import { useState } from "react";
import { CustomerSubscriptions } from "@/components/shop/CustomerSubscriptions";
import { CustomerOrders } from "@/components/shop/CustomerOrders";
import { InvoiceList } from "@/components/shop/InvoiceList";
import { Invoice } from "@/lib/shop/invoices";

type TabType = "subscriptions" | "orders" | "invoices" | "settings";

interface CustomerPortalProps {
  customerId: string;
  email: string;
}

export function CustomerPortal({ customerId, email }: CustomerPortalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("subscriptions");

  const tabs: Array<{ id: TabType; label: string; icon: string }> = [
    { id: "subscriptions", label: "Abonnementen", icon: "🔄" },
    { id: "orders", label: "Bestellingen", icon: "📦" },
    { id: "invoices", label: "Facturen", icon: "📄" },
    { id: "settings", label: "Instellingen", icon: "⚙️" },
  ];

  const handleDownloadInvoice = async (invoice: Invoice) => {
    // TODO: Fetch PDF and download
    console.log("Download invoice", invoice.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ color: "var(--a-text)" }}>
          Mijn Account
        </h1>
        <p style={{ color: "var(--a-mute)" }}>{email}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--a-border)" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2 font-medium transition-colors"
            style={{
              color: activeTab === tab.id ? "var(--a-ok)" : "var(--a-mute)",
              borderBottom: activeTab === tab.id ? "2px solid var(--a-ok)" : "none",
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "subscriptions" && <CustomerSubscriptions />}
        {activeTab === "orders" && <CustomerOrders />}
        {activeTab === "invoices" && (
          <InvoiceList invoices={[]} onDownload={handleDownloadInvoice} />
        )}
        {activeTab === "settings" && (
          <div className="space-y-4">
            <h3 className="font-semibold" style={{ color: "var(--a-text)" }}>
              Accountinstellingen
            </h3>
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
              <p style={{ color: "var(--a-mute)" }}>Email address: {email}</p>
              <button
                className="mt-4 rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--a-crit)" }}
              >
                Account verwijderen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
