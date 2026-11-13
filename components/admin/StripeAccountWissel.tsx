"use client";

import { useEffect, useState } from "react";
import { Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import type { StripeAccountCheck, StripeAccountInfo } from "@/lib/billing/stripe-account-vorm";

// Beheer → Stripe-account (13 nov 2026): de geheime sleutel één keer plakken, eerst controleren (er verandert niets),
// dan pas "Gebruik dit account". De sleutel blijft alleen in dit veld en gaat na het gebruik weg uit het scherm.

type Antwoord = { error?: { message?: string }; actief?: StripeAccountInfo | null; check?: StripeAccountCheck };

export function StripeAccountWissel() {
  const [actief, setActief] = useState<StripeAccountInfo | null | undefined>(undefined);
  const [sleutel, setSleutel] = useState("");
  const [check, setCheck] = useState<StripeAccountCheck | null>(null);
  const [zeker, setZeker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gelukt, setGelukt] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/stripe-account", { cache: "no-store" })
      .then((r) => r.json() as Promise<Antwoord>)
      .then((d) => setActief(d.actief ?? null))
      .catch(() => setActief(null));
  }, []);

  async function stuur(methode: "POST" | "DELETE", body?: unknown): Promise<Antwoord | null> {
    setBusy(true);
    setFout(null);
    setGelukt(null);
    try {
      const res = await fetch("/api/admin/stripe-account", {
        method: methode,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const d = (await res.json().catch(() => ({}))) as Antwoord;
      if (!res.ok) {
        setFout(d.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
        return null;
      }
      return d;
    } catch {
      setFout("Geen verbinding. Probeer het opnieuw.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function controleer() {
    setCheck(null);
    setZeker(false);
    const d = await stuur("POST", { actie: "controleer", sleutel });
    if (d?.check) setCheck(d.check);
  }

  async function gebruik() {
    const d = await stuur("POST", { actie: "gebruik", sleutel });
    if (d?.actief) {
      setActief(d.actief);
      setSleutel("");
      setCheck(null);
      setZeker(false);
      setGelukt(`Gelukt: ${d.actief.naam ?? d.actief.accountId} is nu het Stripe-account van ZekerFlex. De webhook is aangemaakt.`);
    }
  }

  async function terug() {
    const d = await stuur("DELETE");
    if (d) {
      setActief(d.actief ?? null);
      setGelukt(d.actief ? `Terug naar ${d.actief.naam ?? d.actief.accountId}.` : "Terug naar de sleutel uit de serverinstellingen.");
    }
  }

  const magGebruiken = Boolean(check && check.live && check.betalen);

  return (
    <div className="space-y-6">
      <PageHead
        title="Stripe-account"
        subtitle="Kies met welk Stripe-account ZekerFlex betalingen ontvangt. Eerst controleren: er verandert pas iets als je op 'Gebruik dit account' drukt."
      />

      <Panel title="Nu actief">
        {actief === undefined ? (
          <p className="text-sm text-neutralx-500">Laden…</p>
        ) : actief ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-semibold text-ink">{actief.naam ?? "Zonder naam"}</span> · {actief.accountId}
              {actief.land ? ` · ${actief.land}` : ""} · sleutel eindigt op {actief.eind}
            </p>
            <p className="text-neutralx-500">
              Ingesteld door {actief.door} op {new Date(actief.ingesteldOp).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}.{" "}
              {actief.webhook ? <Pill tone="ok">webhook aangemaakt</Pill> : <Pill tone="warn">geen webhook</Pill>}{" "}
              {actief.connectWebhook ? <Pill tone="ok">Connect-webhook aangemaakt</Pill> : <Pill tone="warn">geen Connect-webhook</Pill>}
            </p>
            {actief.connectMelding && <Notice tone="warn">{actief.connectMelding}</Notice>}
            <button type="button" onClick={() => void terug()} disabled={busy} className="btn-ghost min-h-[44px]">
              {actief.heeftVorige ? "Terug naar het vorige account" : "Terug naar de sleutel uit de serverinstellingen"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-neutralx-600">De sleutel uit de serverinstellingen (.env). Dat is het oude account.</p>
        )}
      </Panel>

      <Panel title="Nieuw account kiezen">
        <div className="space-y-3">
          <label htmlFor="stripe-sleutel" className="field-label">
            Geheime sleutel (Stripe → Ontwikkelaars → API-sleutels)
          </label>
          <input
            id="stripe-sleutel"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={sleutel}
            onChange={(e) => {
              setSleutel(e.target.value);
              setCheck(null);
              setZeker(false);
            }}
            placeholder="sk_live_… of rk_live_…"
            className="field-input w-full font-mono"
          />
          <p className="text-xs text-neutralx-500">Plak hem alleen hier, nooit in een chat of mail. Hij wordt versleuteld bewaard en komt nergens meer in beeld.</p>
          <button type="button" onClick={() => void controleer()} disabled={busy || sleutel.trim().length < 10} className="btn-primary min-h-[44px]">
            {busy && !check ? "Controleren…" : "Controleer"}
          </button>

          {check && (
            <dl className="mt-2 divide-y divide-hair rounded-xl border border-hair text-sm">
              {(
                [
                  ["Account", check.accountId],
                  ["Naam", check.naam ?? "—"],
                  ["Juridische naam", check.juridischeNaam ?? "—"],
                  ["Land", check.land ?? "—"],
                  ["Betalingen ontvangen", check.betalen ? "ja" : "nee"],
                  ["Uitbetalen", check.uitbetalen ? "ja" : "nee"],
                  ["ID-controle (Identity)", check.identity],
                  ["Soort sleutel", check.live ? "live" : "test"],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-3 py-2">
                  <dt className="text-neutralx-500">{k}</dt>
                  <dd className="text-right font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {check && !magGebruiken && (
            <Notice tone="warn">
              {!check.live ? "Dit is een testsleutel: gebruik de live sleutel." : "Dit account kan nog geen betalingen ontvangen. Rond eerst de activatie af in het Stripe-dashboard."}
            </Notice>
          )}

          {magGebruiken && !zeker && (
            <button type="button" onClick={() => setZeker(true)} disabled={busy} className="btn-primary min-h-[44px]">
              Gebruik dit account
            </button>
          )}
          {magGebruiken && zeker && (
            <div className="space-y-2 rounded-xl border border-warn/40 bg-warn/5 p-3 text-sm">
              <p className="text-ink">
                Weet je het zeker? Nieuwe betalingen gaan dan naar {check?.naam ?? check?.accountId}. Werkers die hun bankrekening via Stripe koppelden,
                koppelen opnieuw. Je kunt altijd terug.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void gebruik()} disabled={busy} className="btn-primary min-h-[44px]">
                  {busy ? "Bezig…" : "Ja, gebruik dit account"}
                </button>
                <button type="button" onClick={() => setZeker(false)} disabled={busy} className="btn-ghost min-h-[44px]">
                  Annuleren
                </button>
              </div>
            </div>
          )}

          {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
          {gelukt && <Notice tone="ok">{gelukt}</Notice>}
        </div>
      </Panel>
    </div>
  );
}
