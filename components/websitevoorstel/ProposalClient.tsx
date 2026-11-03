"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

// ---------------------------------------------------------------------------
// The two parts of /websitevoorstel/<id> that run in the browser: counting the
// visit once (not for link previews, which don't run this), and the "ja" form.
// ---------------------------------------------------------------------------

export function ViewBeacon({ id }: { id: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void fetch(`/api/websitevoorstel/${id}/bekeken`, { method: "POST", keepalive: true }).catch(() => undefined);
  }, [id]);
  return null;
}

interface Plan {
  key: "basis" | "pro";
  label: string;
  maand: string;
}

const DOMEIN = [
  { id: "houden", label: "Mijn domein blijft bij mijn huidige provider; ik laat het naar ZekerFlex wijzen" },
  { id: "verhuizen", label: "Ik wil mijn domein naar ZekerFlex verhuizen" },
  { id: "geen", label: "Ik heb nog geen domein" },
  { id: "weet-niet", label: "Weet ik nog niet, bespreek het met me" },
] as const;

export function AcceptForm({ id, plans, bedrijf, websitePrijs }: { id: string; plans: Plan[]; bedrijf: string; websitePrijs: string }) {
  const [pakket, setPakket] = useState<Plan["key"]>("basis");
  const [domein, setDomein] = useState<(typeof DOMEIN)[number]["id"]>("houden");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ plek: number | null; kortingPct: number } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/websitevoorstel/${id}/akkoord`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        naam: String(f.get("naam") ?? ""),
        email: String(f.get("email") ?? ""),
        telefoon: String(f.get("telefoon") ?? ""),
        opmerking: String(f.get("opmerking") ?? ""),
        website: String(f.get("website") ?? ""),
        pakket,
        domein,
        begrepen: f.get("begrepen") === "on",
      }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(d?.error?.message ?? "Versturen lukte niet. Probeer het opnieuw of mail ons.");
    setDone({ plek: d.plek ?? null, kortingPct: d.kortingPct ?? 0 });
  }

  if (done) {
    return (
      <div role="status" className="border border-lux-line bg-white p-8">
        <p className="font-serif text-3xl">Bedankt, we gaan voor je aan de slag</p>
        <p className="mt-3 text-lux-mute">
          {done.plek ? `Je hebt introductieplek ${done.plek}, met ${done.kortingPct}% korting op de website. ` : ""}
          We nemen binnen één werkdag contact met je op om alles door te nemen. Er is nog niets betaald of afgesloten.
        </p>
      </div>
    );
  }

  const radio = "mt-0.5 h-4 w-4 flex-shrink-0 accent-[#151412]";
  return (
    <form onSubmit={(e) => void submit(e)} className="relative space-y-6 border border-lux-line bg-white p-6 sm:p-8">
      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-lux-mute">Kies je pakket</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {plans.map((p) => (
            <label key={p.key} className={`flex cursor-pointer items-start gap-3 border p-4 ${pakket === p.key ? "border-lux-ink" : "border-lux-line"}`}>
              <input type="radio" name="pakket" className={radio} checked={pakket === p.key} onChange={() => setPakket(p.key)} />
              <span>
                <span className="block font-semibold">Website-beheer {p.label}</span>
                <span className="block text-sm text-lux-mute">{p.maand} per maand, plus de website voor {websitePrijs}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-lux-mute">Je domein</legend>
        <div className="mt-3 space-y-2">
          {DOMEIN.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="radio" name="domein" className={radio} checked={domein === o.id} onChange={() => setDomein(o.id)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Je naam
          <input name="naam" required maxLength={100} autoComplete="name" className="mt-1.5 w-full border border-lux-line bg-white px-3 py-2.5 focus:border-lux-ink focus:outline-none" />
        </label>
        <label className="block text-sm font-medium">
          E-mailadres
          <input name="email" type="email" required maxLength={200} autoComplete="email" className="mt-1.5 w-full border border-lux-line bg-white px-3 py-2.5 focus:border-lux-ink focus:outline-none" />
        </label>
        <label className="block text-sm font-medium">
          Telefoon (mag leeg)
          <input name="telefoon" maxLength={30} autoComplete="tel" inputMode="tel" className="mt-1.5 w-full border border-lux-line bg-white px-3 py-2.5 focus:border-lux-ink focus:outline-none" />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          Wil je nog iets kwijt? (mag leeg)
          <textarea name="opmerking" maxLength={2000} rows={3} className="mt-1.5 w-full border border-lux-line bg-white px-3 py-2.5 focus:border-lux-ink focus:outline-none" />
        </label>
        <label className="absolute -left-[5000px]" aria-hidden="true">
          Laat leeg
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" name="begrepen" required className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#151412]" />
        <span>Ik wil de nieuwe website voor {bedrijf}. Ik begrijp dat ZekerFlex contact met me opneemt om alles door te nemen, en dat er nu nog niets betaald of afgesloten wordt.</span>
      </label>
      {error && (
        <p role="alert" className="border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="w-full bg-lux-ink px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-black disabled:opacity-60 sm:w-auto">
        {busy ? "Bezig…" : "Ja, ik wil deze website"}
      </button>
    </form>
  );
}
