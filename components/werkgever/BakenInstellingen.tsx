"use client";

import { useEffect, useState } from "react";

// Werkgever → Locaties → Locatiebaken: QR-code aan/uit (met nieuwe code),
// Bluetooth-baken en automatisch inchecken per vestiging (lib/checkin/baken.ts).

interface View {
  qr: boolean;
  qrVersie: number;
  bleNaam: string | null;
  automatisch: boolean;
  qrUrl: string | null;
}

export function BakenInstellingen({ branchId, canManage }: { branchId: string; canManage: boolean }) {
  const [v, setV] = useState<View | null>(null);
  const [ble, setBle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void fetch(`/api/werkgever/branches/${branchId}/baken`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: View | null) => {
        if (!d) return;
        setV(d);
        setBle(d.bleNaam ?? "");
      });
  }, [branchId]);

  async function save(patch: Record<string, unknown>, tekst = "Opgeslagen.") {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/werkgever/branches/${branchId}/baken`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, text: d?.error?.message ?? "Opslaan lukte niet." });
    setV(d as View);
    setMsg({ ok: true, text: tekst });
    if (patch.nieuweQr) window.location.reload();
  }

  if (!v) return null;

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between gap-3 rounded-xl border border-hair bg-paper-soft/60 px-4 py-3 text-sm">
        <span>
          <span className="font-medium text-ink">Automatisch in- en uitchecken aanbieden</span>
          <span className="mt-0.5 block text-xs text-neutralx-500">Krachten die het aanzetten, checken vanzelf in zodra ze binnen de geofence zijn en uit zodra ze vertrekken (zolang de klus-pagina open staat).</span>
        </span>
        <input type="checkbox" checked={v.automatisch} disabled={busy || !canManage} onChange={(e) => void save({ automatisch: e.target.checked })} />
      </label>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-hair bg-paper-soft/60 px-4 py-3 text-sm">
        <span>
          <span className="font-medium text-ink">QR-code op de werkplek</span>
          <span className="mt-0.5 block text-xs text-neutralx-500">Print de poster hieronder en hang hem bij de ingang. Scannen = inchecken met bewijs dat de kracht er echt was.</span>
        </span>
        <input type="checkbox" checked={v.qr} disabled={busy || !canManage} onChange={(e) => void save({ qr: e.target.checked })} />
      </label>

      {v.qr && canManage && (
        <button
          type="button"
          className="btn-ghost text-sm"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Nieuwe QR-code maken? De oude posters werken dan niet meer.")) void save({ nieuweQr: true }, "Nieuwe QR-code gemaakt; print de poster opnieuw.");
          }}
        >
          Nieuwe QR-code maken (oude ongeldig)
        </button>
      )}

      <form
        className="rounded-xl border border-hair bg-paper-soft/60 px-4 py-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ bleNaam: ble || null });
        }}
      >
        <label className="block">
          <span className="font-medium text-ink">Bluetooth-baken</span>
          <span className="mt-0.5 block text-xs text-neutralx-500">
            Een BLE-baken van een paar euro (jaren op één batterij). Geef het in de app van de fabrikant een naam en vul die hier in; krachten kiezen het dan in Chrome. Leeg = geen baken.
          </span>
          <span className="mt-2 flex gap-2">
            <input value={ble} onChange={(e) => setBle(e.target.value)} placeholder="ZF-BAKEN-1" disabled={!canManage} className="min-w-0 flex-1 rounded-lg border border-hairstrong px-3 py-2 text-sm" />
            <button type="submit" disabled={busy || !canManage} className="btn-primary text-sm">
              Opslaan
            </button>
          </span>
        </label>
      </form>

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-ok" : "text-crit"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
