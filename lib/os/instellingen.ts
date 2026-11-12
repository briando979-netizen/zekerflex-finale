import { alleApps, STANDAARD_VASTGEZET, type OsRol } from "@/lib/os/apps";

// ---------------------------------------------------------------------------
// De voorkeuren van één gebruiker in ZekerFlex OS: welke apps op het
// bureaublad staan en welke achtergrond. Puur en browser-veilig, zodat het
// bureaublad en de server dezelfde controle gebruiken. Opslag: lib/os/store.ts.
// ---------------------------------------------------------------------------

/** Achtergronden zijn eigen kleurverlopen: geen externe afbeeldingen, dus niets laadt van buiten. */
export const OS_ACHTERGRONDEN = {
  nacht: { naam: "Nacht", css: "linear-gradient(160deg,#0C0E12 0%,#13201B 55%,#0C0E12 100%)", donker: true },
  mint: { naam: "Mint", css: "linear-gradient(160deg,#0E5C4A 0%,#0C0E12 70%)", donker: true },
  zonsopgang: { naam: "Zonsopgang", css: "linear-gradient(160deg,#1B1430 0%,#5B2B4A 55%,#8A4B05 100%)", donker: true },
  leisteen: { naam: "Leisteen", css: "linear-gradient(160deg,#1F2933 0%,#0C0E12 100%)", donker: true },
  licht: { naam: "Licht", css: "linear-gradient(160deg,#EEF2F0 0%,#D7E3DD 100%)", donker: false },
} as const;

export type OsAchtergrond = keyof typeof OS_ACHTERGRONDEN;
export const isAchtergrond = (v: unknown): v is OsAchtergrond => typeof v === "string" && Object.hasOwn(OS_ACHTERGRONDEN, v);

export interface OsInstellingen {
  /** app-id's op het bureaublad, in volgorde */
  vastgezet: string[];
  achtergrond: OsAchtergrond;
  /** vensters bij het afsluiten onthouden en weer openen */
  herstelVensters: boolean;
}

export const MAX_VASTGEZET = 24;

export function standaardInstellingen(rol: OsRol): OsInstellingen {
  return { vastgezet: [...(STANDAARD_VASTGEZET[rol] ?? [])], achtergrond: "nacht", herstelVensters: true };
}

/**
 * Onbekende of dubbele app-id's vallen weg, en een app die deze rol niet mag
 * zien ook: zo kan een oude voorkeur nooit een scherm tonen dat niet van jou is.
 */
export function normalizeInstellingen(raw: unknown, rol: OsRol): OsInstellingen {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const mag = new Set(alleApps().filter((a) => a.rollen.includes(rol)).map((a) => a.id));
  const vastgezet: string[] = [];
  for (const id of Array.isArray(r.vastgezet) ? r.vastgezet : []) {
    if (typeof id === "string" && mag.has(id) && !vastgezet.includes(id) && vastgezet.length < MAX_VASTGEZET) vastgezet.push(id);
  }
  const standaard = standaardInstellingen(rol);
  return {
    // nooit een leeg bureaublad bij een kapotte of lege voorkeur
    vastgezet: vastgezet.length ? vastgezet : standaard.vastgezet,
    achtergrond: isAchtergrond(r.achtergrond) ? r.achtergrond : standaard.achtergrond,
    herstelVensters: r.herstelVensters === undefined ? standaard.herstelVensters : r.herstelVensters === true,
  };
}
