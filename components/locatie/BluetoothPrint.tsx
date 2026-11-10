"use client";

import { useState } from "react";
import { BLUETOOTH_PRINT, inBrokken, labelNaarEscPos, type Rolbreedte } from "@/lib/locatie/escpos";
import type { LabelInhoud } from "@/lib/locatie/modules";

// ---------------------------------------------------------------------------
// Rechtstreeks naar een Bluetooth-bonprinter vanaf een telefoon of laptop
// (Web Bluetooth: Chrome en Edge op Android, Windows, Mac en Linux; niet op
// iPhone). We zoeken een printer met een bekende printdienst en sturen de
// ESC/POS-bytes in brokken van 100 bytes.
// ---------------------------------------------------------------------------

interface BluetoothLike {
  requestDevice(opts: { filters: { services: string[] }[]; optionalServices: string[] }): Promise<{
    name?: string;
    gatt?: { connect(): Promise<{ getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<{ writeValue(v: BufferSource): Promise<void>; writeValueWithoutResponse?(v: BufferSource): Promise<void> }> }>; disconnect(): void }> };
  }>;
}

export const bluetoothBeschikbaar = (): boolean => typeof navigator !== "undefined" && "bluetooth" in navigator;

export function BluetoothPrint({
  inhoud,
  maakBytes,
  onKlaar,
  className = "",
}: {
  /** een label of incheckbon (lib/locatie/modules.ts) */
  inhoud?: LabelInhoud;
  /** of eigen bytes voor deze rolbreedte, bv. een kassabon (lib/sites/kassa-escpos.ts) */
  maakBytes?: (rol: Rolbreedte) => Uint8Array;
  onKlaar?: (printer: string) => void;
  className?: string;
}) {
  const [rol, setRol] = useState<Rolbreedte>(58);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  if (!bluetoothBeschikbaar()) {
    return <p className={`text-xs text-neutralx-500 ${className}`}>Bluetooth-printen werkt in Chrome of Edge (Android, Windows, Mac, Linux), niet op een iPhone. Gebruik daar de afdrukpagina.</p>;
  }

  const print = async () => {
    setBezig(true);
    setMelding(null);
    try {
      const bt = (navigator as unknown as { bluetooth: BluetoothLike }).bluetooth;
      const device = await bt.requestDevice({ filters: BLUETOOTH_PRINT.diensten.map((s) => ({ services: [s] })), optionalServices: [...BLUETOOTH_PRINT.diensten] });
      const server = await device.gatt?.connect();
      if (!server) throw new Error("Geen verbinding met de printer.");
      let kenmerk: { writeValue(v: BufferSource): Promise<void>; writeValueWithoutResponse?(v: BufferSource): Promise<void> } | null = null;
      for (const dienst of BLUETOOTH_PRINT.diensten) {
        try {
          const svc = await server.getPrimaryService(dienst);
          for (const k of BLUETOOTH_PRINT.schrijfKenmerken) {
            try {
              kenmerk = await svc.getCharacteristic(k);
              break;
            } catch {
              /* volgende */
            }
          }
          if (kenmerk) break;
        } catch {
          /* volgende dienst */
        }
      }
      if (!kenmerk) throw new Error("Deze printer heeft geen bekend printkanaal.");
      const bytes = maakBytes ? maakBytes(rol) : inhoud ? labelNaarEscPos(inhoud, { rol, snijden: true }) : null;
      if (!bytes) throw new Error("Er is niets om te printen.");
      for (const brok of inBrokken(bytes)) {
        const view = new Uint8Array(brok) as Uint8Array<ArrayBuffer>;
        if (kenmerk.writeValueWithoutResponse) await kenmerk.writeValueWithoutResponse(view);
        else await kenmerk.writeValue(view);
        await new Promise((r) => setTimeout(r, 25));
      }
      server.disconnect();
      setMelding(`Verstuurd naar ${device.name ?? "de printer"}.`);
      onKlaar?.(device.name ?? "Bluetooth-printer");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setMelding(/cancel|User cancelled|chooser/i.test(m) ? "Geen printer gekozen." : `Printen via Bluetooth lukte niet: ${m}`);
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-neutralx-600">
          Rol
          <select value={rol} onChange={(e) => setRol(Number(e.target.value) as Rolbreedte)} className="rounded-lg border border-hairstrong px-2 py-1 text-xs">
            <option value={58}>58 mm</option>
            <option value={80}>80 mm</option>
          </select>
        </label>
        <button type="button" onClick={() => void print()} disabled={bezig} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {bezig ? "Verbinden…" : "📶 Print via Bluetooth"}
        </button>
      </div>
      {melding && (
        <p role="status" className="mt-2 text-xs text-neutralx-600">
          {melding}
        </p>
      )}
    </div>
  );
}
