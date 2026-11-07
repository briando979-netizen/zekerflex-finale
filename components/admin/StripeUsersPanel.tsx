"use client";

import { useEffect, useState } from "react";
import { Panel, Pill, type Tone } from "@/components/admin/kit";

interface StripeUser {
  stripeAccountId: string;
  verificationStatus?: string;
  identityVerified?: boolean;
  kvkStatus?: string;
  btwStatus?: string;
  legalEntity?: {
    companyName?: string;
    firstName?: string;
    lastName?: string;
    taxId?: string;
  };
  lastSync: string;
}

export function StripeUsersPanel() {
  const [users, setUsers] = useState<StripeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/admin/stripe-users?action=list");
      if (r.ok) {
        const data = await r.json();
        setUsers(data.users || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/admin/stripe-users?action=sync");
      if (r.ok) {
        await load();
      }
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const getTone = (status?: string): Tone => {
    if (status === "verified") return "ok";
    if (status === "pending") return "plan";
    if (status === "rejected") return "crit";
    return "neutral";
  };

  if (loading) {
    return <Panel title="Stripe gebruikers"><div className="p-5 text-neutralx-500">Laden...</div></Panel>;
  }

  return (
    <div className="space-y-6">
      <Panel title="Sync controle">
        <div className="p-5">
          <button
            onClick={sync}
            disabled={syncing}
            className="btn btn-primary"
          >
            {syncing ? "Bezig..." : "Sync nu"}
          </button>
          <p className="text-xs text-neutralx-500 mt-2">Haalt alle Stripe-gebruikers op en slaat verificatiegegevens op</p>
        </div>
      </Panel>

      <Panel title={`Gebruikers (${users.length})`}>
        {users.length === 0 ? (
          <div className="p-5 text-neutralx-500">Geen gebruikers</div>
        ) : (
          <div className="space-y-3 p-5">
            {users.map((u) => (
              <div key={u.stripeAccountId} className="rounded-lg bg-paper-soft p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-neutralx-400 truncate">{u.stripeAccountId}</p>
                    {u.legalEntity?.companyName && (
                      <p className="text-sm font-medium">{u.legalEntity.companyName}</p>
                    )}
                    {u.legalEntity?.firstName && (
                      <p className="text-sm">{u.legalEntity.firstName} {u.legalEntity.lastName}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                    {u.verificationStatus && (
                      <Pill tone={getTone(u.verificationStatus)}>
                        {u.verificationStatus}
                      </Pill>
                    )}
                    {u.identityVerified && (
                      <Pill tone="ok">Geidentificeerd</Pill>
                    )}
                  </div>
                </div>
                {(u.legalEntity?.taxId || u.legalEntity?.companyName) && (
                  <p className="text-xs text-neutralx-500 mt-2">
                    {u.legalEntity?.taxId && <>Tax ID: {u.legalEntity.taxId}</>}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
