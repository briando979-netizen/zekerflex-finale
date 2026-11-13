// ---------------------------------------------------------------------------
// Auto-uitrol (14 nov 2026): na elke push naar main controleert en rolt de EIGEN server vanzelf uit, zonder mens en zonder
// GitHub Actions (die staan uit: kosten, zie .github/workflows.disabled/README.md). Dit bestand is de beslislogica, puur
// (geen netwerk, kv of tijd van buiten), zodat elke regel te testen is. De uitvoering staat in lib/bouwer/auto-uitrol.ts;
// het bouwen zelf blijft de live-zetter (deploy/bouwer/zf-live.py) met zijn eigen controle, migratie-eis en terugzetten.
//
// De regels, in volgorde (de eerste die past, beslist):
//  0b gestopt door de nacontrole  -> niets (harde stop: pas weer na een mens die de schakelaar aanzet)
//  1  noodrem aan                 -> niets
//  2  schakelaar uit              -> niets (standaard uit; de eigenaar zet hem aan)
//  3  main niet te lezen          -> wacht
//  4  live is al main             -> niets
//  5  deze sha eerder geweigerd   -> niets (nooit opnieuw proberen; een nieuwe sha wel)
//  6  migratie wacht op de eigenaar voor deze sha -> niets (migraties blijven handwerk)
//  7  rustperiode (3 min zonder nieuwe push) niet voorbij -> wacht
//  8  live-zetter draait niet of is te oud (versie < 3) -> wacht
//  9  er loopt een uitrol of een verzoek ligt klaar -> wacht
// 10  controle ontbreekt -> start hem; loopt -> wacht; faalt -> weiger deze sha
// 11  nieuwe migraties meegekomen -> migratie-wacht (niet uitrollen, melding)
// 12  eigen-model-venster 11:50-12:40 UTC -> wacht;  vrij geheugen < 6 GB of onbekend -> wacht
// 13  alles in orde -> uitrollen
// ---------------------------------------------------------------------------

export const AUTO_UITROL_DOOR = "Auto-uitrol";
/** Zolang er binnen deze tijd nog een nieuwe push komt, wacht de ronde en neemt hij daarna de nieuwste. */
export const RUST_MS = 3 * 60_000;
/** Het venster waarin het eigen model (Ollama) zijn dagelijkse rondes draait: dan geen bouw (minuten sinds middernacht, UTC). */
export const OLLAMA_VENSTER = { vanMin: 11 * 60 + 50, totMin: 12 * 60 + 40 };
export const MIN_VRIJ_GEHEUGEN_MB = 6 * 1024;
/** Minimale versie van de live-zetter die de auto-regels kent (zf-live.py VERSIE). */
export const MIN_LIVEZETTER_VERSIE = 3;
/** Loopt main zo lang voor op live zonder dat de lus iets doet, dan melden we het. */
export const ACHTERSTAND_MELDING_MS = 30 * 60_000;
/** Na een gestarte uitrol wacht de lus zo lang voordat de nacontrole loopt (de app moet opgestart zijn). */
export const NACONTROLE_WACHT_MS = 3 * 60_000;
/** Zo lang wachten we op een rondgang na de uitrol; daarna is de uitslag "onbekend" (geen stop, wel melding). */
export const NACONTROLE_RONDGANG_MAX_MS = 15 * 60_000;

/** De nacontrole na een door de Auto-uitrol gestarte uitrol die "klaar" meldde. */
export interface Nacontrole {
  sha: string;
  id: string;
  /** wanneer de uitrol klaar was (begin van de wachttijd) */
  sinds: string;
  /** wanneer de lus zelf een rondgang startte (eenmalig) */
  rondgangGestart: string | null;
}
export interface Stop {
  reden: string;
  sha: string;
  op: string;
}

