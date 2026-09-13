import { afterEach, describe, expect, it, vi } from "vitest";

const rowsRef: { current: Record<string, unknown>[] } = { current: [] };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: async ({ where }: { where?: { seq?: { gte?: bigint } } }) => {
        const from = where?.seq?.gte;
        return rowsRef.current.filter((r) => from == null || (r.seq as bigint) >= from);
      },
    },
  },
}));

import { computeAuditHash, verifyAuditChain, GENESIS_HASH } from "@/lib/audit-chain";

const base = {
  category: "SECURITY",
  action: "auth.login.succeeded",
  severity: "info",
  actorUserId: "u1",
  actorLabel: "user",
  targetType: "user",
  targetId: "u1",
  createdAt: new Date("2026-09-09T10:00:00Z"),
};

/** Build a valid sealed chain of `n` rows. */
function chain(n: number) {
  const rows: Record<string, unknown>[] = [];
  let prevHash = GENESIS_HASH;
  for (let i = 1; i <= n; i += 1) {
    const seq = BigInt(i);
    const fields = { ...base, action: `${base.action}.${i}`, seq, prevHash };
    const hash = computeAuditHash(fields);
    rows.push({ ...base, action: fields.action, seq, hash, prevHash });
    prevHash = hash;
  }
  return rows;
}

afterEach(() => {
  rowsRef.current = [];
  vi.clearAllMocks();
});

describe("computeAuditHash", () => {
  it("is deterministic and sensitive to every field", () => {
    const a = computeAuditHash({ ...base, seq: 1n, prevHash: GENESIS_HASH });
    const b = computeAuditHash({ ...base, seq: 1n, prevHash: GENESIS_HASH });
    const c = computeAuditHash({ ...base, seq: 2n, prevHash: GENESIS_HASH });
    const d = computeAuditHash({ ...base, seq: 1n, prevHash: "other" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyAuditChain", () => {
  it("accepts an intact chain", async () => {
    rowsRef.current = chain(20);
    const res = await verifyAuditChain();
    expect(res).toMatchObject({ ok: true, checked: 20, unsealed: 0, firstBreakSeq: null });
  });

  it("tolerates unsealed (pre-migration) rows before the sealed segment", async () => {
    rowsRef.current = [
      { ...base, seq: 1n, hash: null, prevHash: null },
      { ...base, seq: 2n, hash: null, prevHash: null },
      ...chain(3).map((r) => ({ ...r, seq: (r.seq as bigint) + 2n })),
    ];
    // recompute the sealed segment with the shifted seqs
    let prevHash = GENESIS_HASH;
    for (const r of rowsRef.current as Record<string, unknown>[]) {
      if (r.hash === null) continue;
      r.prevHash = prevHash;
      r.hash = computeAuditHash({
        ...base,
        seq: r.seq as bigint,
        action: r.action as string,
        prevHash,
      });
      prevHash = r.hash as string;
    }
    const res = await verifyAuditChain();
    expect(res.ok).toBe(true);
    expect(res.unsealed).toBe(2);
    expect(res.checked).toBe(3);
  });

  it("flags a row whose content was altered", async () => {
    const rows = chain(10);
    (rows[5] as { action: string }).action = "TAMPERED";
    rowsRef.current = rows;
    const res = await verifyAuditChain();
    expect(res.ok).toBe(false);
    expect(res.firstBreakSeq).toBe("6");
  });

  it("flags a broken link (prevHash rewired)", async () => {
    const rows = chain(10);
    (rows[7] as { prevHash: string }).prevHash = "deadbeef";
    rowsRef.current = rows;
    const res = await verifyAuditChain();
    expect(res.ok).toBe(false);
    expect(res.firstBreakSeq).toBe("8");
  });
});
