"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ReviewRequest, ReviewSettings } from "@/lib/review-requests/shared";

// ---------------------------------------------------------------------------
// Werkgever → Google-reviews (lib/review-requests/store.ts). Vraag je eigen
// klanten om een review: ze geven sterren, en kiezen daarna zelf of ze het op
// Google delen en/of jou privé laten weten wat beter kan. Iedereen krijgt de
// Google-knop: alleen tevreden klanten naar Google sturen mag niet.
// ---------------------------------------------------------------------------

interface Data {
  settings: ReviewSettings;
  requests: ReviewRequest[];
  stats: { verstuurd: number; geopend: number; beoordeeld: number; gemiddeld: number | null; naarGoogle: number; feedback: number };
  mayRequest: boolean;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });
const stars = (n: number) => `${"★".repeat(n)}${"☆".repeat(5 - n)}`;

async function errorText(res: Response | null, fallback: string): Promise<string> {
  const d = res ? await res.json().catch(() => ({})) : {};
  return d?.error?.message ?? fallback;
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-neutralx-500">{hint}</span> : null}
    </label>
  );
}

export function GoogleReviews() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState({ googleUrl: "", feedbackEmail: "", naam: "" });
  const [klant, setKlant] = useState({ naam: "", email: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/werkgever/google-reviews", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setNotice({ ok: false, text: await errorText(res, "Google-reviews konden niet laden.") });
    const d = (await res.json()) as Data;
    setData(d);
    setForm({ googleUrl: d.settings.googleUrl ?? "", feedbackEmail: d.settings.feedbackEmail, naam: d.settings.naam });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function call(method: string, body: object | null, key: string, ok: string, query = "") {
    setBusy(key);
    setNotice(null);
    const res = await fetch(`/api/werkgever/google-reviews${query}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setNotice({ ok: false, text: await errorText(res, "Dat lukte niet.") });
      return null;
    }
    const d = await res.json().catch(() => ({}));
    setNotice({ ok: true, text: d?.request?.sent === false ? `${d.request.naam} heeft zich afgemeld voor review-verzoeken; we hebben niets verstuurd.` : ok });
    await load();
    return d;
  }

  if (!data) return notice ? <p role="alert" className="card p-6 text-sm text-crit">{notice.text}</p> : <div className="card h-40 animate-pulse" />;
  const ready = Boolean(data.settings.googleUrl && data.settings.updatedAt);
  const s = data.stats;
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Google-reviews</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">Vraag je klanten om een review</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutralx-600">
          Je klant krijgt een mail van ZekerFlex namens jou, geeft sterren en kiest daarna zelf: een review op Google, en/of jou privé laten weten wat er beter kan. Iedereen krijgt de knop naar Google, want alleen tevreden klanten doorsturen mag volgens Google en de ACM niet. Bij een lage score staat het privéformulier wel meteen open.
        </p>
      </header>

      {notice && (
        <p role={notice.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm ${notice.ok ? "bg-ok/10 text-ok" : "bg-crit/10 text-crit"}`}>
          {notice.text}
        </p>
      )}

      <section className="card p-6">
        <h2 className="font-display text-lg font-bold text-ink">1. Instellingen</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Je Google-reviewlink" hint={<>Zoek je bedrijf op Google, kies in je bedrijfsprofiel &quot;Reviews vragen&quot; of &quot;Review-formulier delen&quot; en kopieer de link (bijvoorbeeld g.page/r/…/review).</>}>
              <input className="field-input" value={form.googleUrl} onChange={(e) => setForm({ ...form, googleUrl: e.target.value })} placeholder="https://g.page/r/…/review" inputMode="url" />
            </Field>
          </div>
          <Field label="Naam van je bedrijf voor klanten">
            <input className="field-input" value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} maxLength={100} />
          </Field>
          <Field label="Privéberichten naar dit e-mailadres">
            <input className="field-input" type="email" value={form.feedbackEmail} onChange={(e) => setForm({ ...form, feedbackEmail: e.target.value })} maxLength={200} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" disabled={busy !== null} onClick={() => void call("PUT", form, "instellingen", "Instellingen opgeslagen.")} className="btn-primary disabled:opacity-50">
            {busy === "instellingen" ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-lg font-bold text-ink">2. Vraag een klant om een review</h2>
        {!data.mayRequest ? (
          <p className="mt-2 text-sm text-neutralx-600">Review-verzoeken versturen kan zodra je bedrijf geverifieerd is.</p>
        ) : !ready ? (
          <p className="mt-2 text-sm text-neutralx-600">Sla eerst je Google-reviewlink op bij stap 1.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutralx-600">Vraag alleen klanten die je echt hebt geholpen. Ze kunnen zich met één klik afmelden, en dezelfde klant vraag je hooguit eens per 30 dagen.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Naam van je klant">
                <input className="field-input" value={klant.naam} onChange={(e) => setKlant({ ...klant, naam: e.target.value })} maxLength={100} autoComplete="off" />
              </Field>
              <Field label="E-mailadres">
                <input className="field-input" type="email" value={klant.email} onChange={(e) => setKlant({ ...klant, email: e.target.value })} maxLength={200} autoComplete="off" />
              </Field>
              <button
                type="button"
                disabled={busy !== null || !klant.naam.trim() || !klant.email.includes("@")}
                onClick={async () => {
                  const d = await call("POST", klant, "verzoek", `Review-verzoek verstuurd naar ${klant.naam.trim()}.`);
                  if (d) setKlant({ naam: "", email: "" });
                }}
                className="btn-primary min-h-11 disabled:opacity-50"
              >
                {busy === "verzoek" ? "Versturen…" : "Vraag om een review"}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card p-6">
        <h2 className="font-display text-lg font-bold text-ink">3. Resultaat</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Verstuurd", s.verstuurd],
            ["Geopend", s.geopend],
            ["Beoordeeld", s.gemiddeld !== null ? `${s.beoordeeld} · gem. ${String(s.gemiddeld).replace(".", ",")}` : s.beoordeeld],
            ["Naar Google", s.naarGoogle],
            ["Privéberichten", s.feedback],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl bg-paper-soft p-3">
              <dt className="text-xs text-neutralx-500">{label}</dt>
              <dd className="mt-1 font-display text-xl font-bold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        {data.requests.length === 0 ? (
          <p className="mt-4 text-sm text-neutralx-600">Nog geen verzoeken verstuurd.</p>
        ) : (
          <ul className="mt-4 divide-y divide-hair">
            {data.requests.map((r) => (
              <li key={r.token} className="flex flex-wrap items-start gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {r.naam} <span className="font-normal text-neutralx-500">· {r.email} · {day(r.createdAt)}</span>
                  </p>
                  <p className="text-neutralx-600">
                    {!r.sent ? "Niet verstuurd: afgemeld voor review-verzoeken" : r.rating ? <span aria-label={`${r.rating} van de 5 sterren`} className="text-[#C98A00]">{stars(r.rating)}</span> : r.openedAt ? "Geopend, nog geen cijfer" : "Verstuurd"}
                    {r.googleAt ? " · naar Google gegaan" : ""}
                  </p>
                  {r.feedback && <p className="mt-1 whitespace-pre-line rounded-lg bg-paper-soft px-3 py-2 text-ink">&ldquo;{r.feedback}&rdquo;</p>}
                </div>
                <button type="button" disabled={busy !== null} onClick={() => window.confirm(`Het verzoek aan ${r.naam} en de gegevens van deze klant verwijderen?`) && void call("DELETE", null, r.token, "Verzoek verwijderd.", `?token=${r.token}`)} className="btn-ghost text-xs">
                  Verwijder
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
