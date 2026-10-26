"use client";

import { useEffect, useState } from "react";

type Role = "HQ_ADMIN" | "LOCAL_MANAGER" | "DISPUTE_MANAGER";

const ROLE_LABEL: Record<Role, string> = {
  HQ_ADMIN: "Beheerder (alle vestigingen, facturen, team)",
  LOCAL_MANAGER: "Lokale manager (alleen gekozen vestigingen)",
  DISPUTE_MANAGER: "Geschillenbeheerder",
};

interface Member {
  id: string;
  role: Role;
  user: { id: string; fullName: string; email: string };
  branches: { id: string; name: string }[];
}
interface Invite {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}
interface BranchOption {
  id: string;
  name: string;
}

export function TeamBoard({ canManage }: { canManage: boolean }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("LOCAL_MANAGER");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/werkgever/team", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members);
      setInvites(data.invites);
    }
  }

  useEffect(() => {
    void refresh();
    if (canManage) {
      fetch("/api/werkgever/branches", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setBranches(d.branches ?? []))
        .catch(() => undefined);
    }
  }, [canManage]);

  function resetForm() {
    setEmail("");
    setRole("LOCAL_MANAGER");
    setBranchIds([]);
    setInviting(false);
    setErr(null);
  }

  async function invite() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/werkgever/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, branchIds: role === "LOCAL_MANAGER" ? branchIds : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Uitnodigen mislukt");
      resetForm();
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(id: string) {
    if (!window.confirm("Dit teamlid verwijderen?")) return;
    const res = await fetch(`/api/werkgever/team/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(data?.error?.message ?? "Verwijderen mislukt");
      return;
    }
    await refresh();
  }

  async function revokeInvite(id: string) {
    const res = await fetch(`/api/werkgever/team/invites/${id}`, { method: "DELETE" });
    if (res.ok) await refresh();
  }

  function toggleBranch(id: string) {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-4">
      {!members ? (
        <p className="text-sm text-neutralx-500">Laden…</p>
      ) : (
        <div className="divide-y divide-hair rounded-xl border border-hair">
          {members.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">{m.user.fullName}</p>
                <p className="mt-0.5 text-xs text-neutralx-500">{m.user.email}</p>
                <p className="mt-1 text-[11px] text-neutralx-400">
                  {ROLE_LABEL[m.role]}
                  {m.role === "LOCAL_MANAGER" && m.branches.length > 0
                    ? ` — ${m.branches.map((b) => b.name).join(", ")}`
                    : ""}
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => removeMember(m.id)}
                  className="text-[11px] font-medium text-neutralx-500 hover:text-crit"
                >
                  Verwijderen
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {invites.length > 0 && (
        <div className="rounded-xl border border-hair p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutralx-400">
            Openstaande uitnodigingen
          </p>
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span>
                  {i.email} <span className="text-neutralx-400">— {ROLE_LABEL[i.role]}</span>
                </span>
                {canManage && (
                  <button type="button" onClick={() => revokeInvite(i.id)} className="text-[11px] text-neutralx-500 hover:text-crit">
                    Intrekken
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {canManage && (
        <>
          {!inviting ? (
            <button type="button" onClick={() => setInviting(true)} className="btn-ghost text-sm">
              + Teamlid uitnodigen
            </button>
          ) : (
            <div className="rounded-xl border border-hair p-4">
              <div className="space-y-3">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mailadres"
                  type="email"
                  className="field-input w-full"
                />
                <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="field-input w-full">
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                {role === "LOCAL_MANAGER" && (
                  <div>
                    <p className="mb-1 text-xs text-neutralx-500">
                      Vestigingen (leeg = geen toegang; kies minstens één):
                    </p>
                    <div className="space-y-1">
                      {branches.length === 0 && (
                        <p className="text-xs text-neutralx-400">
                          Nog geen vestigingen — voeg er eerst een toe op /werkgever/locaties.
                        </p>
                      )}
                      {branches.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={branchIds.includes(b.id)}
                            onChange={() => toggleBranch(b.id)}
                          />
                          {b.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {err && <p role="alert" className="text-sm text-crit">{err}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={invite}
                    disabled={busy || !email || (role === "LOCAL_MANAGER" && branchIds.length === 0)}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {busy ? "Bezig…" : "Uitnodigen"}
                  </button>
                  <button type="button" onClick={resetForm} className="btn-ghost text-sm">
                    Annuleren
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
