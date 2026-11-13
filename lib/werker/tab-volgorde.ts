// ---------------------------------------------------------------------------
// De volgorde van de balk onderaan de werker-app (13 nov 2026, eigenaar: "alles moet ik kunnen verslepen"). In de
// Site-ontwerper (tabblad Menu, "Balk van de werker-app") versleept de beheerder de knoppen; het geldt voor alle werkers.
// Alleen de volgorde: er verdwijnt niets. Wélke knoppen een werker ziet (geen Bank in de Android-app, tijdens de start
// alleen Ontdekken en Account) bepaalt nog steeds components/app/FreelancerShell.tsx.
// Puur bestand (ook de shell in de browser gebruikt het); de opslag staat in lib/werker/tab-volgorde-store.ts.
// Zonder eigen volgorde blijft de balk exact zoals hij was.
// ---------------------------------------------------------------------------

/** De knoppen van de balk, van links naar rechts in de oorspronkelijke volgorde (de sleutels van TABS in FreelancerShell). */
export const TAB_SLEUTELS = ["discover", "myJobs", "hours", "bank", "chat", "account"] as const;
export type TabSleutel = (typeof TAB_SLEUTELS)[number];

/** De naam zoals de werker hem in het Nederlands ziet, met wanneer de knop er staat als dat niet altijd is. */
export const TAB_NAAM: Record<TabSleutel, { naam: string; wanneer?: string }> = {
  discover: { naam: "Ontdekken" },
  myJobs: { naam: "Mijn klussen" },
  hours: { naam: "Uren" },
  bank: { naam: "Bank", wanneer: "Staat nu uit en is dus niet zichtbaar." },
  chat: { naam: "Chat" },
  account: { naam: "Account" },
};

export const standaardTabVolgorde = (): TabSleutel[] => [...TAB_SLEUTELS];

/** Maakt van ongecontroleerde invoer een nette volgorde: onbekende en dubbele knoppen vallen weg, wat ontbreekt komt achteraan. */
export function normalizeTabVolgorde(raw: unknown): TabSleutel[] {
  const uit: TabSleutel[] = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    const s = TAB_SLEUTELS.find((b) => b === v);
    if (s && !uit.includes(s)) uit.push(s);
  }
  for (const s of TAB_SLEUTELS) if (!uit.includes(s)) uit.push(s);
  return uit;
}

export const isStandaardTabVolgorde = (v: readonly string[]): boolean => normalizeTabVolgorde(v).every((s, i) => s === TAB_SLEUTELS[i]);

/** Zet de knoppen in de gekozen volgorde. null = dezelfde lijst ongewijzigd terug; een knop die de volgorde niet kent, blijft achteraan staan. */
export function sorteerTabs<T extends { key: string }>(tabs: readonly T[], volgorde: readonly string[] | null | undefined): readonly T[] {
  if (!volgorde) return tabs;
  const lijst: readonly string[] = normalizeTabVolgorde(volgorde);
  const rang = (t: T, i: number) => {
    const r = lijst.indexOf(t.key);
    return r < 0 ? lijst.length + i : r;
  };
  return tabs.map((t, i) => ({ t, r: rang(t, i) })).sort((a, b) => a.r - b.r).map((x) => x.t);
}
