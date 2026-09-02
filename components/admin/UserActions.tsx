"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChatUserButton } from "@/components/app/ChatUserButton";

type Panel = "warn" | "email" | null;

export function UserActions({ userId, blocked }: { userId: string; blocked: boolean }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function toggleBlock() {
    if (!window.confirm(blocked ? "Deblokkeren? De gebruiker kan dan weer inloggen." : "Blokkeren? De gebruiker kan dan niet meer inloggen.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/gebruikers/${userId}/blokkeer`, {
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

  async function remove() {
    if (
      !window.confirm(
        "Account verwijderen? Naam, e-mail en telefoon worden geanonimiseerd en het account wordt geblokkeerd. Facturen en het auditspoor blijven bewaard. Dit kan niet ongedaan worden gemaakt.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/gebruikers/${userId}/verwijderen`, { method: "POST" });
      if (res.ok) router.push("/admin/gebruikers");
      else setMsg("Verwijderen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function sendWarning() {
    if (!reason.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/gebruikers/${userId}/waarschuwing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        setMsg("Waarschuwing vastgelegd en gemaild.");
        setReason("");
        setPanel(null);
        router.refresh();
      } else setMsg("Versturen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail() {
    if (!subject.trim() || !body.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/gebruikers/${userId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (res.ok) {
        setMsg("E-mail verstuurd.");
        setSubject("");
        setBody("");
        setPanel(null);
      } else setMsg("Versturen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-xs space-y-3 sm:w-auto">
      <div className="flex flex-wrap justify-end gap-2">
        <ChatUserButton toUserId={userId} label="Stuur bericht" className="btn-ghost text-xs" />
        <a href={`/api/admin/gebruikers/${userId}/overeenkomst`} className="btn-ghost text-xs">
          Maak overeenkomst
        </a>
        <button type="button" onClick={() => setPanel(panel === "email" ? null : "email")} className="btn-ghost text-xs">
          Stuur e-mail
        </button>
        <button type="button" onClick={() => setPanel(panel === "warn" ? null : "warn")} className="btn-ghost text-xs text-warn">
          Waarschuwing
        </button>
        <button type="button" onClick={toggleBlock} disabled={busy} className="btn-ghost text-xs text-crit disabled:opacity-50">
          {blocked ? "Deblokkeer" : "Blokkeer"}
        </button>
        <button type="button" onClick={remove} disabled={busy} className="btn-ghost text-xs text-crit disabled:opacity-50">
          Verwijder
        </button>
      </div>

      {msg && <p className="text-right text-xs text-neutralx-600">{msg}</p>}

      {panel === "warn" && (
        <div className="card space-y-2 p-4">
          <p className="text-xs font-semibold text-ink">Waarschuwing versturen</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Reden…"
            className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
          />
          <button type="button" onClick={sendWarning} disabled={busy || !reason.trim()} className="btn-primary w-full text-xs disabled:opacity-50">
            {busy ? "Bezig…" : "Versturen"}
          </button>
        </div>
      )}

      {panel === "email" && (
        <div className="card space-y-2 p-4">
          <p className="text-xs font-semibold text-ink">E-mail versturen</p>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Onderwerp"
            className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Bericht…"
            className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
          />
          <button type="button" onClick={sendEmail} disabled={busy || !subject.trim() || !body.trim()} className="btn-primary w-full text-xs disabled:opacity-50">
            {busy ? "Bezig…" : "Versturen"}
          </button>
        </div>
      )}
    </div>
  );
}
