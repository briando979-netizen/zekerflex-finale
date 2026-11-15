"use client";

import { useChatTeksten } from "./ChatTekstenContext";
import { useAfstand } from "./AfstandContext";
import { KaartVoorbeeld } from "./KaartVoorbeeld";
import { KaartTweePlekken } from "./KaartTweePlekken";
import { afstandMeter, afstandTekst } from "@/lib/kaart/afstand";
import { inNederland } from "@/lib/kaart/voorbeeld";
import { isLiveActief, type Plek } from "@/lib/messaging/live-locatie";
import { vulIn } from "@/lib/i18n/vul-in";

// Hoe ver een gedeelde locatie van jou is, zoals in WhatsApp (lib/kaart/afstand.ts, components/chat/AfstandContext.tsx).
// Het kaartje toont beide plekken als je eigen plek bekend is; de regel eronder zegt de afstand in tekst, of biedt aan om
// je plek op te vragen. De regel staat buiten de link naar de kaart (geen knop in een link).

/** Het kaartje boven een locatie: met jouw plek erbij als die bekend is en ze samen passen, anders alleen de speld. */
export function LocatieKaartje({ plek, mine, actief = false }: { plek: Plek; mine: boolean; actief?: boolean }) {
  const { plek: ik } = useAfstand();
  const t = useChatTeksten().bubble;
  if (!inNederland(plek.lat, plek.lng)) return null;
  if (!mine && ik && inNederland(ik.punt.lat, ik.punt.lng)) {
    return <KaartTweePlekken ander={plek} ik={ik.punt} actief={actief} jij={t.afstandJij} />;
  }
  return <KaartVoorbeeld lat={plek.lat} lng={plek.lng} actief={actief} />;
}

/** Onder een locatie van een ander: "1,2 km van jou", of de vraag om je plek. */
export function AfstandRegel({ plek }: { plek: Plek }) {
  const chat = useChatTeksten();
  const t = chat.bubble;
  const { plek: ik, stand, vraag } = useAfstand();
  if (ik) {
    const afstand = afstandTekst(afstandMeter(plek, ik.punt), chat.shared.locale);
    // allebei live: dan kennen jullie elkaars plek en zien jullie dezelfde afstand
    const samen = ik.bron === "live" && isLiveActief(plek.live);
    return (
      <p className="mt-1.5 flex items-center gap-1.5 px-0.5 text-[12px] font-semibold text-ink">
        <span aria-hidden>📏</span>
        {vulIn(samen ? t.afstandSamen : t.afstandVanJou, { afstand })}
      </p>
    );
  }
  if (stand === "uit") return <p className="mt-1.5 px-0.5 text-[11px] text-neutralx-500">{t.afstandUit}</p>;
  return (
    <button
      type="button"
      onClick={vraag}
      disabled={stand === "zoeken"}
      title={t.afstandPrive}
      className="mt-1.5 flex items-center gap-1.5 px-0.5 text-[12px] font-semibold text-[#027EB5] hover:underline disabled:opacity-60 [.app-scope[data-theme=dark]_&]:text-[#53BDEB]"
    >
      <span aria-hidden>📏</span>
      {stand === "zoeken" ? t.afstandZoeken : t.afstandVraag}
    </button>
  );
}
