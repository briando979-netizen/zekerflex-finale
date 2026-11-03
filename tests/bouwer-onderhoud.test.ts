import { describe, expect, it } from "vitest";
import { heuristicRoute } from "@/lib/jarvis/core";
import { herstartTaak, samenvatServerstand } from "@/lib/bouwer/onderhoud";

// Serveronderhoud vanuit de chat: alleen op een duidelijk begin, en een stand in gewone taal.

describe("serveronderhoud in de chat", () => {
  it("leest de serverstand op een expliciete vraag", () => {
    for (const p of ["serverstand", "Hoe staat de server?", "hoe staat het met de server", "status van de server", "hoe gaat het met de server"]) {
      expect(heuristicRoute(p)?.capability, p).toBe("serverstand");
    }
  });

  it("herstart alleen een bekend onderdeel, en alleen als het bericht ermee begint", () => {
    expect(herstartTaak("herstart de app")).toBe("herstart-app");
    expect(herstartTaak("Herstart de Bouwer")).toBe("herstart-bouwer");
    expect(herstartTaak("herstart webserver")).toBe("herstart-caddy");
    expect(herstartTaak("herstart de planner")).toBe("herstart-cron");
    expect(heuristicRoute("herstart de app")?.capability).toBe("onderhoud");
    for (const p of ["herstart de database", "herstart postgres", "kun je de app herstarten?", "moet ik de app herstarten", "herstart"]) {
      expect(heuristicRoute(p)?.capability === "onderhoud", p).toBe(false);
    }
  });

  it("vat de stand van de live-zetter samen", () => {
    const log = [
      "==> Serverstand bekijken",
      "--- diensten",
      "app: Up 49 seconds (healthy)",
      "bouwer: Up 38 seconds",
      "postgres: Up 4 days (healthy)",
      "--- schijf",
      "Filesystem      Size  Used Avail Use% Mounted on",
      "/dev/vda1        96G   53G   43G  56% /",
      "--- geheugen",
      "               total        used        free      shared  buff/cache   available",
      "Mem:            7888        2777        1787          30        3659        5111",
      "--- belasting",
      " 17:21:56 up 4 days",
    ];
    expect(samenvatServerstand(log)).toBe("Alle 3 onderdelen draaien. Schijf: 56% gebruikt, nog 43G vrij. Geheugen: 5 GB beschikbaar van 7,7 GB.");
    const ziek = log.map((r) => (r.startsWith("app:") ? "app: Restarting (1) 5 seconds ago" : r));
    expect(samenvatServerstand(ziek)).toMatch(/^Niet alles draait goed: app\./);
    expect(samenvatServerstand([])).toMatch(/kwam niet goed door/);
  });
});
