import { beforeEach, describe, expect, it, vi } from "vitest";

// Een harde terugkaatser (lib/mail/bounce-ronde-db.ts): het gehashte adres-merk voor iedereen, maar de
// onderdrukkingslijst van de sales-pijplijn (adres in klare tekst) alleen als het adres van een lead is.
// Het adres van een gewone gebruiker (een verificatiemail die kaatst) hoort daar niet in.

const h = vi.hoisted(() => ({
  leads: [] as { id: string; status: string }[],
  onderdrukt: [] as string[],
  gemarkeerd: [] as string[],
  leadsBounced: [] as string[],
}));
vi.mock("@/lib/prisma", () => ({ prisma: { salesLead: { findMany: async () => h.leads } } }));
vi.mock("@/lib/flags", () => ({ featureEnabled: async () => true }));
vi.mock("@/lib/mail", () => ({ imapConfig: () => null }));
vi.mock("@/lib/mail/imap", () => ({ openLeesSessie: async () => ({ lijst: async () => [], ruw: async () => null, sluit: async () => undefined }) }));
vi.mock("@/lib/mail/store", () => ({ readSentMessage: async () => null, saveSentMessage: async () => undefined }));
vi.mock("@/lib/storage/kv", () => ({ kvSet: async () => undefined }));
vi.mock("@/lib/ops/alert", () => ({ alertOwner: async () => "sent" }));
vi.mock("@/lib/sales/suppression", () => ({ addSuppression: async (email: string) => void h.onderdrukt.push(email) }));
vi.mock("@/lib/sales/reply", () => ({ markLeadBounced: async (id: string) => void h.leadsBounced.push(id) }));
vi.mock("@/lib/mail/bounce-opslag", () => ({
  markeerHard: async (email: string) => void h.gemarkeerd.push(email),
  telZacht: async () => false,
  ruimBouncesOp: async () => 0,
  leesBerichtMerk: async () => null,
  zetBerichtMerk: async () => undefined,
  berichtMerken: async () => [],
}));

import { echteBounceAfhankelijkheden } from "@/lib/mail/bounce-ronde-db";

const regel = { ontvanger: "iemand@bedrijf.test", code: "5.1.1", soort: "hard" as const, diagnose: "user unknown" };

beforeEach(() => {
  h.leads = [];
  h.onderdrukt = [];
  h.gemarkeerd = [];
  h.leadsBounced = [];
});

describe("harde terugkaatser: merk voor iedereen, onderdrukkingslijst alleen voor leads", () => {
  it("een gewone gebruiker: wel het gehashte merk, niet in SalesSuppression", async () => {
    const uit = await echteBounceAfhankelijkheden().hard(regel);
    expect(h.gemarkeerd).toEqual(["iemand@bedrijf.test"]);
    expect(h.onderdrukt).toEqual([]);
    expect(uit).toEqual({ onderdrukt: false, leads: 0 });
  });

  it("een lead: onderdrukken, lead op teruggekaatst; een lead die dat al was telt niet opnieuw", async () => {
    h.leads = [{ id: "l1", status: "NEW" }, { id: "l2", status: "BOUNCED" }];
    const uit = await echteBounceAfhankelijkheden().hard(regel);
    expect(h.onderdrukt).toEqual(["iemand@bedrijf.test"]);
    expect(h.leadsBounced).toEqual(["l1"]);
    expect(uit).toEqual({ onderdrukt: true, leads: 1 });
  });
});
