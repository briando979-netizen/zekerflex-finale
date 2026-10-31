"use client";

import { useCallback, useEffect, useState } from "react";

interface CallTurn {
  at: string;
  who: "ai" | "beller";
  text: string;
}
interface CallRecord {
  id: string;
  at: string;
  direction: "outbound" | "inbound";
  toNumber: string;
  fromNumber: string;
  status: string;
  script: string;
  recordingUrl?: string;
  transcript: CallTurn[];
}
interface Data {
  configured: boolean;
  allowB2bCold: boolean;
  scripts: { id: string; label: string }[];
  calls: CallRecord[];
}

export function Beller() {
  const [data, setData] = useState<Data | null>(null);
  const [to, setTo] = useState("");
  const [script, setScript] = useState("intro-werkgever");
  const [b2b, setB2b] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [consentNum, setConsentNum] = useState("");
  const [consentMsg, setConsentMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/telephony", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const placeCall = useCallback(async () => {
    if (!to.trim() || placing) return;
    setPlacing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/telephony", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "call", to: to.trim(), script, b2b }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg({ ok: Boolean(d.ok), text: d.reason ?? d.error?.message ?? (d.ok ? "Oproep geplaatst." : "Mislukt.") });
      await load();
    } catch {
      setMsg({ ok: false, text: "Netwerkfout." });
    } finally {
      setPlacing(false);
    }
  }, [to, script, b2b, placing, load]);

  const consent = useCallback(
    async (action: "consent" | "optout") => {
      if (!consentNum.trim()) return;
      setConsentMsg(null);
      try {
        const res = await fetch("/api/admin/telephony", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, number: consentNum.trim() }),
        });
        const d = await res.json().catch(() => ({}));
        setConsentMsg(d.message ?? d.error?.message ?? "Klaar.");
      } catch {
        setConsentMsg("Netwerkfout.");
      }
    },
    [consentNum],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">📞 ZekerFlex AI-beller</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Script-gestuurde uitgaande belletjes met AI-antwoorden, 24/7 inkomend beantwoorden en opname.{" "}
          <strong>Handmatig bellen vanuit dit scherm mag altijd</strong> — jij bent dan verantwoordelijk; alleen nummers
          op de niet-bellen-lijst worden geweigerd. De <em>autonome</em> motor is strenger: die belt koud alleen met
          vastgelegde opt-in (of B2B als dat aanstaat), want particulieren mogen in Nederland niet koud gebeld worden.
        </p>
      </div>

      {data && !data.configured && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Mock-modus:</strong> er is nog geen Twilio-account gekoppeld, dus er worden geen echte oproepen
          geplaatst (wel vastgelegd, zodat je scripts kunt testen). Zet <code>TWILIO_ACCOUNT_SID</code>,{" "}
          <code>TWILIO_AUTH_TOKEN</code> en <code>TWILIO_FROM_NUMBER</code> in <code>.env.production</code> om echt te
          bellen.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-hair bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">Bel iemand</h2>
          <div className="mt-3 space-y-2.5">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Telefoonnummer, bv. +31612345678"
              className="w-full rounded-lg border border-hairstrong px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <select
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="w-full rounded-lg border border-hairstrong px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              {(data?.scripts ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-neutralx-600">
              <input type="checkbox" checked={b2b} onChange={(e) => setB2b(e.target.checked)} />
              Dit is een bedrijf (B2B){data && !data.allowB2bCold ? " — koud B2B staat globaal uit" : ""}
            </label>
            <button
              type="button"
              onClick={placeCall}
              disabled={placing || !to.trim()}
              className="w-full rounded-full bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {placing ? "Bezig…" : "Bel nu"}
            </button>
            {msg && <p className={`text-xs ${msg.ok ? "text-ok" : "text-crit"}`}>{msg.text}</p>}
          </div>
        </section>

        <section className="rounded-xl border border-hair bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">Toestemming / niet-bellen</h2>
          <p className="mt-1 text-xs text-neutralx-500">Leg opt-in vast, of zet een nummer op de niet-bellen-lijst.</p>
          <div className="mt-3 space-y-2.5">
            <input
              value={consentNum}
              onChange={(e) => setConsentNum(e.target.value)}
              placeholder="Telefoonnummer"
              className="w-full rounded-lg border border-hairstrong px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => consent("consent")}
                className="flex-1 rounded-full border border-brand-500 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50"
              >
                Toestemming vastleggen
              </button>
              <button
                type="button"
                onClick={() => consent("optout")}
                className="flex-1 rounded-full border border-crit py-2 text-xs font-semibold text-crit hover:bg-red-50"
              >
                Niet bellen
              </button>
            </div>
            {consentMsg && <p className="text-xs text-neutralx-600">{consentMsg}</p>}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-hair bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Belgeschiedenis</h2>
          <button type="button" onClick={() => void load()} className="text-xs text-brand-600 hover:underline">
            vernieuwen
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {(data?.calls ?? []).length === 0 ? (
            <p className="text-sm text-neutralx-400">Nog geen oproepen.</p>
          ) : (
            (data?.calls ?? []).map((c) => (
              <div key={c.id} className="rounded-lg border border-hair">
                <button
                  type="button"
                  onClick={() => setOpen((o) => (o === c.id ? null : c.id))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-paper-soft"
                >
                  <span>{c.direction === "inbound" ? "📥" : "📤"}</span>
                  <span className="font-mono text-xs">{c.direction === "inbound" ? c.fromNumber : c.toNumber}</span>
                  <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[10px] text-neutralx-600">{c.status}</span>
                  <span className="text-[10px] text-neutralx-400">{new Date(c.at).toLocaleString("nl-NL")}</span>
                  <span className="ml-auto text-[10px] text-neutralx-400">{c.transcript.length} beurten</span>
                </button>
                {open === c.id && (
                  <div className="space-y-1.5 border-t border-hair px-3 py-2">
                    {c.transcript.map((t, i) => (
                      <p key={i} className="text-xs leading-relaxed">
                        <span className={t.who === "ai" ? "font-semibold text-brand-700" : "font-semibold text-ink"}>
                          {t.who === "ai" ? "AI" : "Beller"}:
                        </span>{" "}
                        <span className="text-neutralx-700">{t.text}</span>
                      </p>
                    ))}
                    {c.recordingUrl && (
                      <a href={c.recordingUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
                        🎧 Opname beluisteren
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
