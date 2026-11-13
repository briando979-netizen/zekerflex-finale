import { readFileSync } from "node:fs";
import { bewaarAutoStand, leesAutoStand, noodremAan, zetNoodrem } from "@/lib/bouwer/auto-uitrol-opslag";
import { featureEnabled, setFlag } from "@/lib/flags";
import { draaiRondgang, laatsteRondgang } from "@/lib/ops/rondgang";
import { journal } from "@/lib/ops/error-journal";
import { kvDelete, kvGet, kvSet, kvSetIfAbsent } from "@/lib/storage/kv";
import { liveVersie } from "@/lib/bouwer/versie";
import { agentLeeft, githubMainSha, githubVergelijk, isBezig, leesLive, plaatsVerzoekAlsLeeg } from "@/lib/bouwer/live";
import { lijstControles, startControle } from "@/lib/bouwer/controles";
import {
  AUTO_UITROL_DOOR,
  beoordeelNacontrole,
  beslis,
  registreerUitstel,
  slotVrij,
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
// Eén ronde tegelijk (KV-slot), en een ronde die de stand niet kan LEZEN schrijft niets terug.
// ---------------------------------------------------------------------------

const VERZOEK_MAX_MS = 15 * 60_000;
const K_RONDE_SLOT = "bouwer:auto-uitrol:slot";
const K_MAIN_CACHE = "bouwer:auto-uitrol:github-main";
const K_VERGELIJK = "bouwer:auto-uitrol:vergelijk:";

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

/**
 * De sha van GitHub main, met een ETag in de KV: een ongewijzigde main kost een 304 (telt niet mee voor de limiet van 60 per uur
 * zonder token), zodat een ronde elke 2 minuten ruim binnen de limiet blijft. Een fout (ook een 429) geeft null met de reden.
 */
async function leesMain(): Promise<{ sha: string | null; fout: string | null }> {
  const cache = await kvGet<{ sha: string; etag: string | null }>(K_MAIN_CACHE).catch(() => null);
  try {
    const r = await githubMainSha(cache?.etag ?? null);
    if (r.status === "ongewijzigd") return cache ? { sha: cache.sha, fout: null } : { sha: null, fout: "GitHub meldde ongewijzigd zonder bewaard antwoord" };
    await kvSet(K_MAIN_CACHE, { sha: r.sha, etag: r.etag }).catch(() => undefined);
    return { sha: r.sha, fout: null };
  } catch (e) {
    return { sha: null, fout: (e as Error).message };
  }
}

/** Ligt main voor op live, en welke migraties komen mee? Per paar één keer opgehaald en bewaard (het antwoord verandert nooit). */
async function leesVergelijking(live: string, main: string): Promise<{ vergelijking: string; nieuweMigraties: string[] } | null> {
  if (live === main) return { vergelijking: "identical", nieuweMigraties: [] };
  const sleutel = `${K_VERGELIJK}${live.slice(0, 12)}:${main.slice(0, 12)}`;
  const bewaard = await kvGet<{ vergelijking: string; nieuweMigraties: string[] }>(sleutel).catch(() => null);
  if (bewaard) return bewaard;
  try {
    const nieuw = await githubVergelijk(live, main);
    await kvSet(sleutel, nieuw).catch(() => undefined);
    return nieuw;
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

/** Het slot om één ronde: nx-set in de KV; een slot ouder dan 10 minuten is van een vastgelopen ronde en wordt overgenomen. */
async function neemRondeSlot(nu: number): Promise<boolean> {
  try {
    const mijn = { op: new Date(nu).toISOString() };
    if (await kvSetIfAbsent(K_RONDE_SLOT, mijn)) return true;
    const bestaand = await kvGet<{ op?: string }>(K_RONDE_SLOT);
    if (!slotVrij(bestaand, nu)) return false;
    await kvSet(K_RONDE_SLOT, mijn);
    return true;
  } catch {
    return false;
  }
}

/** Eén ronde. Gooit niet: een storing wordt een besluit "wacht" met de reden. */
export async function autoUitrolRonde(nu: number = Date.now()): Promise<RondeUitslag> {
  const [aan, noodrem] = await Promise.all([featureEnabled("auto-uitrol").catch(() => false), noodremAan().catch(() => true)]);
  if (!(await neemRondeSlot(nu))) {
    return { besluit: { actie: "wacht", reden: "Een vorige ronde loopt nog (of de opslag is niet bereikbaar); deze ronde doet niets." }, aan, noodrem };
  }
  try {
    return await ronde(nu, aan, noodrem);
  } finally {
    await kvDelete(K_RONDE_SLOT).catch(() => undefined);
  }
}

async function ronde(nu: number, aan: boolean, noodrem: boolean): Promise<RondeUitslag> {
  // Lukt het lezen van de stand niet, dan NIETS schrijven: een lege stand terugschrijven zou geweigerde versies, de nacontrole en de harde stop wissen.
  let stand: AutoStand;
  try {
    stand = await leesAutoStand();
  } catch {
    return { besluit: { actie: "wacht", reden: "De opslag is niet te lezen: deze ronde schreef niets." }, aan, noodrem };
  }
  const klaar = async (besluit: Besluit): Promise<RondeUitslag> => {
    stand = { ...stand, laatsteRonde: new Date(nu).toISOString(), laatsteBeslissing: { op: new Date(nu).toISOString(), actie: besluit.actie, reden: besluit.reden } };
    await bewaarAutoStand(stand).catch(() => undefined);
    return { besluit, aan, noodrem };
  };
  // Staat hij uit of is de noodrem aan, dan blijft het bij het bijhouden van de stand (geen netwerk, geen verzoek).
  if (noodrem || !aan) return klaar(beslis({ nu, aan, noodrem, liveSha: null, mainSha: null, stand, controle: "onbekend", nieuweMigraties: [], uitrolBezig: false, livezetter: null, vrijGeheugenMb: null }));

  const live = liveVersie();
  const [liveStand, main] = await Promise.all([leesLive().catch(() => null), leesMain()]);
  const mainSha = main.sha;
  const vergelijk = live && mainSha ? await leesVergelijking(live.sha, mainSha) : null;
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
      stand = await hardeStop(stand, sha, "de live-zetter zette de vorige versie terug na een uitrol van de Auto-uitrol", nu);
    } else if (uitkomst === "migratie") {
      stand = { ...stand, verzocht: null, migratieWacht: { sha, migraties: (liveStand.status?.migraties ?? []).map((m) => m.naam), op: new Date(nu).toISOString() } };
      journal("warn", "auto-uitrol: migratie wacht", { sha: sha.slice(0, 10) });
    } else if (uitkomst === "geweigerd") {
      const reden = (liveStand.status?.bericht ?? "de uitrol mislukte").replace(/\s+/g, " ").slice(0, 300);
      stand = { ...stand, verzocht: null, geweigerd: { ...stand.geweigerd, [sha]: { reden, op: new Date(nu).toISOString() } }, laatsteUitrol: { sha, uitkomst: "geweigerd", op: new Date(nu).toISOString() } };
      journal("error", "auto-uitrol: uitrol mislukt of teruggezet", { sha: sha.slice(0, 10), reden });
    } else if (uitkomst === "tijdelijk") {
      // hoogstens 3 keer, met 10 minuten ertussen; daarna geweigerd met melding (regel in de beslislogica)
      const reden = (liveStand.status?.bericht ?? "uitgesteld").replace(/\s+/g, " ").slice(0, 200);
      stand = registreerUitstel({ ...stand, verzocht: null }, sha, nu, reden);
      if (stand.geweigerd[sha]) journal("error", "auto-uitrol: steeds uitgesteld, niet opnieuw geprobeerd", { sha: sha.slice(0, 10), reden });
    } else if (uitkomst === "bezig" && verlopen && !isBezig(liveStand.status) && !liveStand.verzoek) {
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
    } else if (na.uitslag === "onbekend") {
      // geen rondgang binnen 15 minuten: niet te zeggen of alles werkt, dus ook stoppen (de eigenaar kijkt en zet hem weer aan)
      stand = await hardeStop({ ...stand, nacontrole: null }, nc.sha, `nacontrole onbekend na 15 min: ${na.reden}`, nu);
    } else if (na.uitslag === "ok") {
      stand = { ...stand, nacontrole: null, laatsteNacontrole: { sha: nc.sha, uitslag: "ok", reden: na.reden, op: new Date(nu).toISOString() } };
    } else if (!nc.rondgangGestart && nu - Date.parse(nc.sinds) >= 3 * 60_000) {
      // geen verse rondgang: zelf één starten (op de achtergrond; de uitslag komt in KV rondgang:laatste)
      stand = { ...stand, nacontrole: { ...nc, rondgangGestart: new Date(nu).toISOString() } };
      void draaiRondgang().catch(() => undefined);
    }
  }

  // achterstand bijhouden (voor de melding na 30 minuten)
  stand = { ...stand, achterSinds: live && mainSha && live.sha !== mainSha ? (stand.achterSinds ?? new Date(nu).toISOString()) : null };

  if (!mainSha) return klaar({ actie: "wacht", reden: `Main is nu niet te lezen: ${main.fout ?? "onbekend"}.` });

  // live moet een voorouder van main zijn; anders niet automatisch (iemand rolde iets uit dat niet op main staat)
  if (vergelijk && (vergelijk.vergelijking === "behind" || vergelijk.vergelijking === "diverged")) {
    return klaar({ actie: "wacht", reden: "Live bevat wijzigingen die niet op GitHub main staan: niet automatisch uitrollen. Kijk bij Live zetten.", sha: mainSha });
  }

  // de controle van precies deze sha
  let controle: ControleStatus = "onbekend";
  const lijst = await lijstControles().catch(() => null);
  const uitslag = lijst?.uitslagen.find((c) => c.sha === mainSha);
  if (uitslag) {
    controle = uitslag.ok ? "schoon" : "faalt";
    stand = { ...stand, laatsteControle: { sha: mainSha, ok: uitslag.ok, op: uitslag.klaar } };
  } else if (lijst?.bezig && (lijst.bezig.doel === mainSha || lijst.bezig.doel === "main")) controle = "bezig";

  const besluit = beslis({
    nu,
    aan,
    noodrem,
    liveSha: live?.sha ?? null,
    mainSha,
    stand,
    controle,
    nieuweMigraties: vergelijk ? vergelijk.nieuweMigraties : null,
    uitrolBezig: Boolean(stand.verzocht) || Boolean(liveStand && (isBezig(liveStand.status) || liveStand.verzoek)),
    livezetter: liveStand ? { leeft: agentLeeft(liveStand.hartslag, nu), versie: liveStand.hartslag?.versie ?? 0 } : null,
    vrijGeheugenMb: vrijGeheugenMb(),
  });

  if (besluit.actie === "controleer" && besluit.sha) {
    // vanaf = de live VERSIE: eslint en tests dekken het hele stuk tussen live en main
    await startControle(besluit.sha, AUTO_UITROL_DOOR, false, live?.sha).catch(() => undefined);
  } else if (besluit.actie === "weiger" && besluit.sha) {
    stand = { ...stand, geweigerd: { ...stand.geweigerd, [besluit.sha]: { reden: besluit.reden, op: new Date(nu).toISOString() } } };
    journal("error", "auto-uitrol: controle faalt, niet uitgerold", { sha: besluit.sha.slice(0, 10) });
  } else if (besluit.actie === "migratie-wacht" && besluit.sha) {
    stand = { ...stand, migratieWacht: { sha: besluit.sha, migraties: vergelijk?.nieuweMigraties ?? [], op: new Date(nu).toISOString() } };
    journal("warn", "auto-uitrol: migratie wacht", { sha: besluit.sha.slice(0, 10) });
  } else if (besluit.actie === "uitrollen" && besluit.sha) {
    // Alleen schrijven als er GEEN verzoek ligt (INSERT ... ON CONFLICT DO NOTHING): een verzoek van een mens gaat voor.
    const v = await plaatsVerzoekAlsLeeg({ actie: "uitrollen", migraties: [], destructiefAkkoord: false, forceer: false, zonderControle: false, auto: true, doelSha: besluit.sha, door: AUTO_UITROL_DOOR });
    if (!v) return klaar({ actie: "wacht", reden: "Er lag al een verzoek van iemand anders; dat gaat voor. De volgende ronde kijkt opnieuw.", sha: besluit.sha });
    stand = { ...stand, verzocht: { sha: besluit.sha, id: v.id, op: v.op }, laatsteUitrol: { sha: besluit.sha, uitkomst: "gevraagd", op: v.op } };
  }
  return klaar(besluit);
}