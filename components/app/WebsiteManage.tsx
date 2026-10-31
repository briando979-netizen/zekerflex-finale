"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Opdrachtgevers-onderdeel "Website-beheer". Drie toestanden:
//   1. VERGRENDELD (geen/niet-betaald abonnement) — dashboard-weergave met een
//      slot-overlay: "kan niet ontgrendeld worden, neem een abonnement".
//   2. ONBOARDING (betaald) — formulier voor websitegegevens + SSH-toegang.
//   3. INGEDIEND/ACTIEF — "wij beheren je website"-dashboard.
// De gevoelige velden gaan versleuteld naar de server (sealed-secret).
// ---------------------------------------------------------------------------

type PlanDef = { label: string; priceCentsPerMonth: number; blurb: string; features: readonly string[] };
type Status = "PENDING_PAYMENT" | "ONBOARDING" | "SUBMITTED" | "ACTIVE" | "PAUSED" | "CANCELLED" | null;

export interface WebsiteInitial {
  status: Status;
  unlocked: boolean;
  plan: string | null;
  domain: string | null;
  provider: string | null;
  notes: string | null;
  hasSecrets: boolean;
}

type FormState = {
  domain: string;
  provider: string;
  sshHost: string;
  sshPort: string;
  sshUser: string;
  sshPrivateKey: string;
  hostingLoginUrl: string;
  hostingUsername: string;
  hostingPassword: string;
  notes: string;
  extra: string;
};

const euro = (cents: number) => `€ ${(cents / 100).toFixed(0)}`;

const STAT_TILES = [
  { label: "Bezoekers (30 d)", icon: "👣" },
  { label: "Uptime", icon: "🟢" },
  { label: "Back-ups", icon: "💾" },
  { label: "Beveiliging", icon: "🛡️" },
];

export function WebsiteManage({ initial, plans }: { initial: WebsiteInitial; plans: Record<string, PlanDef> }) {
  const [state, setState] = useState<WebsiteInitial>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FormState>({
    domain: initial.domain ?? "",
    provider: initial.provider ?? "",
    sshHost: "",
    sshPort: "22",
    sshUser: "",
    sshPrivateKey: "",
    hostingLoginUrl: "",
    hostingUsername: "",
    hostingPassword: "",
    notes: initial.notes ?? "",
    extra: "",
  });

  const subscribe = async (plan: string) => {
    setBusy(plan);
    setMessage("");
    try {
      const res = await fetch("/api/werkgever/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "subscribe", plan }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        setMessage(data?.error?.message ?? "Kon het abonnement niet starten. Probeer het opnieuw.");
        setBusy(null);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setMessage("Geen verbinding — probeer het opnieuw.");
      setBusy(null);
    }
  };

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("save");
    setMessage("");
    try {
      const res = await fetch("/api/werkgever/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error?.message ?? "Opslaan mislukt.");
        setBusy(null);
        return;
      }
      setState((s) => ({ ...s, status: "SUBMITTED", domain: form.domain || null, provider: form.provider || null, notes: form.notes || null, hasSecrets: s.hasSecrets || Boolean(form.sshPrivateKey || form.sshHost || form.hostingPassword) }));
      setForm((f) => ({ ...f, sshPrivateKey: "", hostingPassword: "" }));
      setMessage("Bedankt — je gegevens staan veilig versleuteld. Ons team neemt het beheer van je website over.");
    } catch {
      setMessage("Geen verbinding — probeer het opnieuw.");
    } finally {
      setBusy(null);
    }
  };

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Website-beheer</h1>
        <p className="mt-1 text-sm text-neutralx-500">Laat ZekerFlex je website onderhouden, beveiligen en doorontwikkelen — jij hoeft nergens meer naar om te kijken.</p>
      </header>

      {state.unlocked ? (
        state.status === "ONBOARDING" ? (
          <OnboardingForm form={form} set={set} onSubmit={saveDetails} busy={busy === "save"} message={message} />
        ) : (
          <ManagedDashboard state={state} message={message} onEdit={() => setState((s) => ({ ...s, status: "ONBOARDING" }))} />
        )
      ) : (
        <LockedView plans={plans} onSubscribe={subscribe} busy={busy} message={message} pending={state.status === "PENDING_PAYMENT"} />
      )}
    </div>
  );
}