export interface AutoStand {
  /** de sha van main die als laatste is gezien, en sinds wanneer hij onveranderd is (ISO) */
  gezienSha: string | null;
  gezienSinds: string | null;
  /** sha -> waarom die nooit meer automatisch wordt geprobeerd */
  geweigerd: Record<string, { reden: string; op: string }>;
  /** de sha waarvoor de eigenaar een migratie met de hand moet uitrollen */
  migratieWacht: { sha: string; migraties: string[]; op: string } | null;
  /** de sha waarvoor de laatste auto-uitrol is gevraagd (om de uitkomst te lezen) */
  verzocht: { sha: string; id: string; op: string } | null;
  laatsteControle: { sha: string; ok: boolean; op: string } | null;
  laatsteUitrol: { sha: string; uitkomst: "gevraagd" | "klaar" | "geweigerd"; op: string } | null;
  laatsteBeslissing: { op: string; actie: BesluitActie; reden: string } | null;
  /** sinds wanneer main voorloopt op live (ISO), voor de achterstandsmelding */
  achterSinds: string | null;
  /** de laatste keer dat de lus liep */
  laatsteRonde: string | null;
  /** loopt er een nacontrole na een uitrol? */
  nacontrole: Nacontrole | null;
  /** de harde stop: de nacontrole faalde. Gezet = er wordt nooit meer automatisch uitgerold tot een mens de schakelaar aanzet. */
  stop: Stop | null;
  laatsteNacontrole: { sha: string; uitslag: "ok" | "stop" | "onbekend"; reden: string; op: string } | null;
}

export const LEGE_STAND: AutoStand = {
  gezienSha: null,
  gezienSinds: null,
  geweigerd: {},
  migratieWacht: null,
  verzocht: null,
  laatsteControle: null,
  laatsteUitrol: null,
  laatsteBeslissing: null,
  achterSinds: null,
  laatsteRonde: null,
  nacontrole: null,
  stop: null,
  laatsteNacontrole: null,
};

export type ControleStatus = "onbekend" | "bezig" | "schoon" | "faalt";

export interface Invoer {
  nu: number;
  aan: boolean;
  noodrem: boolean;
  liveSha: string | null;
  mainSha: string | null;
  stand: AutoStand;
  controle: ControleStatus;
  /** migraties die met de commits tussen live en main meekomen; null = niet te lezen */
  nieuweMigraties: string[] | null;
  /** loopt er een uitrol of ligt er een verzoek klaar? */
  uitrolBezig: boolean;
  livezetter: { leeft: boolean; versie: number } | null;
  /** vrij geheugen in MB (MemAvailable); null = niet te meten */
  vrijGeheugenMb: number | null;
}

export type BesluitActie = "niets" | "wacht" | "controleer" | "weiger" | "migratie-wacht" | "uitrollen";
export interface Besluit {
  actie: BesluitActie;
  reden: string;
  sha?: string;
}

/** Valt dit tijdstip in het venster van het eigen model (UTC)? */
export function inOllamaVenster(nu: number, venster = OLLAMA_VENSTER): boolean {
  const d = new Date(nu);
  const min = d.getUTCHours() * 60 + d.getUTCMinutes();
  return min >= venster.vanMin && min < venster.totMin;
}

/** Is de rustperiode voorbij? `gezienSinds` is het moment waarop deze sha voor het eerst als nieuwste main is gezien. */
export function rustVoorbij(gezienSinds: string | null, nu: number, rust = RUST_MS): boolean {
  const t = gezienSinds ? Date.parse(gezienSinds) : NaN;
  return Number.isFinite(t) && nu - t >= rust;
}

/** Werkt de stand bij met wat er nu op main staat: een andere sha begint de rustperiode opnieuw. */
export function zietMain(stand: AutoStand, mainSha: string | null, nu: number): AutoStand {
  if (!mainSha) return stand;
  if (stand.gezienSha === mainSha) return stand;
  return { ...stand, gezienSha: mainSha, gezienSinds: new Date(nu).toISOString() };
}

