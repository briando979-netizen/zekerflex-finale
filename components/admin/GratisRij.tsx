"use client";

import { useEffect, useState } from "react";
import { amsterdamClock } from "@/lib/time/amsterdam";

interface Model {
  id: string;
  model: string;
  volTot: string | null;
  reden: string;
  vandaag: number;
  gelukt: number;
  laatsteMs: number;
}

interface Dienst {
  id: string;
  naam: string;
  waar: string;
  aanmelden: string;
  limietTekst: string;
  opmerking: string;
  accountNodig: boolean;
  accountKlaar: boolean;
  klaar: boolean;
  sleutelBron: "beheer" | "server" | null;
  aan: boolean;
  modellen: Model[];
}

interface Antwoord {
  diensten: Dienst[];
  blijftEigen: string;
}

const seconden = (ms: number) => (ms / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 });

// De gratis rij (lib/ai/ketting.ts): bij "alles gratis" eerst andere gratis AI's, de beste eerst. Zit er één aan zijn
// limiet, dan gaat de vraag naar de volgende; kan niemand, dan ons eigen model. Hier zet je per dienst de sleutel.
export function GratisRij() {
  const [data, setData] = useState<Antwoord | null>(null);
  const [sleutels, setSleutels] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/ai-node/ketting")
      .then((r) => r.json())
      .then((d) => setData(d as Antwoord))
      .catch(() => setFout("De rij kon niet worden opgehaald."));
  }, []);

  async function bewaar(dienst: string, wijziging: { sleutel?: string; account?: string; aan?: boolean }, melding: string) {
    setBusy(true);
    setMsg(null);
    setFout(null);
    try {
      const r = await fetch("/api/admin/ai-node/ketting", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dienst, ...wijziging }),
      });
      const d = (await r.json()) as Antwoord & { error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? "Opslaan mislukt");
      setData({ diensten: d.diensten, blijftEigen: d.blijftEigen });
      if (wijziging.sleutel !== undefined) setSleutels((s) => ({ ...s, [dienst]: "" }));
      if (wijziging.account !== undefined) setAccounts((s) => ({ ...s, [dienst]: "" }));
      setMsg(melding);
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <p className="text-xs" style={{ color: fout ? "var(--a-bad, #dc2626)" : "var(--a-mute)" }} role={fout ? "alert" : undefined}>
        {fout ?? "Laden…"}
      </p>
    );
  }

  const klaar = data.diensten.filter((d) => d.klaar && d.aan).length;
  const veldStijl = { background: "var(--a-bg, #0b0b0c)", border: "1px solid var(--a-border)", color: "var(--a-text)" };

  return (
    <div>
      <p className="text-xs leading-relaxed" style={{ color: "var(--a-mute)" }}>
        Staat &ldquo;alles gratis&rdquo; aan, dan gaat een vraag eerst naar het bovenste gratis model hieronder dat een
        sleutel heeft. Zit dat aan zijn gratis limiet, dan gaat dezelfde vraag meteen naar het volgende. Kan niemand,
        dan antwoordt ons eigen model, zoals nu.{" "}
        {klaar === 0
          ? "Er staat nog geen sleutel klaar, dus nu gaat alles naar ons eigen model."
          : `${klaar} van de ${data.diensten.length} diensten ${klaar === 1 ? "staat" : "staan"} klaar.`}
      </p>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--a-mute)" }}>
        <strong>Blijft altijd op onze eigen server:</strong> {data.blijftEigen}. Die gegevens sturen we niet naar een
        gratis dienst.
      </p>

      <ol className="mt-3 space-y-3">
        {data.diensten.map((d) => {
          const sleutelVeld = `rij-sleutel-${d.id}`;
          const accountVeld = `rij-account-${d.id}`;
          return (
            <li key={d.id} className="rounded-xl p-3" style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                  {d.naam} <span className="font-normal" style={{ color: "var(--a-mute)" }}>· {d.waar}</span>
                </p>
                <span className="text-xs font-semibold" style={{ color: d.klaar && d.aan ? "var(--a-ok, #16a34a)" : "var(--a-mute)" }}>
                  {!d.klaar ? (d.sleutelBron && d.accountNodig && !d.accountKlaar ? "Accountnummer ontbreekt" : "Nog geen sleutel") : d.aan ? "Klaar" : "Uitgezet"}
                </span>
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
                Gratis: {d.limietTekst}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
                {d.opmerking}
              </p>

              <ul className="mt-2 space-y-1">
                {d.modellen.map((m) => (
                  <li key={m.id} className="flex flex-wrap justify-between gap-x-3 text-xs" style={{ color: "var(--a-mute)" }}>
                    <span style={{ color: "var(--a-text)" }}>{m.model}</span>
                    <span style={m.volTot ? { color: "var(--a-warn-ink, #b45309)" } : undefined}>
                      {m.volTot
                        ? `vol tot ${amsterdamClock(m.volTot)} (${m.reden})`
                        : d.klaar
                          ? `vandaag ${m.vandaag} ${m.vandaag === 1 ? "vraag" : "vragen"}, ${m.gelukt} gelukt${m.laatsteMs > 0 ? ` · laatste in ${seconden(m.laatsteMs)} s` : ""}`
                          : "wacht op de sleutel"}
                    </span>
                  </li>
                ))}
              </ul>

              {d.sleutelBron === "server" && (
                <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>
                  De sleutel staat op de server (dezelfde als voor de AI-foto&apos;s).
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label htmlFor={sleutelVeld} className="block min-w-[12rem] flex-1 text-xs" style={{ color: "var(--a-mute)" }}>
                  {d.sleutelBron === "beheer" ? "Nieuwe sleutel (de oude blijft geheim)" : "Sleutel plakken"}
                  <input
                    id={sleutelVeld}
                    type="password"
                    autoComplete="off"
                    value={sleutels[d.id] ?? ""}
                    onChange={(e) => setSleutels((s) => ({ ...s, [d.id]: e.target.value }))}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                    style={veldStijl}
                  />
                </label>
                {d.accountNodig && (
                  <label htmlFor={accountVeld} className="block min-w-[12rem] flex-1 text-xs" style={{ color: "var(--a-mute)" }}>
                    {d.accountKlaar ? "Ander accountnummer (Account ID)" : "Accountnummer (Account ID)"}
                    <input
                      id={accountVeld}
                      autoComplete="off"
                      value={accounts[d.id] ?? ""}
                      onChange={(e) => setAccounts((s) => ({ ...s, [d.id]: e.target.value }))}
                      className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                      style={veldStijl}
                    />
                  </label>
                )}
                <button
                  type="button"
                  disabled={busy || (!(sleutels[d.id] ?? "").trim() && !(accounts[d.id] ?? "").trim())}
                  onClick={() =>
                    void bewaar(
                      d.id,
                      {
                        ...((sleutels[d.id] ?? "").trim() ? { sleutel: sleutels[d.id] ?? "" } : {}),
                        ...((accounts[d.id] ?? "").trim() ? { account: accounts[d.id] ?? "" } : {}),
                      },
                      `${d.naam} bewaard.`,
                    )
                  }
                  className="a-btn a-btn-primary disabled:opacity-50"
                >
                  Bewaar
                </button>
                {d.sleutelBron === "beheer" && (
                  <button type="button" disabled={busy} onClick={() => void bewaar(d.id, { sleutel: "" }, `Sleutel van ${d.naam} gewist.`)} className="a-btn a-btn-ghost disabled:opacity-50">
                    Wis sleutel
                  </button>
                )}
                {d.klaar && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={d.aan}
                    onClick={() => void bewaar(d.id, { aan: !d.aan }, d.aan ? `${d.naam} uitgezet.` : `${d.naam} weer aangezet.`)}
                    className="a-btn a-btn-ghost disabled:opacity-50"
                  >
                    {d.aan ? "Zet uit" : "Zet aan"}
                  </button>
                )}
                <a href={d.aanmelden} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: "var(--a-mute)" }}>
                  Gratis sleutel maken
                </a>
              </div>
            </li>
          );
        })}
      </ol>

      {msg && (
        <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>
          {msg}
        </p>
      )}
      {fout && (
        <p role="alert" className="mt-2 text-xs" style={{ color: "var(--a-bad, #dc2626)" }}>
          {fout}
        </p>
      )}
    </div>
  );
}
