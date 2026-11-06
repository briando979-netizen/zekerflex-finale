"use client";

import { useState } from "react";
import { SupportTicket, SUPPORT_CATEGORIES } from "@/lib/shop/support";

interface SupportWidgetProps {
  customerId: string;
  tickets?: SupportTicket[];
}

export function SupportWidget({ customerId, tickets = [] }: SupportWidgetProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    subject: "",
    category: "other",
    message: "",
  });

  const handleSubmit = async () => {
    if (!formData.subject || !formData.message) return;
    // TODO: Create ticket
    setFormData({ subject: "", category: "other", message: "" });
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold" style={{ color: "var(--a-text)" }}>
        Ondersteuning
      </h3>

      {showForm ? (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <h4 className="font-semibold" style={{ color: "var(--a-text)" }}>
            Nieuw ticket
          </h4>
          <div className="mt-3 space-y-3">
            <input
              type="text"
              placeholder="Onderwerp"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full rounded border p-2"
              style={{ borderColor: "var(--a-border)", backgroundColor: "var(--a-bg)" }}
            />
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full rounded border p-2"
              style={{ borderColor: "var(--a-border)", backgroundColor: "var(--a-bg)" }}
            >
              {SUPPORT_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.emoji} {cat.label}
                </option>
              ))}
            </select>
            <textarea
              placeholder="Beschrijf je probleem..."
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              className="w-full rounded border p-2"
              style={{ borderColor: "var(--a-border)", backgroundColor: "var(--a-bg)" }}
              rows={4}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                className="flex-1 rounded-lg px-3 py-2 font-medium text-white"
                style={{ backgroundColor: "var(--a-ok)" }}
              >
                Verzenden
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-lg px-3 py-2 font-medium"
                style={{ backgroundColor: "var(--a-bg)", color: "var(--a-mute)" }}
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full rounded-lg px-3 py-2 font-medium text-white"
          style={{ backgroundColor: "var(--a-ok)" }}
        >
          📧 Neem contact op
        </button>
      )}

      {/* Open tickets */}
      {tickets.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold" style={{ color: "var(--a-mute)" }}>
            Openstaande tickets ({tickets.filter((t) => t.status !== "closed").length})
          </p>
          {tickets
            .filter((t) => t.status !== "closed")
            .slice(0, 3)
            .map((ticket) => (
              <div
                key={ticket.id}
                className="rounded border p-2"
                style={{ borderColor: "var(--a-border)", backgroundColor: "var(--a-bg)" }}
              >
                <p className="text-xs font-medium" style={{ color: "var(--a-text)" }}>
                  {ticket.subject}
                </p>
                <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                  Status: {ticket.status}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
