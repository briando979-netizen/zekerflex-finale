"use client";

import { useState } from "react";

interface Cat {
  slug: string;
  label: string;
  desc: string;
  on: boolean;
}

export function MailPrefsToggles({
  token,
  initialCategories,
  initialUnsubscribedAll,
}: {
  token: string;
  initialCategories: Cat[];
  initialUnsubscribedAll: boolean;
}) {
  const [cats, setCats] = useState(initialCategories);
  const [all, setAll] = useState(initialUnsubscribedAll);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/mail/voorkeuren", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error?.message ?? "Opslaan mislukt.");
        return;
      }
      setCats(data.categories);
      setAll(data.unsubscribedAll);
      setMsg("Opgeslagen.");
    } catch {
      setMsg("Geen verbinding.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-hair rounded-2xl border border-hair bg-paper">
        {cats.map((c) => (
          <li key={c.slug} className="flex items-start gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{c.label}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-neutralx-600">{c.desc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={c.on && !all}
              disabled={busy || all}
              onClick={() => post({ category: c.slug, on: !c.on })}
              className={`relative mt-1 h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                c.on && !all ? "bg-brand-500" : "bg-neutralx-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  c.on && !all ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </li>
        ))}
      </ul>

      <label className="flex items-start gap-3 rounded-xl border border-hair bg-paper-soft p-4">
        <input
          type="checkbox"
          checked={all}
          disabled={busy}
          onChange={(e) => post({ unsubscribeAll: e.target.checked })}
          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-500"
        />
        <span className="text-sm text-neutralx-700">
          <span className="font-medium text-ink">Meld me af voor alle optionele e-mail.</span>
          <span className="mt-0.5 block text-xs text-neutralx-500">
            Belangrijke e-mail (verificatie, wachtwoord, facturen, loonstroken) blijf je altijd ontvangen.
          </span>
        </span>
      </label>

      {msg && <p className="text-sm text-neutralx-600">{msg}</p>}
    </div>
  );
}