export function beslis(i: Invoer): Besluit {
  // 0b: de harde stop van de nacontrole gaat voor alles behalve niets doen
  if (i.stand.stop) return { actie: "niets", reden: `Gestopt door de nacontrole: ${i.stand.stop.reden}. Er wordt niets automatisch uitgerold tot je de Auto-uitrol zelf weer aanzet.` };
  if (i.noodrem) return { actie: "niets", reden: "De noodrem staat aan: er wordt niets automatisch uitgerold." };
  if (!i.aan) return { actie: "niets", reden: "Auto-uitrol staat uit." };
  if (!i.mainSha) return { actie: "wacht", reden: "Main is nu niet te lezen (GitHub onbereikbaar); de volgende ronde probeert het opnieuw." };
  if (i.liveSha === i.mainSha) return { actie: "niets", reden: "Live is al de nieuwste main.", sha: i.mainSha };
  const geweigerd = i.stand.geweigerd[i.mainSha];
  if (geweigerd) return { actie: "niets", reden: `Deze versie is geweigerd en wordt niet opnieuw geprobeerd: ${geweigerd.reden}`, sha: i.mainSha };
  if (i.stand.migratieWacht?.sha === i.mainSha) {
    return { actie: "niets", reden: "Deze versie bevat een database-wijziging die de eigenaar met de hand uitrolt (dat blijft handwerk).", sha: i.mainSha };
  }
  if (i.stand.gezienSha !== i.mainSha || !rustVoorbij(i.stand.gezienSinds, i.nu)) {
    return { actie: "wacht", reden: "Rustperiode: er kan nog een push volgen; daarna wordt de nieuwste versie genomen.", sha: i.mainSha };
  }
  if (!i.livezetter || !i.livezetter.leeft) return { actie: "wacht", reden: "De live-zetter op de server draait niet of meldt zich niet.", sha: i.mainSha };
  if (i.livezetter.versie < MIN_LIVEZETTER_VERSIE) {
    return { actie: "wacht", reden: `De live-zetter is te oud (versie ${i.livezetter.versie}, nodig ${MIN_LIVEZETTER_VERSIE}): herstart hem met de nieuwe versie.`, sha: i.mainSha };
  }
  if (i.uitrolBezig) return { actie: "wacht", reden: "Er loopt al een uitrol of er ligt een verzoek klaar.", sha: i.mainSha };
  if (i.controle === "onbekend") return { actie: "controleer", reden: "De controle van deze versie is nog niet gedaan: gestart.", sha: i.mainSha };
  if (i.controle === "bezig") return { actie: "wacht", reden: "De controle van deze versie loopt.", sha: i.mainSha };
  if (i.controle === "faalt") return { actie: "weiger", reden: "De controle faalt (TypeScript, databaseschema, eslint of tests).", sha: i.mainSha };
  if (i.nieuweMigraties === null) return { actie: "wacht", reden: "Niet te zien of er database-wijzigingen meekomen; de volgende ronde probeert het opnieuw.", sha: i.mainSha };
  if (i.nieuweMigraties.length > 0) {
    return { actie: "migratie-wacht", reden: `Deze versie wijzigt de database (${i.nieuweMigraties.length}); dat rolt de eigenaar met de hand uit (droge proef, dan akkoord).`, sha: i.mainSha };
  }
  if (inOllamaVenster(i.nu)) return { actie: "wacht", reden: "Het eigen AI-model draait nu zijn dagelijkse rondes (11:50 tot 12:40 UTC); daarna.", sha: i.mainSha };
  if (i.vrijGeheugenMb === null) return { actie: "wacht", reden: "Het vrije geheugen is niet te meten; liever niet bouwen.", sha: i.mainSha };
  if (i.vrijGeheugenMb < MIN_VRIJ_GEHEUGEN_MB) {
    return { actie: "wacht", reden: `Te weinig vrij geheugen om te bouwen (${Math.round(i.vrijGeheugenMb / 1024 * 10) / 10} GB, nodig ${MIN_VRIJ_GEHEUGEN_MB / 1024} GB).`, sha: i.mainSha };
  }
  return { actie: "uitrollen", reden: "Schone controle, geen database-wijziging, de server is vrij: uitrollen.", sha: i.mainSha };
}

