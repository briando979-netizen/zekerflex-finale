"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Werkgever → Facturen: e-facturatie (UBL / Peppol). Instellingen per bedrijf
// (Peppol-adres, mailadres van het boekhoudpakket, automatisch versturen) en
// de stand van de laatste facturen (lib/efactuur).
// ---------------------------------------------------------------------------

interface Stand {
  status: "klaar" | "verstuurd" | "mislukt" | "ongeldig";
  via: "peppol" | "mail" | null;
  ontvanger: string | null;
  at: string;
  fouten: string[];
}

interface View {
  instellingen: { peppolId?: string; ontvangstEmail?: string; automatisch?: boolean };
  afgeleidPeppolId: string | null;
  peppolNetwerk: boolean;
  standen: Record<string, Stand>;
}

export const STAND_LABEL: Record<Stand["status"], { label: string; cls: string }> = {
  verstuurd: { label: "Verstuurd", cls: "bg-ok/10 text-ok" },
  klaar: { label: "Klaar om te downloaden", cls: "bg-plan-soft text-plan-ink" },
  mislukt: { label: "Mislukt", cls: "bg-crit/10 text-crit" },
  ongeldig: { label: "Gegevens onvolledig", cls: "bg-warn/10 text-warn" },
};

export function EfactuurSettings() {
  const [v, setV] = useState<View | null>(null);
  const [peppolId, setPeppolId] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void fetch("/api/werkgever/efactuur", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: View | null) => {
        if (!d) return;
        setV(d);
        setPeppolId(d.instellingen.peppolId ?? "");
        setEmail(d.instellingen.ontvangstEmail ?? "");
      });
  }, []);

  async function save(patch: { peppolId?: string; ontvangstEmail?: string; automatisch?: boolean }) {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/werkgever/efactuur", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, text: d?.error?.message ?? "Opslaan lukte niet." });
    setV(d as View);
    setMsg({ ok: true, text: "Opgeslagen." });
  }

  if (!v) return null;
  const verstuurd = Object.values(v.standen).filter((s) => s.status === "verstuurd").length;

  return (
    <div className="space-y-4 p-5">
      <p className="text-sm leading-relaxed text-neutralx-600">
        Elke factuur van ZekerFlex is ook een <strong>e-factuur</strong>: een UBL-bestand volgens de Europese norm (Peppol BIS 3 / NLCIUS) dat je boekhoudpakket direct inleest, zonder overtypen. Download hem per factuur in de lijst hieronder, of laat hem automatisch naar je pakket sturen.
      </p>

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ peppolId, ontvangstEmail: email });
        }}
      >
        <label className="block text-sm">
          <span className="font-medium text-ink">Peppol-adres van je bedrijf</span>
          <input
            value={peppolId}
            onChange={(e) => setPeppolId(e.target.value)}
            placeholder={v.afgeleidPeppolId ?? "0106:12345678"}
            className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm"
            aria-describedby="peppol-uitleg"
          />
          <span id="peppol-uitleg" className="mt-1 block text-xs text-neutralx-500">
            {v.afgeleidPeppolId ? `Leeg = je KVK- of btw-nummer (${v.afgeleidPeppolId}).` : "Meestal 0106: gevolgd door je KVK-nummer."}
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Mailadres van je boekhoudpakket</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="inkoop@jouwpakket.nl"
            className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm"
            aria-describedby="email-uitleg"
          />
          <span id="email-uitleg" className="mt-1 block text-xs text-neutralx-500">
            Het adres waarop je pakket UBL-bijlagen inleest. Leeg = je factuuradres.
          </span>
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={busy} className="btn-primary text-sm">
            Opslaan
          </button>
          {msg && (
            <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-ok" : "text-crit"}`}>
              {msg.text}
            </p>
          )}
        </div>
      </form>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-hair bg-paper-soft/60 px-4 py-3 text-sm">
        <span>
          <span className="font-medium text-ink">Nieuwe facturen automatisch als e-factuur versturen</span>
          <span className="mt-0.5 block text-xs text-neutralx-500">
            {v.peppolNetwerk ? "Via het Peppol-netwerk als je bedrijf daarop bereikbaar is, anders per mail als UBL-bijlage." : "Per mail als UBL-bijlage naar je boekhoudpakket."}
          </span>
        </span>
        <input type="checkbox" checked={Boolean(v.instellingen.automatisch)} disabled={busy} onChange={(e) => void save({ automatisch: e.target.checked })} />
      </label>

      <p className="text-xs text-neutralx-500">
        {verstuurd > 0 ? `${verstuurd} ${verstuurd === 1 ? "factuur is" : "facturen zijn"} als e-factuur verstuurd.` : "Nog geen e-facturen verstuurd."}{" "}
        In de lijst hieronder staat per factuur een knop <strong>UBL</strong> om het bestand te downloaden.
      </p>
    </div>
  );
}
