"use client";

import { useEffect, useState } from "react";
import { Empty, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";

// Admin → Google Play: het ene serviceaccount waarmee ZekerFlex de apps van
// rijscholen in hún Google Play-account beheert, de Android-bouwer, en een
// overzicht van alle rijschool-apps. De sleutel gaat erin, nooit eruit.

interface Stand {
  serviceAccount: { email: string; projectId: string | null; ingesteldOp: string; door: string } | null;
  bouwer: boolean;
  apps: {
    pakketnaam: string;
    appNaam: string;
    versie: number;
    gekoppeldOp: string | null;
    liveSinds: string | null;
    taakFase: string;
    playVingerafdruk: string | null;
    updatedAt: string;
    rijschool: { naam: string; slug: string };
  }[];
}

const datum = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

const STAPPEN = [
  "Ga naar console.cloud.google.com en kies het project van ZekerFlex (of maak er een).",
  "APIs en services → Bibliotheek → zoek 'Google Play Android Developer API' → Inschakelen.",
  "IAM en beheer → Serviceaccounts → Serviceaccount maken, bijvoorbeeld 'zekerflex-play'. Rollen zijn niet nodig.",
  "Open het account → tabblad Sleutels → Sleutel toevoegen → Nieuwe sleutel → JSON. Er wordt een bestand gedownload.",
  "Open dat bestand met Kladblok, kopieer alles en plak het hieronder. Bewaar het bestand daarna veilig of verwijder het.",
];

export function GooglePlayBeheer() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [sleutel, setSleutel] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tone: "ok" | "crit"; tekst: string } | null>(null);

  useEffect(() => {
    void fetch("/api/admin/google-play")
      .then((r) => r.json())
      .then((d: Stand) => setStand(d))
      .catch(() => setMelding({ tone: "crit", tekst: "Laden mislukt." }));
  }, []);

  async function stuur(methode: "PUT" | "DELETE") {
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/admin/google-play", {
        method: methode,
        headers: { "content-type": "application/json" },
        ...(methode === "PUT" ? { body: JSON.stringify({ sleutel }) } : {}),
      });
      const d = (await r.json()) as Stand & { error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? "Dat lukte niet.");
      setStand(d);
      setSleutel("");
      setMelding({ tone: "ok", tekst: methode === "PUT" ? "Sleutel gecontroleerd bij Google en opgeslagen." : "Koppeling weggehaald." });
    } catch (e) {
      setMelding({ tone: "crit", tekst: (e as Error).message });
    } finally {
      setBezig(false);
    }
  }

  const sa = stand?.serviceAccount ?? null;
  return (
    <div className="space-y-5">
      <PageHead
        title="Google Play"
        subtitle="Rijscholen zetten hun app in hun eigen Google Play-account. ZekerFlex bouwt de app en beheert hem daarna met één serviceaccount."
        meta={sa ? <Pill tone="ok">Gekoppeld</Pill> : <Pill tone="warn">Nog niet gekoppeld</Pill>}
      />
      {melding && <Notice tone={melding.tone}>{melding.tekst}</Notice>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Serviceaccount" subtitle="Rijscholen nodigen dit e-mailadres uit in hun Play Console.">
          {stand === null ? (
            <p className="text-sm" style={{ color: "var(--a-mute)" }}>
              Laden…
            </p>
          ) : sa ? (
            <div className="space-y-2 text-sm" style={{ color: "var(--a-text)" }}>
              <p className="break-all font-mono text-[0.8125rem]">{sa.email}</p>
              <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                Ingesteld op {datum(sa.ingesteldOp)} door {sa.door}
                {sa.projectId ? ` · project ${sa.projectId}` : ""}
              </p>
              <button type="button" className="a-btn a-btn-ghost" disabled={bezig} onClick={() => void stuur("DELETE")}>
                Koppeling weghalen
              </button>
            </div>
          ) : (
            <ol className="list-decimal space-y-1.5 pl-5 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
              {STAPPEN.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          <label className="mt-4 block text-xs font-medium" style={{ color: "var(--a-mute)" }}>
            {sa ? "Nieuwe sleutel (vervangt de huidige)" : "Sleutelbestand (JSON)"}
            <textarea
              value={sleutel}
              onChange={(e) => setSleutel(e.target.value)}
              rows={5}
              spellCheck={false}
              autoComplete="off"
              placeholder='{ "type": "service_account", … }'
              className="mt-1 w-full rounded-lg px-3 py-2 font-mono text-xs"
              style={{ background: "var(--a-bg, #0b0b0c)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}
            />
          </label>
          <button type="button" className="a-btn a-btn-primary mt-2 disabled:opacity-50" disabled={bezig || sleutel.trim().length < 50} onClick={() => void stuur("PUT")}>
            {bezig ? "Controleren bij Google…" : "Controleren en opslaan"}
          </button>
        </Panel>

        <Panel title="Android-bouwer" subtitle="De container op de server die de apps bouwt.">
          {stand === null ? null : stand.bouwer ? (
            <Notice tone="ok">Staat aan. Rijscholen kunnen hun app laten bouwen.</Notice>
          ) : (
            <div className="space-y-2 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
              <Notice tone="warn">Staat nog niet aan.</Notice>
              <p>Eenmalig op de server, vanuit de projectmap (duurt de eerste keer 10 tot 20 minuten):</p>
              <code className="block rounded-lg px-3 py-2 font-mono text-xs" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
                sudo bash deploy/android-bouwer/installeer.sh --app
              </code>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Apps van rijscholen" subtitle="Bijgewerkt bij elke actie in het beheer van de rijschool." flush>
        {!stand || stand.apps.length === 0 ? (
          <Empty title="Nog geen apps" body="Een rijschool maakt haar app in Rijschool → App." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
              <thead style={{ color: "var(--a-mute)" }}>
                <tr>
                  <th className="px-4 py-2 font-medium">Rijschool</th>
                  <th className="px-4 py-2 font-medium">Pakketnaam</th>
                  <th className="px-4 py-2 font-medium">Versie</th>
                  <th className="px-4 py-2 font-medium">Stand</th>
                </tr>
              </thead>
              <tbody>
                {stand.apps.map((a) => (
                  <tr key={a.pakketnaam} className="border-t" style={{ borderColor: "var(--a-border)" }}>
                    <td className="px-4 py-2">
                      <a href={`/rijschool/${a.rijschool.slug}`} className="underline-offset-2 hover:underline">
                        {a.rijschool.naam}
                      </a>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{a.pakketnaam}</td>
                    <td className="px-4 py-2">{a.versie ? `1.0.${a.versie}` : "—"}</td>
                    <td className="px-4 py-2">
                      {a.liveSinds ? (
                        <Pill tone="ok">Live sinds {datum(a.liveSinds)}</Pill>
                      ) : a.taakFase === "fout" ? (
                        <Pill tone="crit">Fout bij laatste actie</Pill>
                      ) : a.gekoppeldOp ? (
                        <Pill tone="plan">Gekoppeld, in test</Pill>
                      ) : a.versie ? (
                        <Pill tone="warn">Gebouwd, wacht op eerste upload</Pill>
                      ) : (
                        <Pill tone="neutral">Gegevens ingevuld</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
