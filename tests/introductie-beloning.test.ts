import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { introductieTodos } from "@/lib/admin/todo-introductie";
import { TODO_KLAAR_SLEUTEL } from "@/lib/introducties/kv";
import { ERASABLE_KV_PREFIXES, erasableKvWhere, keyBelongsTo } from "@/lib/privacy/user-kv";

// "Introduceer een bedrijf": de taak voor het bol-tegoed in Beheer → Te doen, en waar de code inhaakt op het geld
// (goedkeuren van uren, de twee betaalwegen) zonder iets te veranderen voor bedrijven zonder introductie.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("de taak in Te doen", () => {
  const regel = {
    introId: "abc123defg",
    todoId: "intro-bol:abc123defg",
    tenantId: "t1",
    bedrijf: "Bakkerij De Korf",
    naam: "Wendy Werker",
    email: "wendy@zekerflex.test",
    factuurNummer: "ZF-PF-2026-000042",
    betaaldOp: "2026-12-05T09:00:00.000Z",
  };

  it("één taak per beloning, met een vinkje (gedaan) en nooit automatisch", () => {
    const [t] = introductieTodos([regel], {});
    expect(t).toMatchObject({ id: "intro-bol:abc123defg", group: "Geld & bank", auto: false, done: false });
    expect(t?.title).toBe("Stuur €50 bol-tegoed naar Wendy Werker (introductie Bakkerij De Korf)");
    expect(t?.why).toContain("ZF-PF-2026-000042");
    expect(t?.why).toContain("5 december 2026");
    expect(t?.how.join(" ")).toContain("wendy@zekerflex.test");
    expect(t?.id.length).toBeLessThanOrEqual(40); // app/api/admin/todos: id max 40
  });

  it("afgevinkt = verstuurd, met wie en wanneer", () => {
    const [t] = introductieTodos([regel], { "intro-bol:abc123defg": { at: "2026-12-06T09:00:00.000Z", by: "Eigenaar" } });
    expect(t?.done).toBe(true);
    expect(t?.doneNote).toBe("verstuurd: afgevinkt door Eigenaar op 6 december 2026");
    // een gewist account: geen adres, wel uitleg
    const [z] = introductieTodos([{ ...regel, email: null, naam: "een verwijderd account" }], {});
    expect(z?.how[0]).toContain("bestaat niet meer");
    // een id als constructor uit een vreemde lijst telt niet als afgevinkt
    expect(introductieTodos([{ ...regel, todoId: "constructor" }], {})[0]?.done).toBe(false);
  });

  it("de stand 'verstuurd' leest dezelfde sleutel als Te doen, en de taken staan in de lijst", () => {
    expect(TODO_KLAAR_SLEUTEL).toBe("owner-todos:done");
    const todos = bron("lib/admin/owner-todos.ts");
    expect(todos).toContain(`kvGet<Record<string, { at: string; by: string }>>("owner-todos:done")`);
    expect(todos).toContain("introductieTodos(await verschuldigdeBeloningen().catch(() => []), manual)");
    expect(todos).toContain("...introductieBeloningen,");
  });
});

describe("AVG", () => {
  it("de eigen introducties gaan mee met inzage en wissen, voor precies die gebruiker", () => {
    expect(ERASABLE_KV_PREFIXES).toContain("introducties:");
    expect(keyBelongsTo("introducties:usr_1", "usr_1")).toBe(true);
    const waar = erasableKvWhere("usr_1").OR;
    expect(waar).toContainEqual({ key: { equals: "introducties:usr_1" } });
    expect(JSON.stringify(waar)).not.toContain("introducties:usr_2");
  });
});

