import type { BordToon } from "@/lib/horeca/bord";

// De kleur van een tegel en een speld op het bestellingenbord en de kaart: één kleur = één betekenis
// (amber wacht op jou, blauw gepland, groen onderweg, rood te laat, grijs afgerond). Alleen klassen met een
// regel voor de donkere modus in app/globals.css.

export const TOON_STIJL: Record<BordToon, string> = {
  wacht: "bg-amber-50 text-amber-900 ring-2 ring-amber-400",
  gepland: "bg-plan-soft text-plan-ink ring-1 ring-hair",
  onderweg: "bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500",
  laat: "bg-red-50 text-ink ring-2 ring-red-500",
  af: "bg-neutralx-50 text-neutralx-600 ring-1 ring-hair",
};

export const TOON_VOLGORDE: BordToon[] = ["wacht", "gepland", "onderweg", "laat"];
