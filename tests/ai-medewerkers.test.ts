import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// AI-medewerkers (15 nov 2026, eigenaar: "maak agenten aan voor ZekerFlex"). Twee nieuwe agenten op de AI-teams: de
// Welkomstcoach (nieuwe bedrijven zonder eerste klus) en de Servicedesk (conceptantwoord op een websitechat die wacht).
// Alles wat naar buiten gaat is een voorstel; pas na Uitvoeren gaat er iets uit. Plus één overzicht van alle agenten.

const NU = new Date("2026-11-15T07:00:00+01:00");
const DAG = 86_400_000;
const UUR = 3_600_000;

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  tenants: [] as unknown[],
  gesprekken: [] as unknown[],
  modelProbleem: null as string | null,
  modelTekst: "",
  shiftCount: 0,
  mails: [] as { to: string; subject: string; kind?: string }[],
  geplaatst: [] as { id: string; msg: { role: string; content: string } }[],
  gesprek: null as unknown,
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? structuredClone(h.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, structuredClone(v)),
  kvAppend: async () => undefined,
  kvListValues: async () => [],
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findMany: async () => h.tenants, findUnique: async () => ({ name: "Bakkerij De Korst" }) },
    shift: { count: async () => h.shiftCount },
    membership: { findMany: async () => [{ user: { email: "eigenaar@bakkerij.example", fullName: "Sanne de Korst" } }] },
  },
}));
vi.mock("@/lib/ai/client", () => ({
  llmConfigProblem: () => h.modelProbleem,
  chat: async () => ({ text: h.modelTekst }),
}));
vi.mock("@/lib/chat/webchat", () => ({
  listConversations: async (status: string) => (h.gesprekken as { status: string }[]).filter((c) => c.status === status),
  getConversation: async () => h.gesprek,
  appendMessage: async (id: string, msg: { role: string; content: string }) => void h.geplaatst.push({ id, msg }),
}));
vi.mock("@/lib/mail", () => ({ sendMail: async (m: { to: string; subject: string; kind?: string }) => void h.mails.push(m) }));
vi.mock("@/lib/webhooks/manage", () => ({ resendDelivery: async () => ({ ok: true, status: 200 }) }));
vi.mock("@/lib/company/verified", () => ({ notifyPendingReactions: async () => 0, setTenantApproval: async () => undefined }));
vi.mock("@/lib/ai-teams/invest", () => ({ commitInvestment: async () => "" }));

import { schoonAntwoord, servicedeskConcepten, wachtendeVraag, welkomKandidaat, welkomstcoach, MAX_CONCEPTEN } from "@/lib/ai-teams/medewerkers";
import { executeProposal } from "@/lib/ai-teams/execute";
import { AI_MEDEWERKERS } from "@/lib/ai-medewerkers/register";
import type { Proposal } from "@/lib/ai-teams";

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
type Voorstel = Omit<Proposal, "id" | "at" | "status">;
const tools = () => {
  const voorgesteld: Voorstel[] = [];
  return { voorgesteld, t: { log: async () => undefined, propose: async (p: Voorstel) => void voorgesteld.push(p) } };
};
// geen .example-adres: dat telt (terecht) als testadres en krijgt nooit een welkomstmail
const tenant = (id: string, dagen: number, klussen: number, email = "eigenaar@voorbeeld.nl") => ({
  id,
  name: `Bedrijf ${id}`,
  createdAt: new Date(NU.getTime() - dagen * DAG),
  branches: [{ _count: { shifts: klussen } }],
  memberships: [{ user: { email } }],
});
const gesprek = (id: string, urenGeleden: number, laatsteRol = "user", status = "open") => ({
  id,
  status,
  lastAt: new Date(NU.getTime() - urenGeleden * UUR).toISOString(),
  messages: [
    { role: "assistant", content: "Hoi! Waarmee kan ik helpen?", at: new Date(NU.getTime() - (urenGeleden + 1) * UUR).toISOString() },
    { role: laatsteRol, content: "Hoeveel kost een kracht per uur in Groningen?", at: new Date(NU.getTime() - urenGeleden * UUR).toISOString() },
  ],
});

