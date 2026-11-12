import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deadlineLijst } from "@/lib/boekhouding/deadlines";
import {
  EVEN_KIJKEN_HERINNERING_DAGEN,
  KV_EVEN_KIJKEN,
  dagenTot,
  deadlineMelding,
  draaiNachtronde,
  drempelBesluit,
  kwartalenVoorConcept,
  type BoekingenStempel,
  type BtwToestand,
  type MeldingInvoer,
  type RondeAfhankelijkheden,
} from "@/lib/boekhouding/nachtronde-kern";

// Alle tijden hebben een zone; de klok is bevroren (de live-controle draait in UTC).
const OP = (s: string): Date => new Date(s);

interface Staat {
  kv: Map<string, string>;
  meldingen: MeldingInvoer[];
  concepten: { id: string; jaar: number; kwartaal: number }[];
  toestand: Map<string, BtwToestand>;
  stempels: Map<string, BoekingenStempel>;
  evenKijken: number;
  uitslagen: unknown[];
  fouten: { stap: string; administratieId?: string | undefined }[];
}

function maak(over: Partial<RondeAfhankelijkheden> = {}, start: Partial<Staat> = {}) {
  const s: Staat = {
    kv: new Map(),
    meldingen: [],
    concepten: [],
    toestand: new Map(),
    stempels: new Map(),
    evenKijken: 0,
    uitslagen: [],
    fouten: [],
    ...start,
  };
  let nu = OP("2026-11-12T03:40:00+01:00");
  const sl = (id: string, j: number, k: number) => `${id}:${j}:${k}`;
  const d: RondeAfhankelijkheden = {
    flagAan: async () => true,
    administraties: async () => ["adm1"],
    boekFacturen: vi.fn(async () => ({ nieuw: 2, alGeboekt: 5, fouten: 0 })),
    verwerkBank: vi.fn(async () => ({ bekeken: 3, geboekt: 1, gekoppeld: 0, evenKijken: 2, mislukt: 0 })),
    boekingenStempel: async (id, j, k) => s.stempels.get(sl(id, j, k)) ?? { aantal: 0, laatsteAanmaak: null },
    btwToestand: async (id, j, k) => s.toestand.get(sl(id, j, k)) ?? null,
    maakBtwConcept: async (id, j, k, tijd) => {
      s.concepten.push({ id, jaar: j, kwartaal: k });
      s.toestand.set(sl(id, j, k), { status: "BEREKEND", berekendOp: tijd });
    },
    telEvenKijken: async () => s.evenKijken,
    deadlines: (tijd) => deadlineLijst(tijd, 1),
    meldingVerstuurd: async (sleutel) => s.kv.has(sleutel),
    markeerVerstuurd: async (sleutel, tijd) => {
      s.kv.set(sleutel, tijd.toISOString());
    },
    stuurMelding: async (m) => {
      s.meldingen.push(m);
      return "sent";
    },
    laatsteEvenKijkenHerinnering: async () => {
      const v = s.kv.get(KV_EVEN_KIJKEN);
      return v ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date(v)) : null;
    },
    bewaarUitslag: async (u) => {
      s.uitslagen.push(u);
    },
    meldFout: (stap, _e, administratieId) => {
      s.fouten.push({ stap, administratieId });
    },
    ...over,
  };
  const run = (tijd?: string) => {
    if (tijd) nu = OP(tijd);
    return draaiNachtronde(d, nu);
  };
  return { d, s, run };
}

describe("nachtronde: vlag en volgorde", () => {
  it("doet niets zolang de vlag uit staat", async () => {
    const { d, run } = maak({ flagAan: async () => false });
    const r = await run();
    expect(r).toEqual({ status: "uit" });
    expect(d.boekFacturen).not.toHaveBeenCalled();
    expect(d.verwerkBank).not.toHaveBeenCalled();
  });

  it("boekt facturen, koppelt bank en bewaart een uitslag zonder fouten", async () => {
    const { d, s, run } = maak();
    const r = await run();
    expect(r.status).toBe("gedraaid");
    if (r.status !== "gedraaid") return;
    expect(r.uitslag.fouten).toBe(0);
    expect(d.boekFacturen).toHaveBeenCalledTimes(1);
    // terugblik van 60 dagen, vanaf de bevroren klok
    expect(vi.mocked(d.boekFacturen).mock.calls[0]?.[1].toISOString()).toBe("2026-09-13T02:40:00.000Z");
    expect(d.verwerkBank).toHaveBeenCalledWith("adm1");
    expect(s.uitslagen).toHaveLength(1);
  });
});

