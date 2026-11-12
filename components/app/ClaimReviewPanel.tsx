"use client";

import { useEffect, useState } from "react";
import { useI18n, useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

interface Claim {
  id: string;
  direction: "freelancer_owed" | "employer_owed";
  shiftId: string;
  shiftTitle: string;
  freelancerName: string;
  claimedCents: number;
  shiftValueCents: number;
  reason: string;
  status: string;
  filedAt: string;
}

export function ClaimReviewPanel({ shiftId }: { shiftId?: string }) {
  const { locale, t: dict } = useI18n();
  const k = dict.claimPaneel;
  const euro = (c: number) => `€ ${locale === "nl" ? (c / 100).toFixed(2).replace(".", ",") : (c / 100).toFixed(2)}`;
  const [claims, setClaims] = useState<Claim[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    fetch("/api/werkgever/claims", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setClaims((d.claims ?? []).filter((c: Claim) => (shiftId ? c.shiftId === shiftId : true))))
      .catch(() => undefined);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId]);

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setBusy(id);
    try {
      await fetch(`/api/werkgever/claims/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const decideOffer = async (id: string, decision: "accepted" | "declined") => {
    setBusy(id);
    try {
      await fetch(`/api/werkgever/claims/${id}/decide-offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const pending = claims.filter((c) => c.status === "filed" || c.status === "offered");
  if (claims.length === 0) return null;

  const statusLabel = (c: Claim): string => {
    if (c.status === "approved") return k.stGoedgekeurd;
    if (c.status === "rejected") return k.stAfgewezen;
    if (c.status === "withdrawn") return c.direction === "employer_owed" ? k.stAfgezien : k.stIngetrokken;
    if (c.status === "paid") return k.stBetaald;
    return k.stBehandeling;
  };

  return (
    <div className="mb-6 rounded-2xl border border-crit/30 bg-crit/[0.04] p-5">
      <p className="font-display text-sm font-bold text-ink">{k.kop}</p>
      <p className="mt-0.5 text-xs text-neutralx-500">
        {k.uitleg}
      </p>
      <ul className="mt-3 space-y-3">
        {claims.map((c) => (
          <li key={c.id} className="rounded-xl bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink">{c.freelancerName}</span>
              <span className="text-sm font-semibold text-ink">{euro(c.claimedCents)}</span>
            </div>
            <p className="mt-1 text-xs text-neutralx-500">
              {fmt(k.regel, { titel: c.shiftTitle, bedrag: euro(c.shiftValueCents) })}
              {c.direction === "employer_owed" && k.teLaat}
            </p>
            {c.reason && <p className="mt-1 text-xs text-neutralx-600">“{c.reason}”</p>}
            {c.status === "filed" && c.direction === "freelancer_owed" ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => decide(c.id, "approved")}
                  disabled={busy === c.id}
                  className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {fmt(k.goedkeuren, { bedrag: euro(c.claimedCents) })}
                </button>
                <button
                  type="button"
                  onClick={() => decide(c.id, "rejected")}
                  disabled={busy === c.id}
                  className="rounded-lg border border-hairstrong px-3 py-1.5 text-xs font-medium text-neutralx-600 disabled:opacity-40"
                >
                  {k.afwijzen}
                </button>
              </div>
            ) : c.status === "offered" ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => decideOffer(c.id, "accepted")}
                  disabled={busy === c.id}
                  className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {fmt(k.claimen, { bedrag: euro(c.claimedCents) })}
                </button>
                <button
                  type="button"
                  onClick={() => decideOffer(c.id, "declined")}
                  disabled={busy === c.id}
                  className="rounded-lg border border-hairstrong px-3 py-1.5 text-xs font-medium text-neutralx-600 disabled:opacity-40"
                >
                  {k.afzien}
                </button>
              </div>
            ) : (
              <p
                className={`mt-2 text-xs font-medium ${
                  c.status === "approved" || c.status === "paid" ? "text-ok" : "text-neutralx-400"
                }`}
              >
                {statusLabel(c)}
              </p>
            )}
          </li>
        ))}
      </ul>
      {pending.length === 0 && <p className="mt-2 text-xs text-neutralx-400">{k.geenOpen}</p>}
    </div>
  );
}
