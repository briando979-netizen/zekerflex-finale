import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// De beheeractie clear_chat_click_labels (14 nov 2026): kliklabels met namen of berichttekst op NULL, met precies de definitie van
// bewaarLabel (lib/analytics/label-privacy.ts): op een pad met /berichten of /chat alleen een label in codevorm. Droog: aantal en
// voorbeeld zonder de labeltekst; echt: één UPDATE met dezelfde voorwaarde. Optioneel ook de oude gespreksrijen buiten die paden.

const { queryRaw, executeRaw, stand } = vi.hoisted(() => {
  const stand = { aantal: 1357 };
  return {
    stand,
    queryRaw: vi.fn(async (q: Prisma.Sql) =>
      q.sql.startsWith("SELECT count")
        ? [{ n: stand.aantal }]
        : // net na middernacht in Amsterdam (23:30 UTC de dag ervoor): de dag in het voorbeeld is de Amsterdamse
          [{ pad: "/dashboard/berichten", soort: "INTERACTION", wanneer: new Date("2026-11-14T00:30:00+01:00"), tekens: 38 }],
    ),
    executeRaw: vi.fn(async (_q: Prisma.Sql) => stand.aantal),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw, $executeRaw: executeRaw } }));

import { MUTATIONS } from "@/lib/admin-console/mutations";
import { teWissenWhere } from "@/lib/analytics/label-opschoning";
import { bewaarLabel, CHAT_PAD_PATROON, CODE_PATROON, isOudeChatrijLabel, JIJ_PATROON } from "@/lib/analytics/label-privacy";

const actie = MUTATIONS["clear_chat_click_labels"]!;

afterEach(() => {
  vi.clearAllMocks();
  stand.aantal = 1357;
});

describe("clear_chat_click_labels", () => {
  it("is een gewone mutatie: medium, met parameters en zonder vrije SQL", () => {
    expect(actie.risk).toBe("medium");
    expect(actie.params.safeParse({}).success).toBe(true);
    expect(actie.params.safeParse({ ookOudeChatrijen: true }).success).toBe(true);
    expect(actie.params.safeParse({ ookOudeChatrijen: "ja" }).success).toBe(false);
  });

  it("droog: aantal, voorbeeld zonder labeltekst, onomkeerbaar, en niets geschreven", async () => {
    const impact = await actie.dryRun({ ookOudeChatrijen: false }, {});
    expect(impact.affectedCount).toBe(1357);
    expect(impact.reversible).toBe(false);
    expect(impact.summary).toBe("1357 kliklabel(s) met namen of berichttekst worden leeggemaakt; de klikken zelf blijven staan.");
    expect(impact.sample).toEqual([{ pad: "/dashboard/berichten", soort: "INTERACTION", dag: "2026-11-14", tekens: 38 }]);
    expect(Object.keys(impact.sample[0]!)).not.toContain("label");
    expect(impact.warnings.some((w) => w.includes("ookOudeChatrijen: true"))).toBe(true);
    expect(executeRaw).not.toHaveBeenCalled();
    // telling en voorbeeld gebruiken dezelfde voorwaarde als het wissen
    const [telling, voorbeeld] = queryRaw.mock.calls.map((c) => c[0]);
    const where = teWissenWhere(false);
    expect(telling!.sql).toContain(where.sql);
    expect(voorbeeld!.sql).toContain(where.sql);
    expect(voorbeeld!.sql).toContain("LIMIT 10");
    // het voorbeeld haalt alleen de lengte van het label op, nooit de tekst
    const kolommen = voorbeeld!.sql.split("FROM")[0]!;
    expect(kolommen).toContain("length(label) AS tekens");
    expect(kolommen.replace("length(label)", "")).not.toContain("label");
  });

  it("echt: één UPDATE die het label op NULL zet met dezelfde voorwaarde, en alleen een aantal terug", async () => {
    const r = await actie.execute({ ookOudeChatrijen: false }, {});
    expect(executeRaw).toHaveBeenCalledOnce();
    const q = executeRaw.mock.calls[0]![0];
    expect(q.sql).toMatch(/^UPDATE "AnalyticsEvent" SET label = NULL WHERE /);
    expect(q.sql).toContain(teWissenWhere(false).sql);
    expect(q.values).toEqual(teWissenWhere(false).values);
    expect(r).toEqual({ affectedCount: 1357, detail: "1357 kliklabel(s) leeggemaakt." });
  });

  it("met ookOudeChatrijen komt de tweede voorwaarde erbij; zonder niet", async () => {
    await actie.execute({ ookOudeChatrijen: true }, {});
    const q = executeRaw.mock.calls[0]![0];
    expect(q.values).toContain(JIJ_PATROON);
    expect(teWissenWhere(false).values).not.toContain(JIJ_PATROON);
    const impact = await actie.dryRun({ ookOudeChatrijen: true }, {});
    expect(impact.summary).toContain("(ook de oude gespreksrijen buiten de chat)");
    expect(impact.warnings.some((w) => w.includes("ookOudeChatrijen: true"))).toBe(false);
  });
});