describe("waar het inhaakt op het geld", () => {
  it("goedkeuren: alleen de platformkosten van een gekoppeld bedrijf in de gratis weken, met de reden; de rest blijft gelijk", () => {
    const s = bron("lib/timesheets/approve.ts");
    expect(s).toContain("const introductieVrij = !freeFee && (await introductieZonderFee(ts.branch.tenantId, ts.scheduledStart));");
    expect(s).toContain("platformFeePerHourCents: freeFee || introductieVrij || partnerdealVrij ? 0 : feePerHourFor(monthHours),");
    expect(s).toContain("...(introductieVrij ? { platformFeeReden: INTRODUCTIE_FEE_REDEN } : {}),");
    // de € 0-factuur wordt meteen op betaald gezet en krijgt geen mail, net als bij een kosteloos bedrijf
    expect(s).toContain("{ paid: billing.platformFeeInvoice.totalCents === 0 },");
    // uitzendkrachten (verloning) hebben geen platformkosten-factuur: daar verandert niets
    const payroll = s.slice(s.indexOf("async function approveViaPayroll("));
    expect(payroll).not.toContain("introductie");
  });

  it("Stripe: na het op betaald zetten, binnen het blok dat maar één keer loopt", () => {
    const s = bron("app/api/webhooks/stripe/route.ts");
    const blok = s.slice(s.indexOf("async function markInvoicePaid("), s.indexOf("const DECLINE_TEXT"));
    expect(blok).toContain("recipientTenantId: true,");
    const eenmalig = blok.slice(blok.indexOf("if (invoice.status !== InvoiceStatus.PAID) {"), blok.indexOf("} else {"));
    expect(eenmalig.indexOf("status: InvoiceStatus.PAID,")).toBeLessThan(eenmalig.indexOf("await beloonIntroductieNaBetaling(invoice);"));
    expect(eenmalig).toContain("await beloonIntroductieNaBetaling(invoice);");
  });

  it("betaald per overschrijving: pas nadat de factuur echt op betaald staat", () => {
    const s = bron("lib/billing/overschrijving-betaald.ts");
    const zet = s.slice(s.indexOf("export async function meldBetaaldPerOverschrijving("));
    expect(zet.indexOf("if (gezet.count !== 1)")).toBeLessThan(zet.indexOf("await beloonIntroductieNaBetaling(factuur, nu);"));
    expect(s).toContain("recipientTenantId: true,");
  });

  it("de lead van een introductie heeft geen campagne, en de sales-motor mailt alleen leads van een campagne", () => {
    const opslag = bron("lib/introducties/opslag.ts");
    const aanmaken = opslag.slice(opslag.indexOf("await createLead({"), opslag.indexOf("leadId = lead.id;"));
    expect(aanmaken).not.toMatch(/campaignId|nextActionAt/);
    const motor = bron("lib/sales/engine.ts");
    const due = motor.slice(motor.indexOf("async function processDueLeads("));
    expect(due).toContain("campaignId: campaign.id,");
    // bij een bestaande lead (ook een in een campagne): de velden die de motor mailt alleen zonder campagne aanvullen
    expect(opslag).toContain("...aanvullingVoorLead(bestaand.lead, { contactNaam, email, telefoon }),");
    expect(opslag).not.toMatch(/\.\.\.aanvulling\(bestaand/);
  });

  it("de motor geeft de contacten van een introductie nooit aan de LLM van een automatische mail, en verrijken laat ze staan", () => {
    const outreach = bron("lib/sales/outreach.ts");
    expect(outreach).toContain("const enrichment = zonderIntroContacten(lead.enrichmentJson);");
    expect(outreach).not.toContain("const enrichment = (lead.enrichmentJson ?? {}) as Record<string, unknown>;");
    const leads = bron("lib/sales/leads.ts");
    const verrijk = leads.slice(leads.indexOf("export async function enrichLead("), leads.indexOf("export async function scoreLead("));
    expect(verrijk).toContain("...behoudIntroContacten(lead.enrichmentJson),");
  });

  it("koppelen: de koppeling zelf als laatste, na de claims, de lead, het auditspoor en de al betaalde factuur", () => {
    const opslag = bron("lib/introducties/opslag.ts");
    const koppel = opslag.slice(opslag.indexOf("export async function koppelIntroductie("), opslag.indexOf("/** Bedrijven zoeken om te koppelen"));
    const plek = (s: string) => {
      const i = koppel.indexOf(s);
      expect(i, s).toBeGreaterThan(-1);
      return i;
    };
    const volgorde = [
      "await eisNieuwBedrijf(tenant, eerste.userId, introOp);",
      "await claim<KoppelClaim>(leadClaimSleutel(lead.id)",
      "await claim(bedrijfClaimSleutel(tenant.id)",
      "await prisma.salesLead.update(",
      "await recordAudit(",
      "paidAt: { gt: introOp }",
      "await kvSet(koppelSleutel(tenant.id), koppeling);",
    ].map(plek);
    expect([...volgorde].sort((a, b) => a - b)).toEqual(volgorde);
    expect(koppel).not.toContain("kvSetIfAbsent(koppelSleutel");
  });
});