/** Leest MemAvailable uit /proc/meminfo (in kB) en geeft MB; null als het niet te lezen is. */
export function vrijGeheugenUitMeminfo(tekst: string): number | null {
  const m = /^MemAvailable:\s+(\d+)\s+kB/m.exec(tekst);
  if (!m?.[1]) return null;
  const kb = Number(m[1]);
  return Number.isFinite(kb) ? Math.round(kb / 1024) : null;
}

/** Hoe de live-zetter een auto-verzoek afsloot, vertaald naar wat de lus ermee doet. */
export type UitrolUitkomst = "klaar" | "migratie" | "tijdelijk" | "geweigerd" | "bezig";
export function uitkomstVanStatus(s: { id: string; staat: string; bericht: string } | null, verzochtId: string): UitrolUitkomst {
  if (!s || s.id !== verzochtId) return "bezig";
  if (s.staat === "bezig") return "bezig";
  if (s.staat === "klaar") return "klaar";
  if (s.staat === "wacht-op-akkoord") return "migratie";
  // een andere uitrol hield het slot, of main was verder gegaan: dat is geen fout van deze versie
  if (/al een andere uitrol|AUTO_VERSCHOVEN|AUTO_GEEN_CONTROLE/.test(s.bericht)) return "tijdelijk";
  return "geweigerd"; // mislukt of teruggezet
}

/** Moet de eigenaar iets weten? Een korte lijst meldingen voor Te doen en de Beheerpagina. Zonder `aan` geen achterstandsmelding. */
export function meldingen(stand: AutoStand, liveSha: string | null, nu: number, aan = true): { id: string; titel: string; tekst: string }[] {
  const uit: { id: string; titel: string; tekst: string }[] = [];
  const gezien = stand.gezienSha;
  const geweigerd = gezien ? stand.geweigerd[gezien] : undefined;
  const migratie = stand.migratieWacht && stand.migratieWacht.sha === gezien ? stand.migratieWacht : null;
  if (gezien && geweigerd && liveSha !== gezien) {
    uit.push({ id: "auto-uitrol-geweigerd", titel: "Auto-uitrol weigerde de nieuwste versie", tekst: `${gezien.slice(0, 10)}: ${geweigerd.reden} Er is niets uitgerold; de vorige versie draait door. Een nieuwe push wordt wel weer geprobeerd.` });
  }
  if (gezien && migratie && liveSha !== gezien) {
    uit.push({ id: "auto-uitrol-migratie", titel: "Migratie wacht: rol deze versie met de hand uit", tekst: `${gezien.slice(0, 10)} bevat een database-wijziging (${migratie.migraties.join(", ") || "onbekend"}). Auto-uitrol rolt die niet uit: kies Live zetten, bekijk de migratie en geef akkoord.` });
  }
  if (stand.stop) {
    uit.push({ id: "auto-uitrol-stop", titel: "Auto-uitrol is gestopt door de nacontrole", tekst: `${stand.stop.sha.slice(0, 10)}: ${stand.stop.reden}. De Auto-uitrol staat uit en rolt niets meer uit tot je hem zelf weer aanzet (Beheer, Live zetten). Kijk eerst of de site goed werkt.` });
  }
  if (stand.laatsteNacontrole?.uitslag === "onbekend" && stand.laatsteNacontrole.sha === gezien) {
    uit.push({ id: "auto-uitrol-nacontrole-onbekend", titel: "Nacontrole na de uitrol kon niet worden afgerond", tekst: stand.laatsteNacontrole.reden });
  }
  const achter = stand.achterSinds ? Date.parse(stand.achterSinds) : NaN;
  if (aan && !stand.stop && !geweigerd && !migratie && Number.isFinite(achter) && nu - achter > ACHTERSTAND_MELDING_MS) {
    uit.push({ id: "auto-uitrol-achter", titel: "Live loopt meer dan 30 minuten achter op main", tekst: `Reden van de laatste ronde: ${stand.laatsteBeslissing?.reden ?? "onbekend"}` });
  }
  return uit;
}

