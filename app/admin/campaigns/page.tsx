"use client";

import { useEffect, useState } from "react";
import { requireRole } from "@/lib/auth";

interface Campaign {
  id: string;
  title: string;
  status: string;
  startDate: string;
  endDate?: string;
  viewCount: number;
  clickCount: number;
}

export default function CampaignsAdminPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/admin/marketing/campaigns");
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data.campaigns);
        }
      } catch (err) {
        console.error("Failed to load campaigns:", err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campagnes</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition"
        >
          + Nieuwe campagne
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Titel</label>
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Campagne titel"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Beschrijving</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2"
              rows={3}
              placeholder="Campagne beschrijving"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Start datum</label>
              <input type="datetime-local" className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Eind datum</label>
              <input type="datetime-local" className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition">
              Opslaan
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border rounded-lg hover:bg-slate-50 transition"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">Titel</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Start</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Views</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Clicks</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Acties</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {campaigns.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-6 py-3 font-semibold">{c.title}</td>
                <td className="px-6 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    c.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-800"
                  }`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-6 py-3 text-sm">
                  {new Date(c.startDate).toLocaleDateString("nl-NL")}
                </td>
                <td className="px-6 py-3 text-sm">{c.viewCount}</td>
                <td className="px-6 py-3 text-sm">{c.clickCount}</td>
                <td className="px-6 py-3">
                  <div className="flex gap-2">
                    <button className="text-blue-600 hover:underline text-sm">Bewerken</button>
                    <button className="text-red-600 hover:underline text-sm">Verwijderen</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
