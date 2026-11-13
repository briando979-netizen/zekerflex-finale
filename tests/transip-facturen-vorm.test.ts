import { afterEach, describe, expect, it, vi } from "vitest";

// De vorm van GET /v6/invoices is op 14 nov 2026 tegen het ECHTE antwoord gecontroleerd (alleen veldnamen en typen, geen waarden):
// { invoices: [ { invoiceNumber, creationDate, payDate, dueDate, invoiceStatus, currency: string; totalAmount, totalAmountInclVat: number } ],
//   _links: [ { rel, link } ] }. Deze test bootst die vorm na met verzonnen waarden en laat listInvoices en de maandtotalen erover lopen.

vi.mock("@/lib/env", async () => {
  const { generateKeyPairSync } = await import("node:crypto");
  const sleutel = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return { env: { TRANSIP_LOGIN: "zekerflex-test", TRANSIP_PRIVATE_KEY: sleutel } };
});
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { listInvoices } from "@/lib/mail/hosting/transip";
import { facturenPerMaand } from "@/lib/admin/kosten";

const ECHTE_VORM = {
  invoices: [
    { invoiceNumber: "F0000.0000.0001", creationDate: "2026-11-02", payDate: "2026-11-02", dueDate: "2026-11-16", invoiceStatus: "payed", currency: "EUR", totalAmount: 1000, totalAmountInclVat: 1210 },
    { invoiceNumber: "F0000.0000.0002", creationDate: "2026-10-02", payDate: "2026-10-03", dueDate: "2026-10-16", invoiceStatus: "payed", currency: "EUR", totalAmount: 2000, totalAmountInclVat: 2420 },
    { invoiceNumber: "F0000.0000.0003", creationDate: "2026-10-20", payDate: "2026-10-21", dueDate: "2026-11-03", invoiceStatus: "payed", currency: "EUR", totalAmount: 500, totalAmountInclVat: 605 },
  ],
  _links: [{ rel: "self", link: "https://api.transip.nl/v6/invoices" }],
};

afterEach(() => vi.unstubAllGlobals());

describe("GET /v6/invoices zoals het echte antwoord eruit ziet", () => {
  it("listInvoices leest de omhulling invoices en de velden creationDate, invoiceStatus, totalAmount en totalAmountInclVat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).endsWith("/auth") ? new Response(JSON.stringify({ token: "t" }), { status: 201 }) : new Response(JSON.stringify(ECHTE_VORM), { status: 200 }))),
    );
    const facturen = await listInvoices();
    expect(facturen).toEqual([
      { nummer: "F0000.0000.0001", datum: "2026-11-02", status: "payed", exclCent: 1000, inclCent: 1210 },
      { nummer: "F0000.0000.0002", datum: "2026-10-02", status: "payed", exclCent: 2000, inclCent: 2420 },
      { nummer: "F0000.0000.0003", datum: "2026-10-20", status: "payed", exclCent: 500, inclCent: 605 },
    ]);
  });

  it("de maandtotalen komen uit de factuurdatum, nieuwste eerst", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).endsWith("/auth") ? new Response(JSON.stringify({ token: "t" }), { status: 201 }) : new Response(JSON.stringify(ECHTE_VORM), { status: 200 }))),
    );
    const per = facturenPerMaand(await listInvoices());
    expect(per).toEqual([
      { maand: "2026-11", exclCent: 1000, inclCent: 1210, aantal: 1 },
      { maand: "2026-10", exclCent: 2500, inclCent: 3025, aantal: 2 },
    ]);
  });

  it("een datum met tijd erbij (JJJJ-MM-DD uu:mm:ss) werkt ook, en een antwoord zonder lijst geeft niets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).endsWith("/auth")
          ? new Response(JSON.stringify({ token: "t" }), { status: 201 })
          : new Response(JSON.stringify({ invoices: [{ ...ECHTE_VORM.invoices[0], creationDate: "2026-11-02 09:30:00" }] }), { status: 200 }),
      ),
    );
    expect((await listInvoices())[0]?.datum).toBe("2026-11-02");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).endsWith("/auth") ? new Response(JSON.stringify({ token: "t2" }), { status: 201 }) : new Response(JSON.stringify({}), { status: 200 }))),
    );
    expect(await listInvoices()).toEqual([]);
  });
});
