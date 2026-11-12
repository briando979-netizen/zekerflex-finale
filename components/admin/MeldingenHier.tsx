"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { meldingenAanzetten } from "@/components/app/PushToggle";

// Admin → Systeem: staat Web Push op storing (geen werkend apparaat bij de beheerders), dan zet je
// hier meteen meldingen aan op het apparaat waarop je kijkt. Dezelfde aanmelding als in de apps
// (components/app/PushToggle.tsx); daarna houdt dat apparaat zich zelf aangemeld.

export function MeldingenHier() {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);

  async function aanzetten() {
    setBezig(true);
    setMelding(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
        throw new Error(iphone ? "Op een iPhone werkt dit alleen als ZekerFlex op je beginscherm staat (Deel → Zet op beginscherm)." : "Deze browser kan geen pushmeldingen ontvangen.");
      }
      const r = await fetch("/api/me/push", { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as { configured?: boolean; vapidPublicKey?: string | null };
      if (!r.ok || !d.configured || !d.vapidPublicKey) throw new Error("Pushmeldingen zijn op de server niet ingesteld.");
      const uitslag = await meldingenAanzetten(d.vapidPublicKey);
      if (uitslag === "geweigerd") throw new Error("Je browser blokkeert meldingen van ZekerFlex. Zet ze aan via het slotje links van het adres en probeer het opnieuw.");
      if (uitslag === "uit") throw new Error("Je hebt nog geen toestemming gegeven. Klik opnieuw en kies Toestaan.");
      setMelding({ tekst: "Meldingen staan aan op dit apparaat. Beheermeldingen komen nu hier binnen.", fout: false });
      router.refresh();
    } catch (e) {
      setMelding({ tekst: e instanceof Error && e.message !== "server" ? e.message : "Aanzetten lukte niet. Probeer het opnieuw.", fout: true });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="min-w-0 flex-1 basis-64 text-xs" style={{ color: "var(--a-mute)" }}>
        Geen enkel apparaat van een beheerder krijgt nu pushmeldingen. Zet ze hier aan op dit apparaat; daarna meldt het zich bij elk bezoek vanzelf opnieuw aan.
      </p>
      <button type="button" className="a-btn" disabled={bezig} onClick={() => void aanzetten()}>
        {bezig ? "Bezig…" : "Meldingen aanzetten op dit apparaat"}
      </button>
      {melding && (
        <p role={melding.fout ? "alert" : "status"} className="basis-full text-xs" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-mute)" }}>
          {melding.tekst}
        </p>
      )}
    </div>
  );
}
