"use client";

import { useEffect, useState } from "react";
import { Empty, Panel, Pill } from "@/components/admin/kit";
import { nogToevoegen, type TesterAanvraag } from "@/lib/app/testers-kern";

/**
 * Beheer → Google Play: wie tester wil worden voor de Android-app (formulier op /app, 21 nov 2026). Kopieer de nieuwe adressen,
 * plak ze in de Play Console bij de testerslijst en markeer ze als toegevoegd.
 */
export function AppTesters() {
  const [lijst, setLijst] = useState<TesterAanvraag[] | null>(null);
  const [melding, setMelding] = useState("");

  useEffect(() => {
    void fetch("/api/admin/app-testers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { testers: [] }))
      .then((d: { testers: TesterAanvraag[] }) => setLijst(d.testers));
  }, []);

  const nieuw = lijst ? nogToevoegen(lijst) : "";

  async function kopieer() {
    try {
      await navigator.clipboard.writeText(nieuw);
      setMelding("Gekopieerd. Plak de adressen in de Play Console bij Testen → Gesloten test → Testers.");
    } catch {
      setMelding("Kopiëren lukte niet; selecteer de adressen hieronder met de hand.");
    }
  }
  async function allesToegevoegd() {
    const r = await fetch("/api/admin/app-testers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "alles-toegevoegd" }) });
    if (r.ok) setLijst(((await r.json()) as { testers: TesterAanvraag[] }).testers);
  }
  async function wis(email: string) {
    const r = await fetch(`/api/admin/app-testers?email=${encodeURIComponent(email)}`, { method: "DELETE" });
    if (r.ok) setLijst(((await r.json()) as { testers: TesterAanvraag[] }).testers);
  }

  return (
    <Panel
      title="Testers voor de Android-app"
      subtitle="Wie op zekerflex.com/app tester wil worden, staat hier. Kopieer de nieuwe adressen, plak ze in de Play Console bij de testerslijst en klik daarna op Gemarkeerd als toegevoegd."
      actions={
        nieuw ? (
          <span className="flex flex-wrap gap-2">
            <button type="button" className="a-btn a-btn-primary" onClick={() => void kopieer()}>
              Kopieer nieuwe adressen
            </button>
            <button type="button" className="a-btn a-btn-ghost" onClick={() => void allesToegevoegd()}>
              Gemarkeerd als toegevoegd
            </button>
          </span>
        ) : null
      }
    >
      {melding && (
        <p role="status" className="px-4 py-2 text-xs sm:px-5" style={{ color: "var(--a-mute)" }}>
          {melding}
        </p>
      )}
      {lijst === null ? (
        <p className="px-4 py-3 text-sm sm:px-5" style={{ color: "var(--a-mute)" }}>
          Laden…
        </p>
      ) : lijst.length === 0 ? (
        <Empty title="Nog geen aanvragen" body="Zodra iemand op /app tester wil worden, staat het adres hier." />
      ) : (
        <ul>
          {lijst.map((t) => (
            <li key={t.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
              <span className="min-w-0 truncate text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
                {t.email}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--a-mute)" }}>
                  {new Date(t.at).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" })}
                </span>
                <Pill tone={t.toegevoegd ? "ok" : "warn"}>{t.toegevoegd ? "Toegevoegd" : "Nieuw"}</Pill>
                <button type="button" className="a-btn a-btn-ghost text-xs" onClick={() => void wis(t.email)}>
                  Wissen
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
