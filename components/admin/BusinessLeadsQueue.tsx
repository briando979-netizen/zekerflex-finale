"use client";

import { SalesPartnerBusiness } from "@prisma/client";
import { approveBusiness, rejectBusiness } from "@/app/admin/partners/actions";
import { useState } from "react";

interface BusinessLeadsQueueProps {
  leads: (SalesPartnerBusiness & {
    partner?: { id: string; email: string; fullName: string };
  })[];
  currentPage: number;
  totalPages: number;
  approverId: string;
}

export function BusinessLeadsQueue({
  leads,
  currentPage,
  totalPages,
  approverId,
}: BusinessLeadsQueueProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});

  const handleApprove = async (businessId: string) => {
    setLoading(businessId);
    try {
      await approveBusiness(businessId, approverId);
      window.location.reload();
    } catch (err) {
      alert("Fout bij goedkeuren");
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (businessId: string) => {
    const reason = rejectionReason[businessId] || "Geen reden gegeven";
    setLoading(businessId);
    try {
      await rejectBusiness(businessId, approverId, reason);
      window.location.reload();
    } catch (err) {
      alert("Fout bij afwijzen");
    } finally {
      setLoading(null);
    }
  };

  if (leads.length === 0) {
    return (
      <div className="bg-white rounded shadow p-6 text-center text-gray-500">
        ✓ Geen bedrijven in wachtrij - alles is goedgekeurd!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {leads.map((lead) => (
        <div
          key={lead.id}
          className="bg-white rounded shadow p-6 border-l-4 border-yellow-400"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-lg mb-4">{lead.businessName}</h3>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-600">Contactpersoon</p>
                  <p className="font-semibold">{lead.contactName}</p>
                </div>

                <div>
                  <p className="text-gray-600">E-mailadres</p>
                  <p className="font-semibold">{lead.contactEmail}</p>
                </div>

                <div>
                  <p className="text-gray-600">Telefoonnummer</p>
                  <p className="font-semibold">{lead.contactPhone}</p>
                </div>

                {lead.kvkNumber && (
                  <div>
                    <p className="text-gray-600">KvK-nummer</p>
                    <p className="font-semibold">{lead.kvkNumber}</p>
                  </div>
                )}

                {lead.sector && (
                  <div>
                    <p className="text-gray-600">Sector</p>
                    <p className="font-semibold">{lead.sector}</p>
                  </div>
                )}

                {lead.website && (
                  <div>
                    <p className="text-gray-600">Website</p>
                    <p className="font-semibold">
                      <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {lead.website}
                      </a>
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-gray-600">Ingediend door</p>
                  <p className="font-semibold">{lead.partner?.fullName}</p>
                  <p className="text-xs text-gray-500">{lead.partner?.email}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {lead.notes && (
                <div className="bg-gray-50 p-4 rounded">
                  <p className="text-sm font-semibold mb-2">Opmerkingen</p>
                  <p className="text-sm text-gray-700">{lead.notes}</p>
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={() => handleApprove(lead.id)}
                  disabled={loading === lead.id}
                  className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:bg-gray-400 font-semibold text-sm"
                >
                  {loading === lead.id ? "Bezig..." : "✓ Goedkeuren"}
                </button>

                <div>
                  <textarea
                    placeholder="Reden voor afwijzing (optioneel)"
                    value={rejectionReason[lead.id] || ""}
                    onChange={(e) =>
                      setRejectionReason({
                        ...rejectionReason,
                        [lead.id]: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    rows={2}
                  />
                </div>

                <button
                  onClick={() => handleReject(lead.id)}
                  disabled={loading === lead.id}
                  className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 disabled:bg-gray-400 font-semibold text-sm"
                >
                  {loading === lead.id ? "Bezig..." : "✗ Afwijzen"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
