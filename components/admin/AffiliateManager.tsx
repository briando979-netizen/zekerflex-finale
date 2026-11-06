"use client";

import { useState } from "react";
import { Affiliate } from "@/lib/shop/affiliate";

export function AffiliateManager() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([
    {
      id: "aff_1",
      name: "Tech Blog NL",
      email: "info@techblog.nl",
      website: "https://techblog.nl",
      commissionRate: 10,
      status: "active",
      affiliateCode: "AFF_TECHBLOG",
      totalEarnings: 125000,
      pendingPayouts: 25000,
      referrals: 42,
      conversions: 18,
      createdAt: new Date(),
    },
  ]);

  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold" style={{ color: "var(--a-text)" }}>
          Partnerprogramma
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--a-ok)" }}
        >
          + Partner toevoegen
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Actieve partners
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            {affiliates.filter((a) => a.status === "active").length}
          </p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Totale omzet
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            €{(affiliates.reduce((sum, a) => sum + a.totalEarnings, 0) / 100).toFixed(0)}
          </p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            In afwachting betaling
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            €{(affiliates.reduce((sum, a) => sum + a.pendingPayouts, 0) / 100).toFixed(0)}
          </p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Gemiddelde conversie
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            {affiliates.length > 0
              ? (
                  (affiliates.reduce((sum, a) => sum + (a.conversions / a.referrals), 0) /
                    affiliates.length) *
                  100
                ).toFixed(0)
              : "0"}
            %
          </p>
        </div>
      </div>

      {/* Affiliate table */}
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--a-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--a-bg)", borderBottom: "1px solid var(--a-border)" }}>
              <th className="px-4 py-3 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                Partner
              </th>
              <th className="px-4 py-3 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                Code
              </th>
              <th className="px-4 py-3 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                Conversies
              </th>
              <th className="px-4 py-3 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                Verdiensten
              </th>
              <th className="px-4 py-3 text-center font-semibold" style={{ color: "var(--a-text)" }}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {affiliates.map((aff) => (
              <tr key={aff.id} style={{ borderBottom: "1px solid var(--a-border)" }}>
                <td className="px-4 py-3">
                  <div>
                    <p style={{ color: "var(--a-text)" }} className="font-medium">
                      {aff.name}
                    </p>
                    <p style={{ color: "var(--a-mute)" }} className="text-xs">
                      {aff.email}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--a-text)" }}>
                  {aff.affiliateCode}
                </td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--a-text)" }}>
                  {aff.conversions} / {aff.referrals}
                </td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                  €{(aff.totalEarnings / 100).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className="inline-block rounded px-2 py-1 text-xs font-medium"
                    style={{
                      backgroundColor:
                        aff.status === "active" ? "rgba(0, 200, 0, 0.1)" : "rgba(200, 0, 0, 0.1)",
                      color: aff.status === "active" ? "var(--a-ok)" : "var(--a-crit)",
                    }}
                  >
                    {aff.status === "active" ? "Actief" : "Inactief"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
