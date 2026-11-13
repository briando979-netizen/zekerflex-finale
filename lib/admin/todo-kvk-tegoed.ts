// ---------------------------------------------------------------------------
// Eigenaar-taak (13 nov 2026): het tegoed bij KVKBase is op of bijna op. Gemeten: het gratis plan (10 vragen per minuut,
// 50 tokens per maand) was op, en elke KVK-controle van een werker of werkgever faalde, terwijl de app "rate limit" zei.
// Nu bewaren we het tegoed bij elk antwoord (lib/kvk/tegoed.ts); de controles wachten en een cron probeert ze later.
// Een groter plan of een andere bron is een geldkeuze: die maakt de eigenaar. Puur.
// ---------------------------------------------------------------------------

import type { OwnerTodo } from "@/lib/admin/owner-todos";
import { tegoedLaag, type KvkTegoed } from "@/lib/kvk/tegoed";

/** De taak zodra het tegoed op of onder de 10 is; afgevinkt als het weer hoger is. null = nooit gemeten. */
export function kvkTegoedTodo(t: KvkTegoed | null, wachtend: number): OwnerTodo | null {
  if (!t) return null;
  const laag = tegoedLaag(t);
  const stand = t.op ? "op" : `bijna op (${t.tokens ?? "?"} over)`;
  const plan = t.perMinuut === 10 ? "het gratis plan (50 tokens per maand)" : t.perMinuut ? `een plan met ${t.perMinuut} vragen per minuut` : "het huidige plan";
  return {
    id: "kvk-tegoed",
    group: "Bellen & koppelingen",
    title: laag ? `KVK-tegoed ${stand}: KVK-nummers worden nu niet gecontroleerd` : "KVK-tegoed: weer voldoende",
    why: `ZekerFlex controleert KVK-nummers van werkers en werkgevers bij KVKBase, op ${plan}. Is het tegoed op, dan wacht elke controle tot er weer tegoed is${wachtend > 0 ? ` (nu ${wachtend} wachtend)` : ""}: zzp'ers met alleen een KVK-nummer kunnen dan niet reageren, en nieuwe bedrijven worden niet vanzelf geverifieerd.`,
    how: [
      "Kies een bron: de officiële KVK-API (€ 6,20 per maand; zoeken is gratis per vraag, en dat bevestigt nummer, naam en of het bedrijf actief is) of KVKBase Starter (€ 9 per maand, 1.000 tokens).",
      "Geef de keuze aan Claude: die zet de sleutel en de koppeling klaar. Het tegoed staat in Beheer → Alles gratis.",
      "Wachtende controles gaan vanzelf door zodra er weer tegoed is (elke 30 minuten een herkansing). Deze taak vinkt zichzelf af als het tegoed weer boven de 10 is.",
    ],
    auto: true,
    done: !laag,
  };
}
