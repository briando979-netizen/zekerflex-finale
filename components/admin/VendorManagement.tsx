"use client";

import { useState } from "react";
import { Vendor, VendorPayout } from "@/lib/shop/marketplace";

export function VendorManagement() {
  const [vendors, setVendors] = useState<Vendor[]>([
    {
      id: "vendor_1",
      name: "TechSupply Co",
      email: "contact@techsupply.com",
      verified: true,
      rating: 4.8,
      totalSales: 450000,
      commissionRate: 15,
      status: "active",
      createdAt: new Date(),
    },
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--a-text)" }}>
          Verkopers
        </h2>
        <p className="text-sm" style={{ color: "var(--a-mute)" }}>
          Marketplace-partners beheren
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Actieve verkopers
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            {vendors.filter((v) => v.status === "active").length}
          </p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Gemiddelde rating
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            {(vendors.reduce((sum, v) => sum + v.rating, 0) / vendors.length).toFixed(1)}⭐
          </p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Totale omzet
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            €{(vendors.reduce((sum, v) => sum + v.totalSales, 0) / 100).toFixed(0)}
          </p>
        </div>
      </div>

      {/* Vendors table */}
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--a-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--a-bg)", borderBottom: "1px solid var(--a-border)" }}>
              <th className="px-4 py-3 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                Naam
              </th>
              <th className="px-4 py-3 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                Rating
              </th>
              <th className="px-4 py-3 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                Omzet
              </th>
              <th className="px-4 py-3 text-center font-semibold" style={{ color: "var(--a-text)" }}>
                Status
              </th>
              <th className="px-4 py-3 text-center font-semibold" style={{ color: "var(--a-text)" }}>
                Acties
              </th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((vendor) => (
              <tr key={vendor.id} style={{ borderBottom: "1px solid var(--a-border)" }}>
                <td className="px-4 py-3 font-medium" style={{ color: "var(--a-text)" }}>
                  {vendor.name}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--a-text)" }}>
                  {"⭐".repeat(Math.floor(vendor.rating))} {vendor.rating.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                  €{(vendor.totalSales / 100).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className="inline-block rounded px-2 py-1 text-xs font-medium"
                    style={{
                      backgroundColor:
                        vendor.status === "active"
                          ? "rgba(0, 200, 0, 0.1)"
                          : vendor.status === "pending"
                            ? "rgba(200, 150, 0, 0.1)"
                            : "rgba(200, 0, 0, 0.1)",
                      color:
                        vendor.status === "active"
                          ? "var(--a-ok)"
                          : vendor.status === "pending"
                            ? "var(--a-warn)"
                            : "var(--a-crit)",
                    }}
                  >
                    {vendor.status === "active" ? "Actief" : vendor.status === "pending" ? "Wacht" : "Geschorst"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-xs">
                  <button style={{ color: "var(--a-info)" }}>📊 Details</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
