import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// De zakelijke chat (15 nov): bedrijven krijgen een weergave zoals WhatsApp Business (bedrijfsnaam met "Zakelijk",
// Zakelijke tools, gekleurde labels, voorgestelde labels, "/" voor snelle antwoorden en zakelijke standaarden); werkers
// houden de gewone weergave.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { labelKlasse, labelsMetVoorstellen, slashTreffers, VOORGESTELDE_KLEUREN, ZAKELIJKE_ROLLEN } from "@/lib/chat/zakelijk";
import { isZakelijk } from "@/lib/messaging/zakelijk-rol";
import { DEFAULT_SETTINGS, getChatSettings, saveChatSettings, ZAKELIJK_STANDAARD } from "@/lib/messaging/settings";
import { CHAT_NL } from "@/lib/chat/teksten";
import type { Principal } from "@/lib/auth";

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const persoon = (...rollen: string[]) => ({ userId: "u1", grants: rollen.map((role) => ({ role })), memberships: [] }) as unknown as Principal;

beforeEach(() => kv.clear());

describe("wie is zakelijk", () => {
  it("een bedrijf wel (zelfde rollen als /berichten → /werkgever); een werker of platformbeheerder niet", () => {
    expect(isZakelijk(persoon("HQ_ADMIN"))).toBe(true);
    expect(isZakelijk(persoon("LOCAL_MANAGER"))).toBe(true);
    expect(isZakelijk(persoon("FREELANCER"))).toBe(false);
    expect(isZakelijk(persoon("PLATFORM_ADMIN", "HQ_ADMIN"))).toBe(false);
    for (const rol of ZAKELIJKE_ROLLEN) expect(lees("app/berichten/page.tsx")).toContain(`"${rol}"`);
  });
});

describe("labels en snelle antwoorden", () => {
  const voorgesteld = CHAT_NL.inbox.zakelijkeLabels;

  it("voorgestelde labels in hun vaste kleur; een eigen label altijd in dezelfde kleur; alleen kleuren met donkere modus", () => {
    expect(voorgesteld).toHaveLength(VOORGESTELDE_KLEUREN.length);
    expect(labelKlasse("Gesprek gepland", voorgesteld)).toBe("bg-plan-soft text-plan-ink");
    expect(labelKlasse("Uren controleren", voorgesteld)).toBe("bg-amber-50 text-amber-800");
    expect(labelKlasse("Mijn eigen label", voorgesteld)).toBe(labelKlasse("Mijn eigen label", voorgesteld));
    const css = lees("app/globals.css");
    const klassen = new Set([...voorgesteld, "a", "b", "c", "d", "e", "f", "g"].flatMap((l) => labelKlasse(l, voorgesteld).split(" ")));
    for (const k of klassen) expect(css, k).toContain(`[data-theme="dark"] .${k}`);
  });

  it("eigen labels eerst, dan de voorgestelde die je nog niet hebt", () => {
    expect(labelsMetVoorstellen(["VIP", "Ingepland"], ["Nieuwe kandidaat", "Ingepland"])).toEqual(["VIP", "Ingepland", "Nieuwe kandidaat"]);
  });

  it('"/" zoekt in de snelle antwoorden; zonder "/" of over meer regels niet', () => {
    const snel = ["Kun je morgen om 9:00 beginnen?", "Vergeet niet je uren in te vullen.", "Bedankt!"];
    expect(slashTreffers("/", snel)?.lijst).toEqual(snel);
    expect(slashTreffers("/uren", snel)?.lijst).toEqual(["Vergeet niet je uren in te vullen."]);
    expect(slashTreffers("/bestaat niet", snel)?.lijst).toEqual([]);
    expect(slashTreffers("uren", snel)).toBeNull();
    expect(slashTreffers("/uren\nen meer", snel)).toBeNull();
  });
});

describe("zakelijke standaarden", () => {
  it("een bedrijf krijgt zakelijke snelle antwoorden en afwezigheidsbericht, een werker de gewone; eigen keuzes winnen", async () => {
    expect((await getChatSettings("bedrijf", { zakelijk: true })).quickReplies).toEqual(ZAKELIJK_STANDAARD.quickReplies);
    expect((await getChatSettings("werker")).quickReplies).toEqual(DEFAULT_SETTINGS.quickReplies);
    // alleen het afwezigheidsbericht aanzetten bewaart de zakelijke snelle antwoorden, niet die van een werker
    await saveChatSettings("bedrijf", { autoReply: { enabled: true } }, { zakelijk: true });
    const na = await getChatSettings("bedrijf", { zakelijk: true });
    expect(na.quickReplies).toEqual(ZAKELIJK_STANDAARD.quickReplies);
    expect(na.autoReply).toMatchObject({ enabled: true, text: ZAKELIJK_STANDAARD.autoReply.text });
    await saveChatSettings("bedrijf", { quickReplies: ["Eigen antwoord"] }, { zakelijk: true });
    expect((await getChatSettings("bedrijf", { zakelijk: true })).quickReplies).toEqual(["Eigen antwoord"]);
  });
});

describe("waar het staat", () => {
  it("alleen de werkgeverspagina zet de zakelijke weergave aan; de werker-app blijft gewoon", () => {
    expect(lees("app/werkgever/berichten/page.tsx")).toContain("zakelijk={zakelijk} bedrijfsnaam={bedrijf?.name ?? \"\"}");
    expect(lees("app/dashboard/berichten/page.tsx")).not.toContain("zakelijk");
    const inbox = lees("components/chat/InboxPage.tsx");
    expect(inbox).toContain("{zakelijk && (\n              <button type=\"button\" onClick={() => setZakelijkOpen(true)}");
    expect(inbox).toContain("lists={zakelijk ? labelsMetVoorstellen(chatPrefs.lists, ib.zakelijkeLabels) : chatPrefs.lists}");
    expect(lees("components/chat/Composer.tsx")).toContain("const slash = zakelijk && !editing && !slashDicht ? slashTreffers(text, quickReplies) : null;");
  });
});
