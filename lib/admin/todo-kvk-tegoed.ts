// ---------------------------------------------------------------------------
// Eigenaar-taak (13 nov 2026): het tegoed bij KVKBase is op of bijna op. Gemeten: het gratis plan (10 vragen per minuut,
// 50 tokens per maand) was op, en elke KVK-controle van een werker of werkgever faalde, terwijl de app "rate limit" zei.
// Nu bewaren we het tegoed bij elk antwoord (lib/kvk/tegoed.ts); de controles wachten en een cron probeert ze later.
// Een groter plan of een andere bron is een geldkeuze: die maakt de eigenaar. Puur.
// ---------------------------------------------------------------------------

import type { OwnerTodo } from "@/lib/admin/owner-todos";
import { tegoedLaag, type KvkTegoed } from "@/lib/kvk/tegoed";

/**
 * De taak zodra het tegoed op of onder de 10 is, of zolang er werkers zijn met een KVK-nummer dat nog nooit is
 * gecontroleerd (`zonderControle`, lib/kvk/inhalen.ts): die krijgen van de matching nooit een voorstel. Afgevinkt als het
 * tegoed weer hoger is en niemand meer zonder controle zit. null = nooit gemeten en niemand zonder controle.
 */
export function kvkTegoedTodo(t: KvkTegoed | null, wachtend: number, zonderControle = 0): OwnerTodo | null {
  if (!t && zonderControle <= 0) return null;
  const laag = tegoedLaag(t);
  const stand = t?.op ? "op" : `bijna op (${t?.tokens ?? "?"} over)`;
  const plan = t?.perMinuut === 10 ? "het gratis plan (50 tokens per maand)" : t?.perMinuut ? `een plan met ${t.perMinuut} vragen per minuut` : "het huidige plan";
  const n = zonderControle;
  const werkers = n > 0 ? ` ${n} werker${n === 1 ? " heeft" : "s hebben"} een KVK-nummer dat nog nooit is gecontroleerd: zonder die controle krijgen zij nooit een voorstel (de matching neemt alleen zzp'ers met een geldige KVK of btw mee; uitzendkrachten wel). De herkansing (elke 30 minuten) pakt ze op zodra er tegoed is.` : "";
  return {
    id: "kvk-tegoed",
    group: "Bellen & koppelingen",
    title: laag
      ? `KVK-tegoed ${stand}: KVK-nummers worden nu niet gecontroleerd${n > 0 ? ` (${n} werker${n === 1 ? "" : "s"} zonder controle)` : ""}`
      : n > 0
        ? `${n} werker${n === 1 ? "" : "s"} met een ongecontroleerd KVK-nummer: zij krijgen nog geen voorstellen`
        : "KVK-tegoed: weer voldoende",
    why: `ZekerFlex controleert KVK-nummers van werkers en werkgevers bij KVKBase, op ${plan}. Is het tegoed op, dan wacht elke controle tot er weer tegoed is${wachtend > 0 ? ` (nu ${wachtend} wachtend)` : ""}: zzp'ers met alleen een KVK-nummer kunnen dan niet reageren, en nieuwe bedrijven worden niet vanzelf geverifieerd.${werkers}`,
    how: [
      "Kies een bron: de officiële KVK-API (€ 6,20 per maand; zoeken is gratis per vraag, en dat bevestigt nummer, naam en of het bedrijf actief is) of KVKBase Starter (€ 9 per maand, 1.000 tokens).",
      "Geef de keuze aan Claude: die zet de sleutel en de koppeling klaar. Het tegoed staat in Beheer → Alles gratis.",
      "Wachtende controles gaan vanzelf door zodra er weer tegoed is (elke 30 minuten een herkansing). Deze taak vinkt zichzelf af als het tegoed weer boven de 10 is.",
    ],
    auto: true,
    done: !laag && zonderControle <= 0,
  };
}
