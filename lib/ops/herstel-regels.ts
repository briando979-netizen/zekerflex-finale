import type { BackupReport } from "@/lib/ops/backup";

// Pure regels voor ZekerFlex Recovery Shield: uit het back-uprapport
// (lib/ops/backup.ts) één antwoord op "kunnen we terug als het misgaat?".
// Zes controles, van de nachtelijke back-up tot een kopie die ook een inbreker
// op de server niet kan wissen. Geen bestanden of netwerk; alleen het type.

export type HerstelUitslag = "ok" | "let-op" | "probleem";

export interface HerstelControle {
  id: "backup" | "proef" | "hersteltest" | "versleuteld" | "buiten" | "onwisbaar";
  titel: string;
  uitslag: HerstelUitslag;
  uitleg: string;
}

export type HerstelNiveau = "sterk" | "redelijk" | "kwetsbaar" | "onbekend";

export interface HerstelStand {
  niveau: HerstelNiveau;
  goed: number;
  totaal: number;
  controles: HerstelControle[];
}

export function herstelStand(r: BackupReport): HerstelStand {
  if (!r.available) return { niveau: "onbekend", goed: 0, totaal: 0, controles: [] };
  const s = r.status;
  const c: HerstelControle[] = [];

  c.push({
    id: "backup",
    titel: "Nachtelijke back-up",
    uitslag: r.state === "ok" ? "ok" : "probleem",
    uitleg: r.state === "ok" ? "De back-up van afgelopen nacht is gelukt." : r.reasons[0] ?? "De back-up van afgelopen nacht ontbreekt of is mislukt.",
  });

  c.push({
    id: "proef",
    titel: "Proef-terugzetting",
    uitslag: s?.restore.ok ? "ok" : "probleem",
    uitleg: s?.restore.ok ? `De back-up is meteen teruggezet op een proefdatabase: ${s.restore.tables} tabellen.` : "De back-up kon niet op een proefdatabase worden teruggezet.",
  });

  const v = r.verificatie;
  c.push({
    id: "hersteltest",
    titel: "Wekelijkse hersteltest",
    uitslag: v.state === "ok" ? "ok" : v.state === "failed" ? "probleem" : "let-op",
    uitleg: v.state === "ok" ? "De diepgaande test van deze week klopt tabel voor tabel." : v.reasons[0] ?? (v.state === "missing" ? "Er is nog geen diepgaande hersteltest gedraaid." : "De laatste diepgaande hersteltest is te oud."),
  });

  c.push({
    id: "versleuteld",
    titel: "Versleutelde kopie",
    uitslag: s?.encrypted ? "ok" : "let-op",
    uitleg: s?.encrypted ? "Er staat een versleutelde kopie naast de back-up." : "Er is geen versleutelde kopie: zet een wachtwoordzin in de instellingen van de back-up.",
  });

  const buiten = s?.offsite;
  c.push({
    id: "buiten",
    titel: "Kopie buiten de server",
    uitslag: !buiten?.configured ? "let-op" : buiten.ok ? "ok" : "probleem",
    uitleg: !buiten?.configured
      ? "Alle back-ups staan op dezelfde server. Gaat die verloren, dan zijn ze ook weg."
      : buiten.ok
        ? "De kopie van afgelopen nacht staat ook buiten de server."
        : "De kopie buiten de server is afgelopen nacht mislukt.",
  });

  c.push({
    id: "onwisbaar",
    titel: "Kopie die niemand op de server kan wissen",
    uitslag: r.ophaal.state === "ok" ? "ok" : "let-op",
    uitleg:
      r.ophaal.state === "ok"
        ? "Je eigen pc haalt de back-up op. De server kan die kopie niet wissen of overschrijven."
        : r.ophaal.state === "oud"
          ? r.ophaal.reasons[0] ?? "Je pc heeft al een paar dagen geen back-up opgehaald."
          : "Wie op de server inbreekt, kan nu alle kopieën wissen. Laat je eigen pc de back-up ophalen: dan staat er één kopie waar de server niet bij kan.",
  });

  const goed = c.filter((x) => x.uitslag === "ok").length;
  const niveau: HerstelNiveau = c.some((x) => x.uitslag === "probleem") ? "kwetsbaar" : goed === c.length ? "sterk" : "redelijk";
  return { niveau, goed, totaal: c.length, controles: c };
}
