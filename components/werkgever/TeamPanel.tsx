"use client";

import { useEffect, useState } from "react";

interface TeamMember {
  id: string;
  role: string;
  createdAt: string;
  user: { id: string; fullName: string; email: string };
  branches?: Array<{ id: string; name: string }>;
}

interface TeamInvite {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

export function TeamPanel({ tenantId }: { tenantId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("LOCAL_MANAGER");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch(`/api/werkgever/team`);
      if (r.ok) {
        const data = await r.json();
        setMembers(data.members || []);
        setInvites(data.invites || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const invite = async () => {
    setInviting(true);
    setMsg(null);
    try {
      const r = await fetch("/api/werkgever/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (r.ok) {
        setEmail("");
        setMsg("Uitnodiging verstuurd");
        await load();
      } else {
        const err = await r.json();
        setMsg(err.error || "Fout bij uitnodiging");
      }
    } finally {
      setInviting(false);
    }
  };

  const revoke = async (inviteId: string) => {
    try {
      const r = await fetch(`/api/werkgever/team/invites/${inviteId}`, {
        method: "DELETE",
      });
      if (r.ok) {
        await load();
      }
    } catch (err) {}
  };

  if (loading) return <p className="p-5 text-neutralx-500">Laden...</p>;

  return (
    <div className="p-5 space-y-6">
      <div className="border-b pb-6">
        <h3 className="font-semibold mb-4">Team uitnodiging</h3>
        <div className="space-y-3">
          <div>
            <label className="field-label">E-mailadres</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@bedrijf.nl"
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="field-input">
              <option value="LOCAL_MANAGER">Locatie manager</option>
              <option value="HQ_ADMIN">Beheerder</option>
            </select>
          </div>
          <button
            onClick={invite}
            disabled={inviting || !email}
            className="btn btn-primary"
          >
            {inviting ? "Bezig..." : "Uitnodiging versturen"}
          </button>
          {msg && <p className="text-sm text-neutralx-600">{msg}</p>}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-4">Teamleden ({members.length})</h3>
        {members.length === 0 ? (
          <p className="text-sm text-neutralx-500">Geen teamleden</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg bg-paper-soft p-3">
                <div>
                  <p className="font-medium text-sm">{m.user.fullName}</p>
                  <p className="text-xs text-neutralx-500">{m.user.email}</p>
                  <p className="text-xs text-neutralx-400">{m.role}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {invites.length > 0 && (
        <div>
          <h3 className="font-semibold mb-4">Uitnodigingen ({invites.length})</h3>
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg bg-paper-soft p-3">
                <div>
                  <p className="font-medium text-sm">{i.email}</p>
                  <p className="text-xs text-neutralx-400">{i.role} • nog niet geaccepteerd</p>
                </div>
                <button
                  onClick={() => revoke(i.id)}
                  className="text-xs font-medium text-red-600 hover:text-red-700"
                >
                  Intrekken
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