// --- Vergrendeld: dashboard-weergave met slot-overlay + abonnementen ---------
function LockedView({
  plans,
  onSubscribe,
  busy,
  message,
  pending,
}: {
  plans: Record<string, PlanDef>;
  onSubscribe: (plan: string) => void;
  busy: string | null;
  message: string;
  pending: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Vergrendelde dashboard-preview */}
      <div className="relative overflow-hidden rounded-2xl border border-hair bg-white shadow-e1">
        <div className="pointer-events-none select-none blur-[3px]" aria-hidden>
          <div className="flex items-center justify-between border-b border-hair px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-400" />
              <span className="text-sm font-semibold text-ink">jouwbedrijf.nl</span>
            </div>
            <span className="rounded-full bg-mintwash px-2 py-0.5 text-[11px] font-bold text-brand-700">Live</span>
          </div>
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            {STAT_TILES.map((t) => (
              <div key={t.label} className="rounded-xl border border-hair bg-paper-soft p-4">
                <p className="text-lg">{t.icon}</p>
                <p className="mt-2 text-xs text-neutralx-500">{t.label}</p>
                <p className="mt-1 h-5 w-14 rounded bg-neutralx-200" />
              </div>
            ))}
          </div>
          <div className="space-y-2 px-5 pb-5">
            <div className="h-3 w-2/3 rounded bg-neutralx-100" />
            <div className="h-3 w-1/2 rounded bg-neutralx-100" />
          </div>
        </div>
        {/* Slot-overlay */}
        <div className="absolute inset-0 grid place-items-center bg-white/55 backdrop-blur-[1px]">
          <div className="max-w-md px-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ink text-white">🔒</div>
            <h2 className="mt-3 font-display text-lg font-bold text-ink">Deze functie is vergrendeld</h2>
            <p className="mt-1.5 text-sm text-neutralx-600">
              Website-beheer kun je niet ontgrendelen zonder abonnement. Pas je abonnement aan of neem een
              abonnement om je website door ons te laten beheren.
            </p>
          </div>
        </div>
      </div>

      {pending && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Je betaling wordt verwerkt. Zodra die rond is, ontgrendelt dit scherm automatisch — ververs de pagina als dat even duurt.
        </div>
      )}

      {/* Abonnementen */}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(plans).map(([key, plan]) => (
          <div key={key} className="flex flex-col rounded-2xl border border-hair bg-white p-6 shadow-e1">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-lg font-bold text-ink">{plan.label}</h3>
              <p className="text-right"><span className="text-2xl font-bold text-ink">{euro(plan.priceCentsPerMonth)}</span><span className="text-sm text-neutralx-500">/mnd</span></p>
            </div>
            <p className="mt-2 text-sm text-neutralx-600">{plan.blurb}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-neutralx-700">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2"><span className="text-brand-600">✓</span>{f}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onSubscribe(key)}
              disabled={busy !== null}
              className="mt-5 rounded-lg bg-ink py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              {busy === key ? "Bezig…" : `${plan.label} nemen — ${euro(plan.priceCentsPerMonth)}/mnd`}
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutralx-400">Maandelijks opzegbaar. Betaling via iDEAL of creditcard, veilig afgehandeld door Stripe.</p>
      {message && <p role="alert" className="text-sm font-semibold text-crit">{message}</p>}
    </div>
  );
}

