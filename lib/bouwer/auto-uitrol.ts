import { readFileSync } from "node:fs";
import { bewaarAutoStand, leesAutoStand, noodremAan, zetNoodrem } from "@/lib/bouwer/auto-uitrol-opslag";
import { featureEnabled, setFlag } from "@/lib/flags";
import { draaiRondgang, laatsteRondgang } from "@/lib/ops/rondgang";
import { journal } from "@/lib/ops/error-journal";
import { liveVersie } from "@/lib/bouwer/versie";
import { agentLeeft, githubOverzicht, isBezig, leesLive, plaatsVerzoek } from "@/lib/bouwer/live";
import { lijstControles, startControle } from "@/lib/bouwer/controles";
import {
  AUTO_UITROL_DOOR,
  beoordeelNacontrole,
  beslis,
  uitkomstVanStatus,
  vrijGeheugenUitMeminfo,
  zietMain,
  type AutoStand,
  type Besluit,
  type ControleStatus,
} from "@/lib/bouwer/auto-uitrol-regels";

// ---------------------------------------------------------------------------
// Auto-uitrol, de uitvoering (de regels staan in lib/bouwer/auto-uitrol-regels.ts). Elke 2 minuten (cron ->
// /api/internal/auto-uitrol) kijkt deze ronde of GitHub main een andere sha heeft dan wat live draait; dan: rustperiode,
// controle (TypeScript, databaseschema, eslint, tests, bewakers in de Bouwer), en alleen bij een schone controle, geen
// migratie, een vrije server en genoeg geheugen een verzoek voor de live-zetter (die zelf nog eens controleert, de migraties
// weigert zonder akkoord en bij een ongezonde start zelf terugzet). Standaard UIT (vlag auto-uitrol); noodrem in KV.
// ---------------------------------------------------------------------------

const VERZOEK_MAX_MS = 15 * 60_000;