beforeEach(() => {
  h.kv.clear();
  h.tenants = [];
  h.gesprekken = [];
  h.modelProbleem = null;
  h.modelTekst = "";
  h.shiftCount = 0;
  h.mails = [];
  h.geplaatst = [];
  h.gesprek = null;
});

describe("Welkomstcoach", () => {
  it("alleen bedrijven van 2 tot 30 dagen oud, zonder klus, met een echt mailadres", () => {
    expect(welkomKandidaat({ createdAt: new Date(NU.getTime() - 10 * DAG), klussen: 0, beheerders: ["a@bedrijf.nl"] }, NU)).toBe(true);
    expect(welkomKandidaat({ createdAt: new Date(NU.getTime() - 1 * DAG), klussen: 0, beheerders: ["a@bedrijf.nl"] }, NU)).toBe(false);
    expect(welkomKandidaat({ createdAt: new Date(NU.getTime() - 40 * DAG), klussen: 0, beheerders: ["a@bedrijf.nl"] }, NU)).toBe(false);
    expect(welkomKandidaat({ createdAt: new Date(NU.getTime() - 10 * DAG), klussen: 1, beheerders: ["a@bedrijf.nl"] }, NU)).toBe(false);
    expect(welkomKandidaat({ createdAt: new Date(NU.getTime() - 10 * DAG), klussen: 0, beheerders: ["test@zekerflex.test"] }, NU)).toBe(false);
  });

  it("zet een voorstel klaar, per bedrijf één keer (ook een afgewezen voorstel telt)", async () => {
    h.tenants = [tenant("t1", 10, 0), tenant("t2", 12, 0), tenant("t3", 5, 2)];
    h.kv.set("ai-teams-proposals", [{ id: "x", team: "onboarding", at: NU.toISOString(), title: "", detail: "", action: { type: "welkom-opvolging", tenantId: "t2" }, status: "dismissed" }]);
    const { voorgesteld, t } = tools();
    expect(await welkomstcoach(NU, t)).toBe(1);
    expect(voorgesteld).toHaveLength(1);
    expect(voorgesteld[0]?.action).toEqual({ type: "welkom-opvolging", tenantId: "t1" });
    expect(voorgesteld[0]?.detail).toContain("pas iets uit als je op Uitvoeren klikt");
  });

  it("uitvoeren: alleen als er nog steeds geen klus is, dan een mail aan de beheerder", async () => {
    h.shiftCount = 1;
    expect(await executeProposal({ type: "welkom-opvolging", tenantId: "t1" })).toContain("niets verstuurd");
    expect(h.mails).toHaveLength(0);
    h.shiftCount = 0;
    expect(await executeProposal({ type: "welkom-opvolging", tenantId: "t1" })).toContain("welkomstmail verstuurd naar 1");
    expect(h.mails[0]).toMatchObject({ to: "eigenaar@bakkerij.example", subject: "Hulp bij je eerste klus op ZekerFlex?", kind: "onboarding-reminder" });
  });
});

