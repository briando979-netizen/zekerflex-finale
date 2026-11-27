"use client";

import { FormEvent, useState } from "react";
import { submitBusiness } from "@/app/werkgever/partners/actions";
import { Panel } from "@/components/admin/kit";

interface BusinessRegistrationFormProps {
  userId: string;
}

export function BusinessRegistrationForm({ userId }: BusinessRegistrationFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      businessName: formData.get("businessName"),
      kvkNumber: formData.get("kvkNumber"),
      contactName: formData.get("contactName"),
      contactEmail: formData.get("contactEmail"),
      contactPhone: formData.get("contactPhone"),
      sector: formData.get("sector"),
      estimatedEmployees: formData.get("estimatedEmployees")
        ? parseInt(formData.get("estimatedEmployees") as string)
        : undefined,
      website: formData.get("website"),
      notes: formData.get("notes"),
    };

    try {
      await submitBusiness(userId, data);
      setSuccess(true);
      (e.target as HTMLFormElement).reset();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er is een fout opgetreden");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title="Nieuw Bedrijf Toevoegen" icon="➕">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded p-3">
            <p className="text-sm text-green-800">✓ Bedrijf succesvol toegevoegd</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold mb-1">Bedrijfsnaam *</label>
          <input
            type="text"
            name="businessName"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="Acme BV"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">KvK-nummer</label>
          <input
            type="text"
            name="kvkNumber"
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="12345678"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Contactnaam *</label>
          <input
            type="text"
            name="contactName"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="Jan Jansen"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">E-mailadres *</label>
          <input
            type="email"
            name="contactEmail"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="jan@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Telefoonnummer *</label>
          <input
            type="tel"
            name="contactPhone"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="+31 6 12345678"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Sector</label>
          <input
            type="text"
            name="sector"
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="Horeca / Retail / etc."
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Geschatte aantal werknemers</label>
          <input
            type="number"
            name="estimatedEmployees"
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="50"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Website</label>
          <input
            type="url"
            name="website"
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Opmerkingen</label>
          <textarea
            name="notes"
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            rows={3}
            placeholder="Eventuele opmerkingen..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white py-2 rounded font-semibold hover:bg-green-700 disabled:bg-gray-400"
        >
          {loading ? "Bezig..." : "Bedrijf Toevoegen"}
        </button>
      </form>
    </Panel>
  );
}
