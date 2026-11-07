"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface OefenKlus {
  id: string;
  titel: string;
  beschrijving: string;
  datum: string;
  startTijd: string;
  eindTijd: string;
  maxAanmeldingen: number;
  niveau: string;
  actief: boolean;
  createdAt: string;
}

interface OefenKlusBeheerProps {
  zaakId: string;
}

export function OefenKlusBeheer({ zaakId }: OefenKlusBeheerProps) {
  const [klussen, setKlussen] = useState<OefenKlus[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    titel: "",
    beschrijving: "",
    datum: "",
    startTijd: "",
    eindTijd: "",
    maxAanmeldingen: 5,
    niveau: "beginner",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/horeca/oefenklus/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zaakId, ...formData }),
      });

      if (res.ok) {
        const newKlus = await res.json();
        setKlussen([newKlus, ...klussen]);
        setFormData({
          titel: "",
          beschrijving: "",
          datum: "",
          startTijd: "",
          eindTijd: "",
          maxAanmeldingen: 5,
          niveau: "beginner",
        });
        setShowForm(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDatum = (datum: string) => new Date(datum).toLocaleDateString("nl-NL");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Oefenklussen</h2>
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? "Annuleren" : "Nieuw"}</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 p-6 space-y-4 bg-gray-50">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
              <Input
                type="text"
                value={formData.titel}
                onChange={(e) => setFormData({ ...formData, titel: e.target.value })}
                placeholder="bijv. Barpraktijk voor beginners"
                required
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Datum *</label>
              <Input
                type="date"
                value={formData.datum}
                onChange={(e) => setFormData({ ...formData, datum: e.target.value })}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Starttijd *</label>
              <Input
                type="time"
                value={formData.startTijd}
                onChange={(e) => setFormData({ ...formData, startTijd: e.target.value })}
                required
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Eindtijd *</label>
              <Input
                type="time"
                value={formData.eindTijd}
                onChange={(e) => setFormData({ ...formData, eindTijd: e.target.value })}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beschrijving *</label>
            <Textarea
              value={formData.beschrijving}
              onChange={(e) => setFormData({ ...formData, beschrijving: e.target.value })}
              placeholder="Wat gaat de deelnemer leren? Welke vaardigheden oefenen?"
              rows={3}
              required
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max. deelnemers</label>
              <Input
                type="number"
                min="1"
                max="20"
                value={formData.maxAanmeldingen}
                onChange={(e) => setFormData({ ...formData, maxAanmeldingen: parseInt(e.target.value) })}
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Niveau *</label>
              <select
                value={formData.niveau}
                onChange={(e) => setFormData({ ...formData, niveau: e.target.value })}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Gevorderd</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Bezig..." : "Oefenklus aanmaken"}
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {klussen.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">Geen oefenklussen aangemaakt</p>
        ) : (
          klussen.map((klus) => (
            <div key={klus.id} className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{klus.titel}</h3>
                  <p className="text-sm text-gray-600 mt-1">{klus.beschrijving}</p>
                  <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
                    <span>{formatDatum(klus.datum)}</span>
                    <span>
                      {klus.startTijd} - {klus.eindTijd}
                    </span>
                    <span>{klus.niveau}</span>
                    <span>Max {klus.maxAanmeldingen}</span>
                    <span className={klus.actief ? "text-green-600" : "text-red-600"}>{klus.actief ? "Actief" : "Inactief"}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Bekijk aanmeldingen
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