describe("de voorwaarde volgt bewaarLabel", () => {
  it("gebruikt de patronen van label-privacy als parameters: pad met /berichten of /chat, label niet in codevorm", () => {
    const w = teWissenWhere(false);
    expect(w.sql).toContain("label IS NOT NULL");
    expect(w.sql).toContain("split_part(path, '?', 1) ~ ");
    expect(w.sql).toContain("btrim(label) !~ ");
    expect(w.values).toEqual([CHAT_PAD_PATROON, CODE_PATROON]);
  });

  it("de patronen werken in JavaScript hetzelfde als bewaarLabel (zonder lookbehind, ook geldig als POSIX-regex)", () => {
    const chatPad = new RegExp(CHAT_PAD_PATROON);
    const code = new RegExp(CODE_PATROON);
    const zouWissen = (pad: string, label: string) => chatPad.test(pad) && !code.test(label.trim());
    const gevallen: Array<[string, string]> = [
      ["/dashboard/berichten", "BVJan de Vries14:06Jij: zie je morgen"],
      ["/werkgever/berichten/abc", "JJJan Jansen09:12Hoi, kan je zaterdag?"],
      ["/dashboard/berichten", "nieuw-gesprek"],
      ["/berichten", "PKPiet Klaassen10:01Ok"],
      ["/werkgever/website/chat", "Bezoeker 14:05 Hallo, zijn jullie open?"],
      ["/kennis/chatten-met-klanten", "Lees verder"],
      ["/dashboard/verificatie", "Foto maken"],
    ];
    for (const [pad, label] of gevallen) {
      expect(zouWissen(pad, label), `${pad} ${label}`).toBe(bewaarLabel(pad, label) === null);
    }
    expect(CHAT_PAD_PATROON).not.toContain("(?<");
    expect(CODE_PATROON).not.toContain("(?<");
  });

  it("een oude gespreksrij buiten de chatpaden: initialen vast aan een naam met een kloktijd, of 'Jij: '", () => {
    expect(isOudeChatrijLabel("BVJan de Vries14:06Jij: zie je morgen")).toBe(true);
    expect(isOudeChatrijLabel("JJJan Jansen09:12Hoi, kan je zaterdag?")).toBe(true);
    expect(isOudeChatrijLabel("JJanssen10:01Ok")).toBe(true);
    expect(isOudeChatrijLabel("Antwoord Jij: tot morgen")).toBe(true);
    // een klus- of agendaregel met een tijd is geen gespreksrij
    expect(isOudeChatrijLabel("Bediening avond16:00 - 23:00")).toBe(false);
    expect(isOudeChatrijLabel("12 nov 09:00")).toBe(false);
    expect(isOudeChatrijLabel("Week 45 · 02-11 t/m 08-11")).toBe(false);
    expect(isOudeChatrijLabel("BTW aftrekken 09:00")).toBe(false);
    expect(isOudeChatrijLabel("Mijn gegevens")).toBe(false);
    expect(isOudeChatrijLabel(null)).toBe(false);
  });
});
