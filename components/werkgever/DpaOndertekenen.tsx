"use client";

import { useState } from "react";

interface Props {
  initieel: { ondertekend: boolean; ondertekendOp?: string; naam?: string; versies?: { versie: string; ondertekendOp: string; naam: string }[] };
}

export function DpaOndertekenen({ initieel }: Props) {
  const [stand, setStand] = useState(initieel);
  const [modalOpen, setModalOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [akkoord, setAkkoord] = useState(false);

  async function onderteken() {
    if (!naam.trim() || !akkoord) return;
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/werkgever/dpa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naam: naam.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStand(data);
      setModalOpen(false);
      setNaam("");
      setAkkoord(false);
    } catch {
      setFout("Ondertekenen mislukt. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <>
      {/* statuskaart */}
      <div className="surface mb-6 flex items-center justify-between gap-4 p-4 sm:p-5">
        <div>
          <p className="text-sm font-semibold text-ink">
            {stand.ondertekend ? "Ondertekend" : "Nog niet ondertekend"}
          </p>
          {stand.ondertekend && stand.ondertekendOp && (
            <p className="mt-0.5 text-xs text-neutralx-500">
              {stand.naam && <>{stand.naam} · </>}
              {new Date(stand.ondertekendOp).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}
        </div>
        {stand.ondertekend ? (
          <span className="rounded-full bg-go/10 px-3 py-1 text-xs font-semibold text-go">Akkoord</span>
        ) : (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="btn-primary min-h-[40px] text-sm"
          >
            Ondertekenen
          </button>
        )}
      </div>

      {/* modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="surface w-full max-w-lg p-6">
            <h2 className="font-display text-lg font-bold text-ink">Verwerkersovereenkomst ondertekenen</h2>
            <p className="mt-2 text-sm text-neutralx-600">
              Door te ondertekenen ga je namens je organisatie akkoord met de verwerkersovereenkomst van ZekerFlex,
              zoals beschreven op{" "}
              <a href="/verwerkersovereenkomst" target="_blank" rel="noopener" className="text-brand-600 hover:underline">
                zekerflex.nl/verwerkersovereenkomst
              </a>
              .
            </p>

            <label className="mt-5 block">
              <span className="field-label">Jouw naam (voor in de handtekening)</span>
              <input
                type="text"
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="Voor- en achternaam"
                className="field-input mt-1"
                autoFocus
              />
            </label>

            <label className="mt-4 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={akkoord}
                onChange={(e) => setAkkoord(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-hair accent-brand-600"
              />
              <span className="text-neutralx-700">
                Ik heb de verwerkersovereenkomst gelezen en ga akkoord namens mijn organisatie.
              </span>
            </label>

            {fout && <p role="alert" className="mt-3 text-xs text-danger">{fout}</p>}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn-ghost flex-1 min-h-[40px]"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={() => { void onderteken(); }}
                disabled={bezig || !naam.trim() || !akkoord}
                className="btn-primary flex-1 min-h-[40px] disabled:opacity-50"
              >
                {bezig ? "Bezig…" : "Ondertekenen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