describe("Servicedesk", () => {
  it("een vraag wacht pas na 4 uur, alleen als de bezoeker het laatst schreef en het gesprek open is", () => {
    expect(wachtendeVraag(gesprek("c1", 5) as never, NU)).toMatchObject({ uren: 5 });
    expect(wachtendeVraag(gesprek("c1", 3) as never, NU)).toBeNull();
    expect(wachtendeVraag(gesprek("c1", 5, "agent") as never, NU)).toBeNull();
    expect(wachtendeVraag(gesprek("c1", 5, "user", "closed") as never, NU)).toBeNull();
  });

  it("het antwoord van het model wordt netjes: geen 'Antwoord:' of aanhalingstekens, niet te lang, soepel met iets anders dan tekst", () => {
    expect(schoonAntwoord('Antwoord: "Sorry voor het wachten!"')).toBe("Sorry voor het wachten!");
    expect(schoonAntwoord("x".repeat(2000))).toHaveLength(1200);
    expect(schoonAntwoord({ niet: "tekst" })).toBe("");
  });

  it("zet een concept klaar voor wie wacht, en niet opnieuw voor dezelfde vraag", async () => {
    h.gesprekken = [gesprek("c1", 6), gesprek("c2", 1)];
    h.modelTekst = 'Antwoord: "Sorry dat het even duurde! Een collega zoekt het uit en mailt je via info@zekerflex.com."';
    const a = tools();
    expect(await servicedeskConcepten(NU, a.t)).toBe(1);
    expect(a.voorgesteld[0]?.action).toEqual({ type: "webchat-antwoord", conversationId: "c1", tekst: "Sorry dat het even duurde! Een collega zoekt het uit en mailt je via info@zekerflex.com." });
    // het voorstel staat er nu: geen tweede concept voor dezelfde vraag
    h.kv.set("ai-teams-proposals", [{ ...a.voorgesteld[0], id: "p1", at: NU.toISOString(), status: "open" }]);
    const b = tools();
    expect(await servicedeskConcepten(NU, b.t)).toBe(0);
  });

  it("zonder taalmodel geen concepten; nooit meer dan het maximum per ronde", async () => {
    h.gesprekken = Array.from({ length: MAX_CONCEPTEN + 3 }, (_, i) => gesprek(`c${i}`, 8));
    h.modelProbleem = "geen model";
    expect(await servicedeskConcepten(NU, tools().t)).toBe(0);
    h.modelProbleem = null;
    h.modelTekst = "Sorry voor het wachten, we komen erop terug.";
    expect(await servicedeskConcepten(NU, tools().t)).toBe(MAX_CONCEPTEN);
  });

  it("uitvoeren: het antwoord komt in de chat, maar niet in een gesloten gesprek", async () => {
    h.gesprek = { id: "c1", status: "closed", messages: [] };
    expect(await executeProposal({ type: "webchat-antwoord", conversationId: "c1", tekst: "Hoi" })).toContain("niets geplaatst");
    expect(h.geplaatst).toHaveLength(0);
    h.gesprek = { id: "c1", status: "open", messages: [] };
    expect(await executeProposal({ type: "webchat-antwoord", conversationId: "c1", tekst: "Hoi" })).toBe("antwoord in de websitechat geplaatst");
    expect(h.geplaatst[0]).toMatchObject({ id: "c1", msg: { role: "agent", content: "Hoi" } });
  });
});

describe("het overzicht van de AI-medewerkers", () => {
  it("elke medewerker heeft een unieke naam en een bestaande beheerpagina", () => {
    expect(new Set(AI_MEDEWERKERS.map((m) => m.id)).size).toBe(AI_MEDEWERKERS.length);
    for (const m of AI_MEDEWERKERS) {
      if (!m.pagina) continue;
      expect(existsSync(path.join(process.cwd(), "app", ...m.pagina.split("/").filter(Boolean), "page.tsx")), m.pagina).toBe(true);
    }
    // wie vanzelf iets naar buiten stuurt, zegt wat
    for (const m of AI_MEDEWERKERS.filter((x) => x.naarBuiten !== "nee")) expect(m.buiten.length, m.id).toBeGreaterThan(10);
  });

  it("de pagina is alleen voor platformbeheerders, staat in het beheermenu en is te bereiken vanuit de AI-studio", () => {
    const pagina = bron("app/admin/zekerflex-ai/medewerkers/page.tsx");
    expect(pagina).toContain('hasRole(principal, "PLATFORM_ADMIN")');
    expect(bron("lib/admin/nav.ts")).toContain('{ href: "/admin/zekerflex-ai/medewerkers", label: "AI-medewerkers" }');
    expect(bron("app/admin/zekerflex-ai/page.tsx")).toContain('href="/admin/zekerflex-ai/medewerkers"');
  });

  it("de teams roepen de twee nieuwe medewerkers aan", () => {
    const teams = bron("lib/ai-teams/extra-teams.ts");
    expect(teams).toContain("await welkomstcoach(now, t).catch(");
    expect(teams).toContain("await servicedeskConcepten(now, t).catch(");
  });
});
