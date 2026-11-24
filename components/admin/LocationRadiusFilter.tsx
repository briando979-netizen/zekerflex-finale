"use client";

import { useState, useCallback } from "react";
import { AButton } from "@/components/admin/ui";

interface LocationPoint {
  id: string;
  fullName: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

interface LocationRadiusFilterProps {
  items: LocationPoint[];
  onFilter: (filteredIds: string[]) => void;
  onClose: () => void;
}

// Nederlandse postcodes naar coördinaten (basis mapping)
const POSTCODE_COORDS: Record<string, [number, number]> = {
  "1012": [52.3676, 4.9041], // Amsterdam
  "2595": [52.0116, 4.3571], // The Hague
  "3011": [51.9225, 4.4792], // Rotterdam
  "2611": [52.1326, 4.4983], // Delft
  "2314": [52.1631, 4.4639], // Leiden
  "3512": [52.0902, 5.1211], // Utrecht
  "6811": [51.4416, 5.4697], // Arnhem
  "6500": [51.4416, 5.4697], // Arnhem
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Aarde radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function extractPostcodePrefix(postcode: string): string {
  return postcode.substring(0, 4);
}

export function LocationRadiusFilter({ items, onFilter, onClose }: LocationRadiusFilterProps) {
  const [searchPostcode, setSearchPostcode] = useState("");
  const [radiusKm, setRadiusKm] = useState(10);
  const [results, setResults] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");

  const handleSearch = useCallback(() => {
    if (!searchPostcode.trim()) {
      setStatus("Voer een postcode in");
      return;
    }

    const prefix = extractPostcodePrefix(searchPostcode);
    const coords = POSTCODE_COORDS[prefix];

    if (!coords) {
      setStatus(`Postcode ${prefix} niet in database (basis mapping)`);
      setResults([]);
      return;
    }

    const [searchLat, searchLon] = coords;
    const filtered = items
      .filter((item) => item.latitude !== undefined && item.longitude !== undefined)
      .filter((item) => {
        const distance = calculateDistance(searchLat, searchLon, item.latitude!, item.longitude!);
        return distance <= radiusKm;
      })
      .map((item) => item.id);

    setResults(filtered);
    setStatus(`${filtered.length} freelancer(s) gevonden in straal van ${radiusKm}km`);
  }, [searchPostcode, radiusKm, items]);

  const handleApply = () => {
    onFilter(results);
    onClose();
  };

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium">Zoeken op postcode</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Bijv. 1012 XW"
            value={searchPostcode}
            onChange={(e) => setSearchPostcode(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <AButton onClick={handleSearch}>Zoeken</AButton>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Straal (km)</label>
        <div className="flex gap-2">
          {[5, 10, 25].map((radius) => (
            <AButton
              key={radius}
              variant={radiusKm === radius ? "primary" : "secondary"}
              onClick={() => setRadiusKm(radius)}
              className="flex-1"
            >
              {radius}km
            </AButton>
          ))}
          <input
            type="number"
            min="1"
            max="100"
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="w-20 rounded border border-gray-300 px-2 py-2 text-sm"
            placeholder="Custom"
          />
        </div>
      </div>

      {status && (
        <div className={`text-sm ${results.length > 0 ? "text-green-600" : "text-amber-600"}`}>
          {status}
        </div>
      )}

      <div className="flex gap-2">
        <AButton onClick={handleApply} disabled={results.length === 0} className="flex-1">
          Toepassen ({results.length})
        </AButton>
        <AButton onClick={onClose} variant="secondary" className="flex-1">
          Annuleren
        </AButton>
      </div>
    </div>
  );
}
