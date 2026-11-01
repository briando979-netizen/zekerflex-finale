"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChatUserButton } from "@/components/app/ChatUserButton";

export function CompanyActions({
  tenantId,
  contactUserId,
  blocked,
  verifiedVia = null,
}: {
  tenantId: string;
  contactUserId: string;
  blocked: boolean;
  /** how the company counts as verified (null = not verified → test klus only) */
  verifiedVia?: "platform" | "kvk" | "admin" | "history" | null;
}) {
  const router = useRouter();
  const [emailOpen, setEmailOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function toggleBlock() {
    if (
      !window.confirm(
        blocked
          ? "Deblokkeren? Alle gebruikers van deze organisatie kunnen dan weer inloggen."
          : "Blokkeren? Alle gebruikers van deze organisatie kunnen dan niet meer inloggen.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/bedrijven/${tenantId}/blokkeer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: !blocked }),
      });
      if (res.ok) router.refresh();
      else setMsg("Actie mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function setApproval(approved: boolean) {
    if (!window.confirm(approved ? "Bedrijf goedkeuren? Het kan dan klussen plaatsen en mensen inplannen." : "Goedkeuring intrekken?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/bedrijven/${tenantId}/verifieer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      if (res.ok) router.refresh();
      else setMsg("Actie mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail() {
    if (!subject.trim() || !body.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/bedrijven/${tenantId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(`Verstuurd naar ${d.delivered ?? 0}/${d.recipients ?? 0} beheerder(s).`);
        setSubject("");
        setBody("");
        setEmailOpen(false);
      } else setMsg(d?.error?.message ?? "Versturen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-3 sm:w-auto sm:max-w-md">
      <div className="flex flex-wrap justify-end gap-2">
        <ChatUserButton toUserId={contactUserId} label="Stuur bericht" className="a-button text-xs" />
        <button type="button" onClick={() => setEmailOpen((v) => !v)} className="a-button text-xs">
          Stuur e-mail
        </button>
        {(verifiedVia === null || verifiedVia === "admin") && (
          <button type="button" onClick={() => setApproval(verifiedVia === null)} disabled={busy} className="a-button text-xs">
            {verifiedVia === null ? "Bedrijf goedkeuren" : "Goedkeuring intrekken"}
          </button>
        )}
        <button type="button" onClick={toggleBlock} disabled={busy} className="a-button text-xs" style={{ color: "var(--a-crit)" }}>
          {blocked ? "Deblokkeer" : "Blokkeer"}
        </button>
      </div>

      {msg && <p role="status" className="text-right text-xs" style={{ color: "var(--a-dim)" }}>{msg}</p>}

      {emailOpen && (
        <div className="a-panel space-y-2 p-4 text-left">
          <p className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>E-mail naar alle bedrijfsbeheerders</p>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Onderwerp"
            className="a-input"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Bericht…"
            className="a-input"
          />
          <button type="button" onClick={sendEmail} disabled={busy || !subject.trim() || !body.trim()} className="a-button a-button-primary w-full text-xs">
            {busy ? "Bezig…" : "Versturen"}
          </button>
        </div>
      )}
    </div>
  );
}