/** Antwoordt de app zelf op /api/health? (de lus draait in de nieuwe app; een container die niet antwoordt, is niet gezond) */
async function appGezond(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

function vrijGeheugenMb(): number | null {
  try {
    return vrijGeheugenUitMeminfo(readFileSync("/proc/meminfo", "utf8"));
  } catch {
    return null;
  }
}

/** De harde stop: de Auto-uitrol gaat zelf UIT (dezelfde vlag als de schakelaar in Beheer), de noodrem krijgt de reden, een regel in het foutenlogboek; de Te-doen-taak volgt uit de stand. */
async function hardeStop(stand: AutoStand, sha: string, reden: string, nu: number): Promise<AutoStand> {
  const op = new Date(nu).toISOString();
  await setFlag("auto-uitrol", { enabled: false }, AUTO_UITROL_DOOR).catch(() => undefined);
  await zetNoodrem(true, AUTO_UITROL_DOOR, reden).catch(() => undefined);
  journal("error", "auto-uitrol: harde stop", { sha: sha.slice(0, 10), reden });
  return { ...stand, verzocht: null, stop: { reden, sha, op }, laatsteNacontrole: { sha, uitslag: "stop", reden, op } };
}

export interface RondeUitslag {
  besluit: Besluit;
  aan: boolean;
  noodrem: boolean;
}

/** Eén ronde. Gooit niet: een storing wordt een besluit "wacht" met de reden. */
export async function autoUitrolRonde(nu: number = Date.now()): Promise<RondeUitslag> {
  const [aan, noodrem] = await Promise.all([featureEnabled("auto-uitrol").catch(() => false), noodremAan().catch(() => true)]);
  let stand = await leesAutoStand();
  const klaar = async (besluit: Besluit): Promise<RondeUitslag> => {
    stand = { ...stand, laatsteRonde: new Date(nu).toISOString(), laatsteBeslissing: { op: new Date(nu).toISOString(), actie: besluit.actie, reden: besluit.reden } };
    await bewaarAutoStand(stand).catch(() => undefined);
    return { besluit, aan, noodrem };
  };
  // Staat hij uit of is de noodrem aan, dan blijft het bij het bijhouden van de stand (geen netwerk, geen verzoek).
  if (noodrem || !aan) return klaar(beslis({ nu, aan, noodrem, liveSha: null, mainSha: null, stand, controle: "onbekend", nieuweMigraties: [], uitrolBezig: false, livezetter: null, vrijGeheugenMb: null }));

  const live = liveVersie();
  const [liveStand, github] = await Promise.all([
    leesLive().catch(() => null),
    githubOverzicht(live, true).catch(() => null),
  ]);
  const mainSha = github?.main?.sha ?? null;
  stand = zietMain(stand, mainSha, nu);

  // de uitkomst van een eerder gevraagde auto-uitrol lezen
  if (stand.verzocht && liveStand) {
    const uitkomst = uitkomstVanStatus(liveStand.status, stand.verzocht.id);
    const verlopen = nu - Date.parse(stand.verzocht.op) > VERZOEK_MAX_MS;
    const sha = stand.verzocht.sha;
    if (uitkomst === "klaar") {
      // de nacontrole begint: na ~3 minuten gezondheid, VERSIE en rondgang (harde stop als het faalt)
      stand = { ...stand, verzocht: null, nacontrole: { sha, id: stand.verzocht.id, sinds: new Date(nu).toISOString(), rondgangGestart: null }, laatsteUitrol: { sha, uitkomst: "klaar", op: new Date(nu).toISOString() } };
    } else if (uitkomst === "geweigerd" && liveStand.status?.staat === "teruggezet") {
      // een slechte versie ging even live en is teruggezet: harde stop
      const reden = "de live-zetter zette de vorige versie terug na een uitrol van de Auto-uitrol";
      stand = await hardeStop(stand, sha, reden, nu);
    } else if (uitkomst === "migratie") {
      stand = { ...stand, verzocht: null, migratieWacht: { sha, migraties: (liveStand.status?.migraties ?? []).map((m) => m.naam), op: new Date(nu).toISOString() } };
      journal("warn", "auto-uitrol: migratie wacht", { sha: sha.slice(0, 10) });
    } else if (uitkomst === "geweigerd") {
      const reden = (liveStand.status?.bericht ?? "de uitrol mislukte").replace(/\s+/g, " ").slice(0, 300);
      stand = { ...stand, verzocht: null, geweigerd: { ...stand.geweigerd, [sha]: { reden, op: new Date(nu).toISOString() } }, laatsteUitrol: { sha, uitkomst: "geweigerd", op: new Date(nu).toISOString() } };
      journal("error", "auto-uitrol: uitrol mislukt of teruggezet", { sha: sha.slice(0, 10), reden });
    } else if (uitkomst === "tijdelijk" || (uitkomst === "bezig" && verlopen && !isBezig(liveStand.status) && !liveStand.verzoek)) {
      stand = { ...stand, verzocht: null };
    }
  }

  // de nacontrole van een uitrol die klaar meldde (alleen één keer; een rondgang starten we zelf als er geen verse is)
  if (stand.nacontrole) {
    const nc = stand.nacontrole;
    const rondgang = await laatsteRondgang().catch(() => null);
    const na = beoordeelNacontrole({
      nu,
      sha: nc.sha,
      sinds: nc.sinds,
      versie: live?.sha ?? null,
      gezond: await appGezond(),
      liveStaat: liveStand?.status && liveStand.status.id === nc.id ? liveStand.status.staat : null,
      rondgang: rondgang ? { at: rondgang.at, totaal: rondgang.totaal, ok: rondgang.ok, problemen: rondgang.problemen.length } : null,
    });
    if (na.uitslag === "stop") {
      stand = await hardeStop({ ...stand, nacontrole: null }, nc.sha, `nacontrole faalde: ${na.reden}`, nu);
    } else if (na.uitslag === "ok" || na.uitslag === "onbekend") {
      stand = { ...stand, nacontrole: null, laatsteNacontrole: { sha: nc.sha, uitslag: na.uitslag, reden: na.reden, op: new Date(nu).toISOString() } };
      if (na.uitslag === "onbekend") journal("warn", "auto-uitrol: nacontrole onbekend", { sha: nc.sha.slice(0, 10), reden: na.reden });
    } else if (!nc.rondgangGestart && nu - Date.parse(nc.sinds) >= 3 * 60_000) {
      // geen verse rondgang: zelf één starten (op de achtergrond; de uitslag komt in KV rondgang:laatste)
      stand = { ...stand, nacontrole: { ...nc, rondgangGestart: new Date(nu).toISOString() } };
      void draaiRondgang().catch(() => undefined);
    }
  }

  // achterstand bijhouden (voor de melding na 30 minuten)
  stand = { ...stand, achterSinds: live && mainSha && live.sha !== mainSha ? (stand.achterSinds ?? new Date(nu).toISOString()) : null };

  // live moet een voorouder van main zijn; anders niet automatisch (iemand rolde iets uit dat niet op main staat)
  if (github && (github.vergelijking === "behind" || github.vergelijking === "diverged")) {
    return klaar({ actie: "wacht", reden: "Live bevat wijzigingen die niet op GitHub main staan: niet automatisch uitrollen. Kijk bij Live zetten.", ...(mainSha ? { sha: mainSha } : {}) });
  }

  // de controle van precies deze sha
  let controle: ControleStatus = "onbekend";
  if (mainSha) {
    const lijst = await lijstControles().catch(() => null);
    const uitslag = lijst?.uitslagen.find((c) => c.sha === mainSha);
    if (uitslag) {
      controle = uitslag.ok ? "schoon" : "faalt";
      stand = { ...stand, laatsteControle: { sha: mainSha, ok: uitslag.ok, op: uitslag.klaar } };
    } else if (lijst?.bezig && (lijst.bezig.doel === mainSha || lijst.bezig.doel === "main")) controle = "bezig";
  }

  const besluit = beslis({
    nu,
    aan,
    noodrem,
    liveSha: live?.sha ?? null,
    mainSha,
    stand,
    controle,
    nieuweMigraties: github ? github.nieuweMigraties : null,
    uitrolBezig: Boolean(stand.verzocht) || Boolean(liveStand && (isBezig(liveStand.status) || liveStand.verzoek)),
    livezetter: liveStand ? { leeft: agentLeeft(liveStand.hartslag, nu), versie: liveStand.hartslag?.versie ?? 0 } : null,
    vrijGeheugenMb: vrijGeheugenMb(),
  });

  if (besluit.actie === "controleer" && besluit.sha) {
    await startControle(besluit.sha, AUTO_UITROL_DOOR).catch(() => undefined);
  } else if (besluit.actie === "weiger" && besluit.sha) {
    stand = { ...stand, geweigerd: { ...stand.geweigerd, [besluit.sha]: { reden: besluit.reden, op: new Date(nu).toISOString() } } };
    journal("error", "auto-uitrol: controle faalt, niet uitgerold", { sha: besluit.sha.slice(0, 10) });
  } else if (besluit.actie === "migratie-wacht" && besluit.sha) {
    stand = { ...stand, migratieWacht: { sha: besluit.sha, migraties: github?.nieuweMigraties ?? [], op: new Date(nu).toISOString() } };
    journal("warn", "auto-uitrol: migratie wacht", { sha: besluit.sha.slice(0, 10) });
  } else if (besluit.actie === "uitrollen" && besluit.sha) {
    const v = await plaatsVerzoek({ actie: "uitrollen", migraties: [], destructiefAkkoord: false, forceer: false, zonderControle: false, auto: true, doelSha: besluit.sha, door: AUTO_UITROL_DOOR });
    stand = { ...stand, verzocht: { sha: besluit.sha, id: v.id, op: v.op }, laatsteUitrol: { sha: besluit.sha, uitkomst: "gevraagd", op: v.op } };
  }
  return klaar(besluit);
}