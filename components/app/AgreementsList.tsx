"use client";

import { useEffect, useState } from "react";

interface Agreement {
  id: string;
  reference: string;
  type: string;
  status: string;
  freelancerLegalName: string;
  clientLegalName: string;
  hourlyRateCents: number | null;
  freelancerSignedAt: string | null;
  clientSignedAt: string | null;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  VRIJE_VERVANGING: "Vrije vervanging",
  GEEN_WERKGEVERSGEZAG: "Geen werkgeversgezag",
  TUSSENKOMST: "Tussenkomst",
  BRANCHE: "Branchemodel",
};

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  ACTIVE: { text: "Actief", tone: "text-ok" },
  PENDING_FREELANCER_SIGNATURE: { text: "Wacht op kracht", tone: "text-warn" },
  PENDING_CLIENT_SIGNATURE: { text: "Jij moet tekenen", tone: "text-warn" },
  DRAFT: { text: "Concept", tone: "text-neutralx-500" },
  DECLINED: { text: "Afgewezen", tone: "text-crit" },
  SUPERSEDED: { text: "Vervangen", tone: "text-neutralx-400" },
  EXPIRED: { text: "Verlopen", tone: "text-neutralx-400" },
};

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

export function AgreementsList({ side }: { side: "client" | "freelancer" }) {
  const [items, setItems] = useState<Agreement[] | null>(null);
  const [signing, setSigning] = useState<string | null>(null);

  const load = () =>
    fetch("/api/model-agreements", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems(d.agreements ?? []))
      .catch(() => setItems([]));
  useEffect(() => {
    void load();
  }, []);

  const sign = async (id: string) => {
    setSigning(id);
    try {
      await fetch(`/api/model-agreements/${id}/sign`, { method: "POST" });
      await load();
    } finally {
      setSigning(null);
    }
  };

  if (!items) return null;
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-hairstrong bg-paper-soft/60 p-5 text-sm text-neutralx-500">
        Nog geen modelovereenkomsten. Bij de eerste match met een freelancer wordt er automatisch één klaargezet —
        je ziet hem hier, ook zonder te tekenen.
      </p>
    );
  }

  const needsMySignature = (a: Agreement) =>
    side === "client" ? !a.clientSignedAt : !a.freelancerSignedAt;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
            <th className="px-4 py-2.5 font-medium">Referentie</th>
            <th className="px-4 py-2.5 font-medium">{side === "client" ? "Freelancer" : "Opdrachtgever"}</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 text-right font-medium">Acties</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hair">
          {items.map((a) => {
            const st = STATUS_LABEL[a.status] ?? { text: a.status, tone: "text-neutralx-500" };
            return (
              <tr key={a.id}>
                <td className="px-4 py-3 font-mono text-xs text-neutralx-600">{a.reference}</td>
                <td className="px-4 py-3 text-neutralx-700">
                  {side === "client" ? a.freelancerLegalName : a.clientLegalName}
                  {a.hourlyRateCents ? <span className="ml-1 text-xs text-neutralx-400">· {euro(a.hourlyRateCents)}/u</span> : null}
                </td>
                <td className="px-4 py-3 text-neutralx-600">{TYPE_LABEL[a.type] ?? a.type}</td>
                <td className={`px-4 py-3 font-medium ${st.tone}`}>{st.text}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <a
                      href={`/api/model-agreements/${a.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      PDF ↓
                    </a>
                    {a.status !== "ACTIVE" && a.status !== "DECLINED" && needsMySignature(a) && (
                      <button
                        type="button"
                        onClick={() => sign(a.id)}
                        disabled={signing === a.id}
                        className="rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        {signing === a.id ? "…" : "Tekenen"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