describe("nachtronde: een fout stopt de rest niet", () => {
  it("een mislukte factuurstap laat bank en btw gewoon doorgaan", async () => {
    const { d, s, run } = maak({
      boekFacturen: vi.fn(async () => {
        throw new Error("Jan de Vries, NL91ABNA0417164300");
      }),
    });
    s.stempels.set("adm1:2026:4", { aantal: 3, laatsteAanmaak: OP("2026-11-10T10:00:00+01:00") });
    const r = await run();
    expect(d.verwerkBank).toHaveBeenCalled();
    expect(s.concepten).toEqual([{ id: "adm1", jaar: 2026, kwartaal: 4 }]);
    if (r.status !== "gedraaid") throw new Error("verwacht gedraaid");
    expect(r.uitslag.fouten).toBe(1);
    const stappen = r.uitslag.administraties[0]?.stappen ?? [];
    expect(stappen.map((x) => [x.stap, x.ok])).toEqual([["facturen", false], ["bank", true], ["btw", true]]);
    // de uitslag en het logboek krijgen nooit de tekst van de fout
    expect(JSON.stringify(r.uitslag)).not.toContain("Jan");
    expect(JSON.stringify(r.uitslag)).not.toContain("NL91");
    expect(s.fouten).toEqual([{ stap: "facturen", administratieId: "adm1" }]);
  });

  it("een fout bij de eerste administratie raakt de tweede niet", async () => {
    const { d, run } = maak({
      administraties: async () => ["a", "b"],
      verwerkBank: vi.fn(async (id: string) => {
        if (id === "a") throw new Error("kapot");
        return { bekeken: 0, geboekt: 0, gekoppeld: 0, evenKijken: 0, mislukt: 0 };
      }),
    });
    const r = await run();
    expect(d.boekFacturen).toHaveBeenCalledTimes(2);
    expect(d.verwerkBank).toHaveBeenCalledTimes(2);
    if (r.status !== "gedraaid") throw new Error("verwacht gedraaid");
    expect(r.uitslag.fouten).toBe(1);
  });

  it("zonder administratielijst lopen de deadlinemeldingen toch", async () => {
    const { s, run } = maak({
      administraties: async () => {
        throw new Error("database weg");
      },
    });
    const r = await run("2026-10-17T10:00:00+02:00");
    expect(s.meldingen.map((m) => m.key)).toEqual(["boekronde-deadline:btw-2026-k3:14"]);
    if (r.status !== "gedraaid") throw new Error("verwacht gedraaid");
    expect(r.uitslag.fouten).toBe(1);
    expect(s.fouten[0]?.stap).toBe("administraties");
  });

  it("een kapotte logger of uitslagopslag stopt de ronde niet", async () => {
    const { run } = maak({
      boekFacturen: vi.fn(async () => {
        throw new Error("x");
      }),
      meldFout: () => {
        throw new Error("logger kapot");
      },
      bewaarUitslag: async () => {
        throw new Error("kv weg");
      },
    });
    const r = await run();
    expect(r.status).toBe("gedraaid");
  });
});

