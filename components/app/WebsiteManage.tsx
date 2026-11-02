"use client";

import { useState } from "react";
import type { RenewalView } from "@/lib/website/renewal";
import type { MonitorView } from "@/lib/website/uptime";

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
  renewal?: RenewalView | null;
  monitor?: MonitorView | null;
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

const dateTime = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** De vier tegels bovenaan: echte metingen van de bewaking (lib/website/uptime.ts). */
function monitorTiles(m: MonitorView | null | undefined): { label: string; value: string; hint: string; tone: "ok" | "crit" | "neutral"; href?: string }[] {
  const pct = (n: number) => `${n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;
  return [
    {
      label: "Status",
      value: m?.up === true ? "Online" : m?.up === false ? "Offline" : "Wordt gemeten",
      hint: m?.since ? `sinds ${dateTime(m.since)}` : "eerste meting binnen 5 minuten",
      tone: m?.up === true ? "ok" : m?.up === false ? "crit" : "neutral",
    },
    {
      label: "Bereikbaar (30 dagen)",
      value: m?.uptime30 !== null && m?.uptime30 !== undefined ? pct(m.uptime30) : "—",
      hint: "elke 5 minuten gecontroleerd",
      tone: m?.uptime30 !== null && m?.uptime30 !== undefined && m.uptime30 < 99 ? "crit" : "neutral",
    },
    {
      label: "Reactiesnelheid",
      value: m?.avgMs ? `${m.avgMs.toLocaleString("nl-NL")} ms` : "—",
      hint: "gemiddeld vandaag",
      tone: "neutral",
    },
    {
      label: "Website-score",
      value: m?.weekly ? `${m.weekly.score} / 100` : "—",
      hint: m?.weekly ? (m.weekly.previous !== null ? `vorige week ${m.weekly.previous}` : `gemeten ${dateTime(m.weekly.at)}`) : "elke maandag een nieuwe check",
      tone: "neutral",
      ...(m?.weekly ? { href: `/website-check?r=${m.weekly.checkId}` } : {}),
    },
  ];
}

export function WebsiteManage({ initial, plans, adminOverride = false }: { initial: WebsiteInitial; plans: Record<string, PlanDef>; adminOverride?: boolean }) {
  const [state, setState] = useState<WebsiteInitial>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FormState>({
    domain: initial.domain ?? "",
    provider: initial.provider ?? "",
    sshHost: "",
    sshPort: "",
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

      {adminOverride && (
        <div className="rounded-xl border border-brand-200 bg-mintwash/50 px-4 py-2.5 text-sm text-brand-800">
          Gratis voor jouw account: je gebruikt deze functie zonder abonnement.
        </div>
      )}

      {state.unlocked ? (
        state.status === "SUBMITTED" || state.status === "ACTIVE" || state.status === "PAUSED" ? (
          <ManagedDashboard state={state} message={message} onEdit={() => setState((s) => ({ ...s, status: "ONBOARDING" }))} />
        ) : (
          <OnboardingForm form={form} set={set} onSubmit={saveDetails} busy={busy === "save"} message={message} hasSecrets={state.hasSecrets} />
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
            {monitorTiles(null).map((t) => (
              <div key={t.label} className="rounded-xl border border-hair bg-paper-soft p-4">
                <p className="text-xs text-neutralx-500">{t.label}</p>
                <p className="mt-2 h-5 w-14 rounded bg-neutralx-200" />
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
  hasSecrets,
}: {
  form: FormState;
  set: (k: keyof FormState, v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
  message: string;
  hasSecrets: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-xl border border-brand-200 bg-mintwash/50 px-4 py-3 text-sm text-brand-800">
        ✅ Je abonnement is actief. Vul hieronder de gegevens van je website in — dan nemen wij het beheer over.
        Alles wat je invult wordt <strong>versleuteld</strong> opgeslagen en is alleen voor ons beheerteam zichtbaar.
        {hasSecrets && " Je opgeslagen toegangsgegevens blijven staan: vul alleen in wat verandert."}
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
            <input className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" placeholder="22" value={form.sshPort} onChange={(e) => set("sshPort", e.target.value)} autoComplete="off" />
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
          {monitorTiles(state.monitor).map((t) => {
            const inner = (
              <>
                <p className="text-xs text-neutralx-500">{t.label}</p>
                <p className={`num mt-1 flex items-center gap-1.5 text-lg font-bold ${t.tone === "ok" ? "text-ok" : t.tone === "crit" ? "text-crit" : "text-ink"}`}>
                  {t.tone !== "neutral" && <span className="h-2 w-2 rounded-full bg-current" aria-hidden />}
                  {t.value}
                </p>
                <p className="mt-0.5 text-xs text-neutralx-500">{t.hint}</p>
              </>
            );
            return t.href ? (
              <a key={t.label} href={t.href} className="rounded-xl border border-hair bg-paper-soft p-4 transition hover:border-hairstrong">{inner}</a>
            ) : (
              <div key={t.label} className="rounded-xl border border-hair bg-paper-soft p-4">{inner}</div>
            );
          })}
        </div>
        {state.monitor && state.monitor.incidents.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-neutralx-500">Laatste storingen</p>
            <ul className="mt-1 space-y-1 text-sm text-neutralx-700">
              {state.monitor.incidents.map((i) => (
                <li key={i.start}>
                  {dateTime(i.start)} – {i.end ? dateTime(i.end) : "nog bezig"} · {i.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-hair bg-white p-6 shadow-e1">
        <h2 className="font-display text-base font-bold text-ink">Wat wij voor je doen</h2>
        <ul className="mt-3 space-y-2 text-sm text-neutralx-700">
          <li className="flex gap-2"><span className="text-brand-600">✓</span> Elke 5 minuten kijken we of je site online is. Valt hij uit, dan krijg je een mail en gaan wij aan de slag.</li>
          <li className="flex gap-2"><span className="text-brand-600">✓</span> Elke week een check op snelheid, Google en veiligheid, met de score hierboven.</li>
          {state.monitor?.backup ? (
            <li className="flex gap-2"><span className="text-brand-600">✓</span> Elke nacht een back-up van je website; de nieuwste 7 bewaren we. Laatste: {dateTime(state.monitor.backup.at)}.</li>
          ) : (
            <li className="flex gap-2"><span className="text-brand-600">✓</span> Updates, back-ups en beveiliging regelt ons team.</li>
          )}
          <li className="flex gap-2"><span className="text-brand-600">✓</span> Wijzigingen? Stuur ons een bericht via de chat.</li>
        </ul>
        <p className="mt-4 text-sm text-neutralx-600">
          {state.hasSecrets ? "Je toegangsgegevens staan veilig versleuteld opgeslagen." : "Nog geen toegangsgegevens ontvangen — vul ze aan zodat we aan de slag kunnen."}
        </p>
        <button type="button" onClick={onEdit} className="mt-4 rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink">
          Gegevens aanvullen / bijwerken
        </button>
      </div>
      {state.renewal && <RenewalCard initial={state.renewal} />}
      {message && <p role="status" className="text-sm font-semibold text-brand-700">{message}</p>}
    </div>
  );
}

// --- Vernieuwde website: eigendom bewijzen en het voorbeeld bekijken ---------
function RenewalCard({ initial }: { initial: RenewalView }) {
  const [r, setR] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [agree, setAgree] = useState(false);

  const approve = async () => {
    if (!r.mirror) return;
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/werkgever/website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve-renewal", mirrorId: r.mirror.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNote(data?.error?.message ?? "Akkoord geven is mislukt.");
      else if (data.renewal) setR(data.renewal as RenewalView);
    } catch {
      setNote("Geen verbinding. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/werkgever/website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify-dns" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNote(data?.error?.message ?? "Controleren mislukt.");
      else {
        if (data.renewal) setR(data.renewal as RenewalView);
        setNote(data.ok ? "Gelukt: het domein is bevestigd." : "We zien de regel nog niet. Een wijziging in je DNS kan tot een uur duren.");
      }
    } catch {
      setNote("Geen verbinding. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.record);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* geen klembord */
    }
  };

  const m = r.mirror;
  return (
    <div className="rounded-2xl border border-hair bg-white p-6 shadow-e1">
      <h2 className="font-display text-base font-bold text-ink">Je vernieuwde website</h2>
      <p className="mt-1 text-sm text-neutralx-600">
        We maken een kopie van {r.host ?? "je website"} die er hetzelfde uitziet, maar sneller is en beter gevonden wordt. Pas als jij akkoord geeft, gaat die live.
      </p>

      {!r.verified ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-neutralx-700">
            <strong className="text-ink">Stap 1: laat zien dat het domein van jou is.</strong> Voeg bij je domeinbeheer (bijvoorbeeld TransIP of Strato) een TXT-record toe op {r.host ?? "je domein"} met deze waarde:
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-paper-soft px-3 py-2 font-mono text-xs text-ink">{r.record}</code>
            <button type="button" onClick={copy} className="rounded-lg border border-hairstrong px-3 py-2 text-sm font-semibold text-ink hover:border-ink">
              {copied ? "Gekopieerd" : "Kopieer"}
            </button>
          </div>
          <button type="button" onClick={check} disabled={busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Controleren…" : "Ik heb het toegevoegd, controleer"}
          </button>
          <p className="text-xs text-neutralx-500">Lukt het niet? Stuur ons een bericht via de chat, dan helpen we je.</p>
        </div>
      ) : !m ? (
        <p className="mt-4 rounded-xl bg-mintwash/60 px-4 py-3 text-sm text-brand-800">Het domein is bevestigd. We maken nu je vernieuwde versie en laten het je weten zodra je hem kunt bekijken.</p>
      ) : m.status === "bezig" ? (
        <p className="mt-4 rounded-xl bg-paper-soft px-4 py-3 text-sm text-neutralx-700" role="status">We zijn je vernieuwde versie aan het maken…</p>
      ) : m.status === "mislukt" ? (
        <p className="mt-4 rounded-xl bg-paper-soft px-4 py-3 text-sm text-neutralx-700">De vorige poging lukte niet. We kijken ernaar en proberen het opnieuw.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {m.scoreBefore !== null && m.scoreAfter !== null && (
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-paper-soft px-4 py-3">
              <div>
                <p className="text-xs text-neutralx-500">Score nu</p>
                <p className="num font-display text-2xl font-bold text-ink">{m.scoreBefore}</p>
              </div>
              <span className="text-neutralx-400" aria-hidden>→</span>
              <div>
                <p className="text-xs text-neutralx-500">Vernieuwde versie</p>
                <p className="num font-display text-2xl font-bold text-ok">{m.scoreAfter}</p>
              </div>
              <p className="text-sm text-neutralx-600">{m.pages} pagina&apos;s gekopieerd</p>
            </div>
          )}
          {m.fixed.length > 0 && (
            <ul className="space-y-1.5 text-sm text-neutralx-700">
              {m.fixed.map((f) => (
                <li key={f} className="flex gap-2"><span className="text-ok" aria-hidden>✓</span>{f}</li>
              ))}
            </ul>
          )}
          <a href={`/website-preview/${m.id}/`} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold text-ink hover:border-ink">
            Bekijk je vernieuwde website
          </a>
          {r.deploy?.mirrorId === m.id && r.deploy.status === "live" ? (
            <p className="rounded-xl bg-mintwash/60 px-4 py-3 text-sm text-brand-800">
              Je vernieuwde website staat live{r.deploy.finishedAt ? ` sinds ${new Date(r.deploy.finishedAt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : ""}. Je oude site hebben we bewaard: wil je terug, laat het ons weten via de chat.
            </p>
          ) : r.deploy?.mirrorId === m.id && r.deploy.status === "bezig" ? (
            <p className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-neutralx-700" role="status">We zetten je vernieuwde website nu live…</p>
          ) : r.approvedAt ? (
            <p className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-neutralx-700">
              Je gaf akkoord op {new Date(r.approvedAt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}. We zetten hem zo snel mogelijk live en laten het je weten.
            </p>
          ) : (
            <div className="space-y-3 rounded-xl border border-hair p-4">
              <label className="flex items-start gap-2 text-sm text-neutralx-700">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
                <span>
                  Ik heb de vernieuwde versie bekeken en wil dat die mijn huidige website vervangt. Mijn huidige site blijft bewaard, zodat hij terug kan.
                </span>
              </label>
              <button type="button" onClick={approve} disabled={!agree || busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Versturen…" : "Akkoord, zet hem live"}
              </button>
              <p className="text-xs text-neutralx-500">Formulieren, webshop en inloggen werken in het voorbeeld nog niet; die koppelen we bij het live zetten.</p>
            </div>
          )}
        </div>
      )}
      {note && <p role="status" className="mt-3 text-sm font-semibold text-brand-700">{note}</p>}
    </div>
  );
}
