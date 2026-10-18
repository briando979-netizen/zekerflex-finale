import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({ kvGet: async (k: string) => kv.get(k) ?? null, kvSet: async (k: string, v: unknown) => void kv.set(k, v) }));
vi.mock("@/lib/env", () => ({ env: { STRIPE_SECRET_KEY: "", SEPA_CREDITOR_IBAN: "NL91ABNA0417164300", SEPA_CREDITOR_NAME: "ZekerFlex B.V.", STRIPE_PUBLISHABLE_KEY: "", IMAGE_ENABLED: false, APP_BASE_URL: "https://www.zekerflex.com" } }));
vi.mock("@/lib/ai/client", () => ({ llmConfigProblem: () => "geen model" }));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: vi.fn() }));
vi.mock("@/lib/bank/insurance", () => ({ getProducts: async () => [] }));

import { addCustom, customTodos, ownerTodos, setManualDone, updateCustom } from "@/lib/admin/owner-todos";

beforeEach(() => kv.clear());

describe("owner to-do list", () => {
  it("checks configuration automatically", async () => {
    const t = Object.fromEntries((await ownerTodos()).map((x) => [x.id, x]));
    expect(t.sepa!.done).toBe(true);
    expect(t.llm!.done).toBe(false);
    expect(t["stripe-pk"]!.done).toBe(false);
    expect(t.insurer!.done).toBe(false);
  });

  it("manual items can be ticked off, with who and when", async () => {
    await setManualDone("terms-review", true, "Brian");
    const t = (await ownerTodos()).find((x) => x.id === "terms-review")!;
    expect(t.done).toBe(true);
    expect(t.doneNote).toContain("Brian");
    await setManualDone("terms-review", false, "Brian");
    expect((await ownerTodos()).find((x) => x.id === "terms-review")!.done).toBe(false);
  });

  it("keeps own notes", async () => {
    const [n] = await addCustom("KVK-uittreksel opvragen");
    await updateCustom(n!.id, { done: true });
    expect((await customTodos())[0]).toMatchObject({ text: "KVK-uittreksel opvragen", done: true });
    await updateCustom(n!.id, { remove: true });
    expect(await customTodos()).toEqual([]);
  });
});