describe("nachtronde: btw-concept", () => {
  const stempelNa = (s: Staat, tijd: string, aantal = 4) => s.stempels.set("adm1:2026:4", { aantal, laatsteAanmaak: OP(tijd) });

  it("maakt een eerste concept als er boekingen zijn, en daarna niet nog eens (idempotent)", async () => {
    const { s, run } = maak();
    stempelNa(s, "2026-11-10T10:00:00+01:00");
    await run("2026-11-12T03:40:00+01:00");
    await run("2026-11-13T03:40:00+01:00");
    expect(s.concepten).toHaveLength(1);
  });

  it("maakt geen concept voor een kwartaal zonder boekingen", async () => {
    const { s, run } = maak();
    await run();
    expect(s.concepten).toHaveLength(0);
  });

  it("rekent opnieuw als er na het concept boekingen bij kwamen", async () => {
    const { s, run } = maak();
    stempelNa(s, "2026-11-10T10:00:00+01:00");
    await run("2026-11-12T03:40:00+01:00");
    stempelNa(s, "2026-11-12T20:00:00+01:00", 5);
    await run("2026-11-13T03:40:00+01:00");
    expect(s.concepten).toHaveLength(2);
  });

  it("raakt een goedgekeurd of ingediend concept nooit aan", async () => {
    const { s, run } = maak();
    stempelNa(s, "2026-11-12T01:00:00+01:00");
    s.toestand.set("adm1:2026:4", { status: "GOEDGEKEURD", berekendOp: OP("2026-11-11T12:00:00+01:00") });
    const r = await run("2026-11-12T03:40:00+01:00");
    expect(s.concepten).toHaveLength(0);
    if (r.status !== "gedraaid") throw new Error("verwacht gedraaid");
    expect(r.uitslag.administraties[0]?.stappen.find((x) => x.stap === "btw")?.samenvatting).toContain("na goedkeuring gewijzigd");
  });

  it("neemt het vorige kwartaal mee zolang de aangifte nog open ligt", () => {
    expect(kwartalenVoorConcept(OP("2026-10-17T10:00:00+02:00"))).toEqual([{ jaar: 2026, kwartaal: 3 }, { jaar: 2026, kwartaal: 4 }]);
    // 1 november: de deadline van K3 (31 oktober) is voorbij
    expect(kwartalenVoorConcept(OP("2026-11-01T10:00:00+01:00"))).toEqual([{ jaar: 2026, kwartaal: 4 }]);
    // januari: K4 van het vorige jaar, deadline 31 januari
    expect(kwartalenVoorConcept(OP("2027-01-05T10:00:00+01:00"))).toEqual([{ jaar: 2026, kwartaal: 4 }, { jaar: 2027, kwartaal: 1 }]);
  });
});

describe("nachtronde: deadlinemeldingen", () => {
  it("drempelBesluit stuurt alleen de strakste, en markeert de grovere als gedaan", () => {
    expect(drempelBesluit(20, new Set())).toEqual({ stuur: null, markeer: [] });
    expect(drempelBesluit(14, new Set())).toEqual({ stuur: 14, markeer: [14] });
    expect(drempelBesluit(14, new Set([14]))).toEqual({ stuur: null, markeer: [14] });
    expect(drempelBesluit(5, new Set())).toEqual({ stuur: 7, markeer: [14, 7] });
    expect(drempelBesluit(1, new Set())).toEqual({ stuur: 2, markeer: [14, 7, 2] });
    expect(drempelBesluit(0, new Set([14, 7, 2]))).toEqual({ stuur: null, markeer: [14, 7, 2] });
  });

  it("stuurt 14, 7 en 2 dagen vooraf elk precies één keer, ook als de ronde vaker draait", async () => {
    const { s, run } = maak();
    for (const tijd of [
      "2026-10-16T03:40:00+02:00", // 15 dagen: nog niets
      "2026-10-17T03:40:00+02:00", // 14
      "2026-10-17T15:00:00+02:00", // zelfde dag nog eens
      "2026-10-18T03:40:00+02:00",
      "2026-10-24T03:40:00+02:00", // 7
      "2026-10-24T04:40:00+02:00",
      "2026-10-29T03:40:00+01:00", // 2 (wintertijd sinds 25 oktober)
      "2026-10-29T05:40:00+01:00",
      "2026-10-30T03:40:00+01:00", // 1 dag: niets nieuws
    ]) {
      await run(tijd);
    }
    expect(s.meldingen.map((m) => m.key)).toEqual([
      "boekronde-deadline:btw-2026-k3:14",
      "boekronde-deadline:btw-2026-k3:7",
      "boekronde-deadline:btw-2026-k3:2",
    ]);
    expect(s.meldingen.map((m) => m.severity)).toEqual(["warning", "warning", "critical"]);
    expect(s.meldingen.every((m) => m.url === "/admin/boekhouding")).toBe(true);
  });

  it("slaat de ICP-opgave over (zelfde dag als de btw-aangifte) en noemt hem in de btw-melding", async () => {
    const { s, run } = maak();
    await run("2026-10-17T03:40:00+02:00");
    expect(s.meldingen.some((m) => m.key.includes("icp-"))).toBe(false);
    expect(s.meldingen[0]?.detail).toContain("ICP");
    expect(s.meldingen[0]?.detail).toContain("dient zelf niets in");
  });

  it("na een stilstand van een paar dagen komt alleen de strakste drempel, niet ook de oude", async () => {
    const { s, run } = maak();
    await run("2026-10-30T03:40:00+01:00");
    expect(s.meldingen.map((m) => m.key)).toEqual(["boekronde-deadline:btw-2026-k3:2"]);
    await run("2026-10-31T03:40:00+01:00");
    expect(s.meldingen).toHaveLength(1);
  });

  it("een mislukte melding wordt niet als verstuurd gemarkeerd en de volgende nacht opnieuw geprobeerd", async () => {
    let lukt = false;
    const verstuurd: string[] = [];
    const { s, run } = maak({
      stuurMelding: async (m) => {
        if (!lukt) return "failed";
        verstuurd.push(m.key);
        return "sent";
      },
    });
    const r1 = await run("2026-10-17T03:40:00+02:00");
    if (r1.status !== "gedraaid") throw new Error("verwacht gedraaid");
    expect(r1.uitslag.fouten).toBe(1);
    expect([...s.kv.keys()]).toEqual([]);
    lukt = true;
    await run("2026-10-18T03:40:00+02:00");
    expect(verstuurd).toEqual(["boekronde-deadline:btw-2026-k3:14"]);
  });

  it("rekent dagen in Amsterdamse tijd, niet in UTC", () => {
    const deadline = deadlineLijst(OP("2026-10-17T10:00:00+02:00"), 1).find((x) => x.sleutel === "btw-2026-k3");
    if (!deadline) throw new Error("deadline ontbreekt");
    // 30 oktober 23:30 UTC is 31 oktober 00:30 in Amsterdam (wintertijd, +01:00): dezelfde dag als de deadline
    expect(dagenTot(OP("2026-10-30T23:30:00Z"), deadline.datum)).toBe(0);
    expect(dagenTot(OP("2026-10-30T22:30:00Z"), deadline.datum)).toBe(1);
    expect(dagenTot(OP("2026-10-17T10:00:00+02:00"), deadline.datum)).toBe(14);
  });

  it("de tekst is gewoon Nederlands en bevat de datum in Amsterdamse tijd", () => {
    const deadline = deadlineLijst(OP("2026-10-17T10:00:00+02:00"), 1).find((x) => x.sleutel === "btw-2026-k3");
    if (!deadline) throw new Error("deadline ontbreekt");
    const m = deadlineMelding(deadline, 14, 14);
    expect(m.title).toBe("Deadline over 14 dagen: Btw-aangifte 2026 kwartaal 3");
    expect(m.detail).toContain("31 oktober 2026");
    expect(deadlineMelding(deadline, 1, 2).title).toContain("morgen");
  });
});

