"use client";

import { useCallback, useEffect, useState } from "react";
import type { BeoordelingStatus } from "@/lib/shop/beoordeling";

// Beheer → Webshop → Beoordelingen (lib/shop/beoordeling.ts): wat kopers over een product schreven. Niets staat op de site
// voordat je op "Plaatsen" drukt; wachtende bovenaan.

interface Rij {
  id: string;
  orderId: string;
  naam: string;
  sterren: number;
  tekst: string;
  status: BeoordelingStatus;
  createdAt: string;
  product: { id: string; name: string; slug: string };
}

const STATUS_LABEL: Record<BeoordelingStatus, string> = { wacht: "Wacht op jou", zichtbaar: "Op de site", afgewezen: "Afgewezen" };
const STATUS_KLEUR: Record<BeoordelingStatus, string> = { wacht: "var(--a-warn)", zichtbaar: "var(--a-ok)", afgewezen: "var(--a-mute)" };
const VOLGORDE: Record<BeoordelingStatus, number> = { wacht: 0, zichtbaar: 1, afgewezen: 2 };

const datum = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", year: "numeric" });

export function ShopBeoordelingen({ onAantalWacht }: { onAantalWacht?: (n: number) => void }) {
  const [rijen, setRijen] = useState<Rij[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);

  const laad = useCallback(async () => {
    const r = await fetch("/api/admin/shop/beoordelingen", { cache: "no-store" }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) {
      setRijen(d.beoordelingen as Rij[]);
      setFout(null);
    } else setFout(d?.error?.message ?? "De beoordelingen konden niet worden geladen.");
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);
  useEffect(() => {
    if (rijen) onAantalWacht?.(rijen.filter((r) => r.status === "wacht").length);
  }, [rijen, onAantalWacht]);

  async function zet(id: string, status: BeoordelingStatus) {
    setBezig(id);
    const r = await fetch(`/api/admin/shop/beoordelingen/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBezig(null);
    // de versie van de server overnemen, niet zelf één veld bijwerken
    if (r?.ok && d.beoordeling) setRijen((oud) => (oud ?? []).map((x) => (x.id === id ? (d.beoordeling as Rij) : x)));
    else setFout(d?.error?.message ?? "Opslaan lukte niet.");
  }

  async function wis(id: string) {
    if (!window.confirm("Deze beoordeling helemaal verwijderen?")) return;
    setBezig(id);
    const r = await fetch(`/api/admin/shop/beoordelingen/${id}`, { method: "DELETE" }).catch(() => null);
    setBezig(null);
    if (r?.ok) setRijen((oud) => (oud ?? []).filter((x) => x.id !== id));
    else setFout("Verwijderen lukte niet.");
  }

  const lijst = [...(rijen ?? [])].sort((a, b) => VOLGORDE[a.status] - VOLGORDE[b.status] || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--a-dim)" }}>
        Alleen wie een product kocht en de bestelling verzonden kreeg, kan het beoordelen (via de link in de verzendmail). Pas als jij op <strong>Plaatsen</strong> drukt, staat een beoordeling op de site.
      </p>
      {fout && (
        <p role="alert" className="a-panel px-4 py-3 text-sm" style={{ color: "var(--a-crit)" }}>
          {fout}
        </p>
      )}
      {rijen === null && !fout && <p className="text-sm" style={{ color: "var(--a-mute)" }}>Laden…</p>}
      {rijen !== null && lijst.length === 0 && (
        <div className="a-panel px-4 py-6 text-center text-sm" style={{ color: "var(--a-dim)" }}>
          Nog geen beoordelingen. Ze komen hier zodra een koper er een schrijft.
        </div>
      )}
      {lijst.map((r) => (
        <article key={r.id} className="a-panel space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <a href={`/shop/${r.product.slug}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: "var(--a-text)" }}>
                {r.product.name}
              </a>
              <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                {r.naam} · {datum(r.createdAt)} · bestelling {r.orderId}
              </p>
            </div>
            <span className="text-xs font-semibold" style={{ color: STATUS_KLEUR[r.status] }}>
              {STATUS_LABEL[r.status]}
            </span>
          </div>
          <p aria-label={`${r.sterren} van de 5 sterren`} className="text-[15px] tracking-wide" style={{ color: "var(--a-text)" }}>
            {"★".repeat(r.sterren)}
            <span style={{ color: "var(--a-border-strong)" }}>{"★".repeat(5 - r.sterren)}</span>
          </p>
          <p className="whitespace-pre-line text-sm" style={{ color: "var(--a-text)" }}>
            {r.tekst}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {r.status !== "zichtbaar" && (
              <button type="button" disabled={bezig === r.id} onClick={() => void zet(r.id, "zichtbaar")} className="a-button a-button-primary">
                Plaatsen
              </button>
            )}
            {r.status !== "afgewezen" && (
              <button type="button" disabled={bezig === r.id} onClick={() => void zet(r.id, "afgewezen")} className="a-button">
                {r.status === "zichtbaar" ? "Van de site halen" : "Afwijzen"}
              </button>
            )}
            <button type="button" disabled={bezig === r.id} onClick={() => void wis(r.id)} className="a-button">
              Verwijderen
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