// ---- de nacontrole (harde stop) ----------------------------------------------------------------------------------------------

export interface NaInvoer {
  nu: number;
  /** de sha die de lus besloot uit te rollen */
  sha: string;
  /** wanneer de uitrol klaar was (ISO) */
  sinds: string;
  /** de VERSIE die nu draait (liveVersie().sha); null = niet te lezen */
  versie: string | null;
  /** antwoordt de app op /api/health? */
  gezond: boolean;
  /** de staat van de live-zetter voor dit verzoek (klaar, teruggezet, mislukt, ...) */
  liveStaat: string | null;
  /** de laatste rondgang (KV rondgang:laatste): wanneer, hoeveel pagina's, hoeveel goed, hoeveel problemen */
  rondgang: { at: string; totaal: number; ok: number; problemen: number } | null;
}
export type NaUitslag = { uitslag: "wacht" | "ok" | "stop" | "onbekend"; reden: string };

/**
 * Na een uitrol van de Auto-uitrol: stop (en schakel de Auto-uitrol uit) als de live-zetter terugzette of mislukte, als
 * de VERSIE niet de besloten sha is, als de app niet gezond is of als de rondgang van na de uitrol problemen meldt. Een
 * ontbrekende rondgang is geen stop: eerst 15 minuten afwachten, daarna "onbekend" (wel een melding).
 */
export function beoordeelNacontrole(i: NaInvoer): NaUitslag {
  if (i.liveStaat === "teruggezet" || i.liveStaat === "mislukt") {
    return { uitslag: "stop", reden: `de live-zetter meldt ${i.liveStaat === "teruggezet" ? "dat de vorige versie is teruggezet" : "dat de uitrol mislukte"}` };
  }
  const sinds = Date.parse(i.sinds);
  const verstreken = Number.isFinite(sinds) ? i.nu - sinds : 0;
  if (verstreken < NACONTROLE_WACHT_MS) return { uitslag: "wacht", reden: "de nacontrole begint 3 minuten na de uitrol" };
  if (i.versie !== i.sha) return { uitslag: "stop", reden: `de draaiende VERSIE (${i.versie ? i.versie.slice(0, 10) : "onbekend"}) is niet de besloten versie (${i.sha.slice(0, 10)})` };
  if (!i.gezond) return { uitslag: "stop", reden: "de app antwoordt niet op /api/health" };
  const at = i.rondgang ? Date.parse(i.rondgang.at) : NaN;
  const vers = Number.isFinite(at) && at >= sinds && i.nu - at <= NACONTROLE_RONDGANG_MAX_MS;
  if (i.rondgang && vers) {
    if (i.rondgang.problemen > 0 || i.rondgang.ok < i.rondgang.totaal) {
      return { uitslag: "stop", reden: `de rondgang na de uitrol vond ${i.rondgang.problemen || i.rondgang.totaal - i.rondgang.ok} kapotte pagina('s)` };
    }
    return { uitslag: "ok", reden: "de app is gezond, de versie klopt en de rondgang is schoon" };
  }
  if (verstreken < NACONTROLE_RONDGANG_MAX_MS) return { uitslag: "wacht", reden: "wacht op een rondgang na de uitrol" };
  return { uitslag: "onbekend", reden: "er kwam geen rondgang na de uitrol binnen 15 minuten: niet te zeggen of alle pagina's werken" };
}