describe("nachtronde: even kijken", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("meldt één keer, en pas na een week opnieuw", async () => {
    vi.setSystemTime(OP("2026-11-12T03:40:00+01:00"));
    const { s, run } = maak({}, { evenKijken: 4 });
    await run("2026-11-12T03:40:00+01:00");
    await run("2026-11-13T03:40:00+01:00");
    await run("2026-11-18T03:40:00+01:00"); // 6 dagen later: nog niet
    expect(s.meldingen.filter((m) => m.key.startsWith("boekronde-evenkijken"))).toHaveLength(1);
    await run("2026-11-19T03:40:00+01:00"); // 7 dagen later
    expect(EVEN_KIJKEN_HERINNERING_DAGEN).toBe(7);
    const alle = s.meldingen.filter((m) => m.key.startsWith("boekronde-evenkijken"));
    expect(alle.map((m) => m.key)).toEqual(["boekronde-evenkijken:2026-11-12", "boekronde-evenkijken:2026-11-19"]);
    expect(alle[0]?.detail).toContain("4 items liggen");
  });

  it("meldt niets als er niets te lang ligt", async () => {
    const { s, run } = maak();
    await run();
    expect(s.meldingen.some((m) => m.key.startsWith("boekronde-evenkijken"))).toBe(false);
  });
});

describe("nachtronde: volledig idempotent", () => {
  it("een tweede run op dezelfde dag maakt niets nieuws", async () => {
    const { s, run } = maak({}, { evenKijken: 2 });
    s.stempels.set("adm1:2026:4", { aantal: 3, laatsteAanmaak: OP("2026-10-10T10:00:00+02:00") });
    await run("2026-10-17T03:40:00+02:00");
    const aantalMeldingen = s.meldingen.length;
    const aantalConcepten = s.concepten.length;
    await run("2026-10-17T03:40:00+02:00");
    expect(s.meldingen).toHaveLength(aantalMeldingen);
    expect(s.concepten).toHaveLength(aantalConcepten);
  });
});
