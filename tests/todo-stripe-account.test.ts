import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripeAccountTodos } from "@/lib/admin/todo-stripe-account";
import type { StripeAccountInfo } from "@/lib/billing/stripe-account-vorm";

// 13 nov 2026: betalen via Zekerflex, Inc. De eigenaar plakt de sleutel in Beheer → Risico & systeem → Stripe-account;
// de taak vinkt zichzelf af zodra daar een account actief is, en "Connect aanzetten" verschijnt alleen als dat nodig is.
const actief = (over: Partial<StripeAccountInfo> = {}): StripeAccountInfo => ({
  accountId: "acct_inc",
  naam: "Zekerflex, Inc.",
  land: "US",
  eind: "AB12",
  ingesteldOp: "2026-11-13T08:00:00+01:00",
  door: "Eigenaar",
  webhook: true,
  connectWebhook: true,
  connectMelding: null,
  heeftVorige: false,
  ...over,
});

describe("eigenaar-taken voor het Stripe-account van Zekerflex, Inc.", () => {
  it("nog geen account gekozen: één open taak met de stappen in Beheer", () => {
    const t = stripeAccountTodos(null);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ id: "stripe-account-inc", group: "Geld & bank", auto: true, done: false });
    expect(t[0]?.how.join(" ")).toContain("Beheer → Risico & systeem → Stripe-account");
    expect(t[0]?.how.join(" ")).toContain("Gebruik dit account");
    expect(t[0]?.how.join(" ")).toMatch(/nergens anders/);
  });

  it("account actief met Connect-webhook: afgevinkt, met het einde van de sleutel en geen Connect-taak", () => {
    const t = stripeAccountTodos(actief());
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ done: true, title: "Stripe-account actief: Zekerflex, Inc." });
    expect(t[0]?.doneNote).toContain("AB12");
  });

  it("account actief zonder Connect-webhook: ook de taak Connect aanzetten", () => {
    const t = stripeAccountTodos(actief({ connectWebhook: false, connectMelding: "staat Connect aan?" }));
    expect(t.map((x) => x.id)).toEqual(["stripe-account-inc", "stripe-connect-aanzetten"]);
    expect(t[1]?.done).toBe(false);
  });

  it("niet kunnen lezen: geen taak (niets vals tonen)", () => {
    expect(stripeAccountTodos(undefined)).toEqual([]);
  });

  it("de takenlijst neemt ze op, en de oude B.V.-naam staat nergens meer als taak", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/admin/owner-todos.ts"), "utf8");
    expect(src).toContain("...stripeAccount,");
    expect(src).not.toMatch(/ZekerFlex B\.V\./);
  });
});
