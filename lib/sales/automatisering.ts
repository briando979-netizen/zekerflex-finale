import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { enginePaused } from "@/lib/sales/engine";

// ---------------------------------------------------------------------------
// "Gaat het automatisch?" voor Beheer → Sales (15 nov 2026): wat de motor op dit moment wel en niet kan doen, en waar de leads
// vastlopen. De motor verrijkt en scoort leads, zoekt contactgegevens en maakt concepten (lib/sales/engine.ts); versturen doet
// hij alleen als een campagne op AUTOPILOT staat, de eigenaar dat heeft bevestigd én SALES_AUTOPILOT_ENABLED aan staat.
// Bovendien mailt hij een lead pas met een e-mailadres én een vacaturesignaal, nooit een kale stub. Dit bestand telt waar de leads
// staan (leesAutomatisering) en zegt in gewone taal wat dat betekent (oordeel, puur en los te testen). Het zet niets aan.
// ---------------------------------------------------------------------------

/** Hoe vaak de motor draait; moet kloppen met deploy/cron/entrypoint.sh. */
export const MOTOR_ELKE = "elke dag om 08:00";

export interface AutomatiseringStand {
  engineAan: boolean;
  gepauzeerd: boolean;
  autopilotToegestaan: boolean;
  /** de actieve campagnes */
  campagnes: { naam: string; modus: "REVIEW" | "AUTOPILOT"; autopilotBevestigd: boolean; minScore: number; dagGrens: number }[];
  verstuurdVandaag: number;
  /** concepten die op jouw goedkeuring wachten */
  wachtOpJou: number;
  laatsteRun: { op: string; samenvatting: string } | null;
  leads: {
    open: number;
    zonderScore: number;
    zonderMail: number;
    zonderVacature: number;
    klaarVoorConcept: number;
  };
}

export type OordeelNiveau = "ok" | "let-op" | "stil";

export interface Oordeel {
  niveau: OordeelNiveau;
  kop: string;
  regels: string[];
}

/** Wat betekent deze stand? Eerlijk over wat er automatisch gaat en wat wacht op de eigenaar. */
export function oordeel(s: AutomatiseringStand): Oordeel {
  const regels: string[] = [];
  if (!s.engineAan) return { niveau: "stil", kop: "De motor staat uit.", regels: ["SALES_ENGINE_ENABLED staat uit: er wordt niets verrijkt, gescoord of gemaakt."] };
  if (s.gepauzeerd) return { niveau: "stil", kop: "De motor is gepauzeerd.", regels: ["De kill-switch staat aan. Hervat de motor op het tabblad Motor."] };
  if (s.campagnes.length === 0) return { niveau: "stil", kop: "Er is geen actieve campagne.", regels: ["Zonder actieve campagne doet de motor niets. Zet er een aan op het tabblad Campagnes."] };

  const handmatig = s.campagnes.filter((c) => c.modus !== "AUTOPILOT" || !c.autopilotBevestigd);
  const automatisch = s.campagnes.filter((c) => c.modus === "AUTOPILOT" && c.autopilotBevestigd);
  const verstuurt = automatisch.length > 0 && s.autopilotToegestaan;

  regels.push(`De motor draait ${MOTOR_ELKE}: leads verrijken en scoren, contactgegevens zoeken en concepten maken.`);
  if (verstuurt) {
    regels.push(`Versturen gaat automatisch (${automatisch.map((c) => c.naam).join(", ")}), binnen de dagelijkse grens en het verzendvenster.`);
  } else if (automatisch.length > 0 && !s.autopilotToegestaan) {
    regels.push("Een campagne staat op automatisch, maar SALES_AUTOPILOT_ENABLED staat uit: er wordt niets verstuurd.");
  } else {
    regels.push(`Versturen gaat niet vanzelf: ${handmatig.map((c) => c.naam).join(", ")} wacht${handmatig.length > 1 ? "en" : ""} op jouw goedkeuring per mail (handmatig). Zet een campagne op automatisch om dat over te laten aan de motor; dat is een bewuste keuze van jou.`);
  }
  if (s.wachtOpJou > 0) regels.push(`${s.wachtOpJou} concept${s.wachtOpJou === 1 ? "" : "en"} wacht${s.wachtOpJou === 1 ? "" : "en"} op jouw goedkeuring.`);

  const l = s.leads;
  if (l.open > 0) {
    if (l.zonderScore > 0) regels.push(`${l.zonderScore} van ${l.open} open leads zijn nog niet gescoord (de motor doet er een paar per ronde).`);
    if (l.zonderMail > 0) regels.push(`${l.zonderMail} gescoorde leads hebben nog geen e-mailadres: de motor zoekt dat op hun website, maar niet elk bedrijf heeft een adres online.`);
    if (l.zonderVacature > 0) regels.push(`${l.zonderVacature} leads hebben wel een adres maar nog geen vacaturesignaal: die mailt de motor bewust niet.`);
    regels.push(`${l.klaarVoorConcept} lead${l.klaarVoorConcept === 1 ? "" : "s"} ${l.klaarVoorConcept === 1 ? "is" : "zijn"} nu klaar voor een eerste mail.`);
  }

  if (!verstuurt) return { niveau: "let-op", kop: "Voorbereiden gaat vanzelf, versturen niet.", regels };
  if (l.klaarVoorConcept === 0 && s.wachtOpJou === 0) return { niveau: "let-op", kop: "Automatisch, maar er is nu niets om te versturen.", regels };
  return { niveau: "ok", kop: "Het gaat automatisch.", regels };
}

