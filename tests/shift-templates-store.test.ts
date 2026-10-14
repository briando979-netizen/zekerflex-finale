import { afterEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (key: string) => kv.get(key) ?? null),
  kvSet: vi.fn(async (key: string, value: unknown) => {
    kv.set(key, value);
  }),
  kvDelete: vi.fn(async (key: string) => {
    kv.delete(key);
  }),
  kvListValues: vi.fn(async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v)),
}));

import { saveTemplate, listTemplates, getTemplate, deleteTemplate, updateTemplate } from "@/lib/shifts/templates";

afterEach(() => {
  kv.clear();
  vi.clearAllMocks();
});

const BASE = {
  tenantId: "t1",
  label: "Ochtenddienst",
  hourlyRateCents: 1700,
  breakMinutes: 30,
  description: null,
  dresscode: null,
  defaultBranchId: null,
  createdById: "u1",
};

describe("shift templates store", () => {
  it("saves a template scoped to its tenant", async () => {
    const t = await saveTemplate(BASE);
    expect(t.id).toBeTruthy();
    expect(t.tenantId).toBe("t1");
  });

  it("only lists templates for the given tenant", async () => {
    await saveTemplate(BASE);
    await saveTemplate({ ...BASE, tenantId: "t2", label: "Andere tenant" });

    const list = await listTemplates("t1");
    expect(list).toHaveLength(1);
    expect(list[0]!.label).toBe("Ochtenddienst");
  });

  it("gets, updates and deletes a template", async () => {
    const t = await saveTemplate(BASE);
    expect((await getTemplate("t1", t.id))?.label).toBe("Ochtenddienst");

    const updated = await updateTemplate("t1", t.id, { label: "Avonddienst" });
    expect(updated?.label).toBe("Avonddienst");
    expect((await getTemplate("t1", t.id))?.label).toBe("Avonddienst");

    await deleteTemplate("t1", t.id);
    expect(await getTemplate("t1", t.id)).toBeNull();
  });

  it("returns null when updating a template from another tenant", async () => {
    const t = await saveTemplate(BASE);
    expect(await updateTemplate("t2", t.id, { label: "Gekaapt" })).toBeNull();
  });
});
