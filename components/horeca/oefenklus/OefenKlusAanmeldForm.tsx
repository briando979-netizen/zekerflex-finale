"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface OefenKlusAanmeldFormProps {
  oefenKlusId: string;
  zaakNaam: string;
  onSuccess?: () => void;
}

export function OefenKlusAanmeldForm({ oefenKlusId, zaakNaam, onSuccess }: OefenKlusAanmeldFormProps) {
  const [voornaam, setVoornaam] = useState("");
  const [achternaam, setAchternaam] = useState("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [ervaring, setErvaring] = useState("geen");
  const [opmerkingen, setOpmerkingen] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/horeca/oefenklus/aanmeld", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oefenKlusId,
          voornaam: voornaam.trim(),
          achternaam: achternaam.trim(),
          email: email.trim(),
          telefoon: telefoon.trim(),
          ervaring,
          opmerkingen: opmerkingen.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Aanmelding mislukt");
      }

      setSuccess(true);
      setVoornaam("");
      setAchternaam("");
      setEmail("");
      setTelefoon("");
      setErvaring("geen");
      setOpmerkingen("");
      onSuccess?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 p-4">
        <p className="text-green-800 font-semibold">Aanmelding gelukt!</p>
        <p className="text-green-700 text-sm mt-1">Bedankt voor je aanmelding voor de oefenklus bij {zaakNaam}. Ze nemen binnenkort contact met je op.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Voornaam *</label>
          <Input
            type="text"
            value={voornaam}
            onChange={(e) => setVoornaam(e.target.value)}
            placeholder="Voornaam"
            required
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Achternaam *</label>
          <Input
            type="text"
            value={achternaam}
            onChange={(e) => setAchternaam(e.target.value)}
            placeholder="Achternaam"
            required
            disabled={loading}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres *</label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jij@example.com"
          required
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Telefoonnummer</label>
        <Input
          type="tel"
          value={telefoon}
          onChange={(e) => setTelefoon(e.target.value)}
          placeholder="+31 6 12345678"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Horeca-ervaring *</label>
        <select
          value={ervaring}
          onChange={(e) => setErvaring(e.target.value)}
          disabled={loading}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="geen">Geen ervaring</option>
          <option value="minder-dan-1-jaar">Minder dan 1 jaar</option>
          <option value="1-tot-3-jaar">1-3 jaar</option>
          <option value="meer-dan-3-jaar">Meer dan 3 jaar</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Opmerkingen</label>
        <Textarea
          value={opmerkingen}
          onChange={(e) => setOpmerkingen(e.target.value)}
          placeholder="Vertel ons iets over jezelf of je motivatie..."
          rows={3}
          disabled={loading}
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Bezig met aanmelden..." : "Aanmelden voor oefenklus"}
      </Button>
    </form>
  );
}