const GESLOTEN = ["WON", "LOST", "DISQUALIFIED", "BOUNCED", "UNSUBSCRIBED"] as const;

export async function leesAutomatisering(): Promise<AutomatiseringStand> {
  const campagnes = await prisma.salesCampaign.findMany({ where: { status: "ACTIVE" }, select: { name: true, mode: true, autopilotConfirmedAt: true, minScore: true, dailyCap: true } });
  const minScore = campagnes.length > 0 ? Math.min(...campagnes.map((c) => c.minScore)) : 55;
  const open = { status: { notIn: [...GESLOTEN] }, suppressed: false };
  const heeftMail = { OR: [{ contactEmail: { not: null } }, { discoveredEmail: { not: null } }] };
  const geenMail = { contactEmail: null, discoveredEmail: null };
  const [paused, verstuurdVandaag, wachtOpJou, laatste, nOpen, zonderScore, zonderMail, zonderVacature, klaar] = await Promise.all([
    enginePaused(),
    prisma.salesOutreach.count({ where: { sentAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } } }),
    prisma.salesLead.count({ where: { status: "QUEUED" } }),
    prisma.salesEngineRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true, summary: true } }),
    prisma.salesLead.count({ where: open }),
    prisma.salesLead.count({ where: { ...open, score: null } }),
    prisma.salesLead.count({ where: { ...open, score: { not: null }, ...geenMail } }),
    prisma.salesLead.count({ where: { ...open, score: { gte: minScore }, vacancySignal: null, AND: [heeftMail] } }),
    prisma.salesLead.count({ where: { ...open, score: { gte: minScore }, vacancySignal: { not: null }, sequenceStep: 0, outreach: { none: { status: { notIn: ["DISCARDED"] } } }, AND: [heeftMail] } }),
  ]);
  return {
    engineAan: env.SALES_ENGINE_ENABLED,
    gepauzeerd: paused,
    autopilotToegestaan: env.SALES_AUTOPILOT_ENABLED,
    campagnes: campagnes.map((c) => ({ naam: c.name, modus: c.mode === "AUTOPILOT" ? "AUTOPILOT" : "REVIEW", autopilotBevestigd: c.autopilotConfirmedAt !== null, minScore: c.minScore, dagGrens: c.dailyCap })),
    verstuurdVandaag,
    wachtOpJou,
    laatsteRun: laatste ? { op: laatste.startedAt.toISOString(), samenvatting: laatste.summary ?? "" } : null,
    leads: { open: nOpen, zonderScore, zonderMail, zonderVacature, klaarVoorConcept: klaar },
  };
}
