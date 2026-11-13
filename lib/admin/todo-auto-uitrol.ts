// Eigenaar-taken van de Auto-uitrol (14 nov 2026, lib/bouwer/auto-uitrol-regels.ts, meldingen()): een geweigerde versie, een
// migratie die op de eigenaar wacht, of main die meer dan 30 minuten voorloopt op live. Ze verdwijnen vanzelf zodra live bijkomt.
// Puur: alleen de lijst meldingen. Geen taak als de stand niet te lezen is.

import type { OwnerTodo } from "@/lib/admin/owner-todos";

export function autoUitrolTodos(meldingen: { id: string; titel: string; tekst: string }[] | undefined): OwnerTodo[] {
  if (!meldingen) return [];
  return meldingen.map((m) => ({
    id: m.id,
    group: "Beheer & veiligheid" as const,
    title: m.titel,
    why: m.tekst,
    how: ["Open Beheer → ZekerFlex AI → Live zetten, het blok Auto-uitrol.", "Daar staat de reden en wat de laatste ronde deed. Een nieuwe push wordt vanzelf weer geprobeerd; een migratie zet je zelf live."],
    auto: true,
    done: false,
  }));
}