// --- Onboarding: websitegegevens + SSH-toegang ------------------------------
function OnboardingForm({
  form,
  set,
  onSubmit,
  busy,
  message,
}: {
  form: FormState;
  set: (k: keyof FormState, v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
  message: string;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-xl border border-brand-200 bg-mintwash/50 px-4 py-3 text-sm text-brand-800">
        ✅ Je abonnement is actief. Vul hieronder de gegevens van je website in — dan nemen wij het beheer over.
        Alles wat je invult wordt <strong>versleuteld</strong> opgeslagen en is alleen voor ons beheerteam zichtbaar.
      </div>

      <section className="rounded-2xl border border-hair bg-white p-6 shadow-e1">
        <h2 className="font-display text-base font-bold text-ink">Je website</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">Domein / URL
            <input className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" placeholder="jouwbedrijf.nl" value={form.domain} onChange={(e) => set("domain", e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-ink">Platform / hostingpartij
            <input className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" placeholder="WordPress, Wix, eigen VPS…" value={form.provider} onChange={(e) => set("provider", e.target.value)} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-hair bg-white p-6 shadow-e1">
        <h2 className="font-display text-base font-bold text-ink">SSH-toegang (voor servers / eigen hosting)</h2>
        <p className="mt-1 text-xs text-neutralx-500">Heb je geen SSH? Laat dit leeg en vul hieronder je hosting-login in. 🔒 Alles versleuteld.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium text-ink sm:col-span-2">SSH-host / IP
            <input className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" placeholder="123.45.67.89 of ssh.jouwhost.nl" value={form.sshHost} onChange={(e) => set("sshHost", e.target.value)} autoComplete="off" />
          </label>
          <label className="block text-sm font-medium text-ink">Poort
            <input className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" value={form.sshPort} onChange={(e) => set("sshPort", e.target.value)} autoComplete="off" />
          </label>
          <label className="block text-sm font-medium text-ink">SSH-gebruiker
            <input className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" placeholder="root / deploy" value={form.sshUser} onChange={(e) => set("sshUser", e.target.value)} autoComplete="off" />
          </label>
        </div>
        <label className="mt-4 block text-sm font-medium text-ink">SSH-privésleutel
          <textarea className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 font-mono text-xs" rows={5} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" value={form.sshPrivateKey} onChange={(e) => set("sshPrivateKey", e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
      </section>

      <section className="rounded-2xl border border-hair bg-white p-6 shadow-e1">
        <h2 className="font-display text-base font-bold text-ink">Hosting- / CMS-login (optioneel)</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium text-ink">Login-URL
            <input className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" placeholder="jouwbedrijf.nl/wp-admin" value={form.hostingLoginUrl} onChange={(e) => set("hostingLoginUrl", e.target.value)} autoComplete="off" />
          </label>
          <label className="block text-sm font-medium text-ink">Gebruikersnaam
            <input className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" value={form.hostingUsername} onChange={(e) => set("hostingUsername", e.target.value)} autoComplete="off" />
          </label>
          <label className="block text-sm font-medium text-ink">Wachtwoord
            <input type="password" className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" value={form.hostingPassword} onChange={(e) => set("hostingPassword", e.target.value)} autoComplete="new-password" />
          </label>
        </div>
        <label className="mt-4 block text-sm font-medium text-ink">Extra info voor ons team
          <textarea className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" rows={3} placeholder="Bijzonderheden, wat je graag veranderd wilt, enz." value={form.extra} onChange={(e) => set("extra", e.target.value)} />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-lg bg-ink px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50">
          {busy ? "Opslaan…" : "Opslaan — wij nemen het over"}
        </button>
        {message && <p role="status" className="text-sm font-semibold text-brand-700">{message}</p>}
      </div>
    </form>
  );
}

// --- Ingediend / actief: wij beheren je website -----------------------------
function ManagedDashboard({ state, message, onEdit }: { state: WebsiteInitial; message: string; onEdit: () => void }) {
  const statusLabel: Record<string, string> = {
    SUBMITTED: "Ontvangen — wij nemen het over",
    ACTIVE: "Actief — wij beheren je website",
    PAUSED: "Gepauzeerd",
  };
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-hair bg-white p-6 shadow-e1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-mintwash text-brand-700">🌐</span>
            <div>
              <p className="font-display text-lg font-bold text-ink">{state.domain || "Je website"}</p>
              <p className="text-sm text-neutralx-500">{state.provider || "Beheerd door ZekerFlex"}</p>
            </div>
          </div>
          <span className="rounded-full bg-mintwash px-3 py-1 text-xs font-bold text-brand-700">{statusLabel[state.status ?? ""] ?? "In behandeling"}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {STAT_TILES.map((t) => (
            <div key={t.label} className="rounded-xl border border-hair bg-paper-soft p-4">
              <p className="text-lg">{t.icon}</p>
              <p className="mt-2 text-xs text-neutralx-500">{t.label}</p>
              <p className="mt-1 text-sm font-semibold text-ink">Wij bewaken dit</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-hair bg-white p-6 shadow-e1">
        <h2 className="font-display text-base font-bold text-ink">Wat wij voor je doen</h2>
        <ul className="mt-3 space-y-2 text-sm text-neutralx-700">
          <li className="flex gap-2"><span className="text-brand-600">✓</span> Updates, back-ups en beveiliging — automatisch.</li>
          <li className="flex gap-2"><span className="text-brand-600">✓</span> We houden je site online en snel.</li>
          <li className="flex gap-2"><span className="text-brand-600">✓</span> Wijzigingen? Stuur ons een bericht via de chat.</li>
        </ul>
        <p className="mt-4 text-sm text-neutralx-600">
          {state.hasSecrets ? "Je toegangsgegevens staan veilig versleuteld opgeslagen." : "Nog geen toegangsgegevens ontvangen — vul ze aan zodat we aan de slag kunnen."}
        </p>
        <button type="button" onClick={onEdit} className="mt-4 rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink">
          Gegevens aanvullen / bijwerken
        </button>
      </div>
      {message && <p role="status" className="text-sm font-semibold text-brand-700">{message}</p>}
    </div>
  );
}
