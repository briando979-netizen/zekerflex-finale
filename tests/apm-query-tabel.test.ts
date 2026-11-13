import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { queryTabel, trageQueryNiveau } from "@/lib/ops/apm";
import { groupId } from "@/lib/ops/error-journal";

// De tabel van een trage query is de reden van de melding: elke tabel een eigen groep in het foutenlogboek.

describe("queryTabel", () => {
  it("leest soort en eerste tabel, ook met schema-prefix en aanhalingstekens", () => {
    expect(queryTabel(`SELECT "public"."RagChunk"."id", "public"."RagChunk"."title" FROM "public"."RagChunk" WHERE 1=1`)).toBe("SELECT RagChunk");
    expect(queryTabel(`SELECT id FROM Shift s JOIN "User" u ON u.id = s.userId`)).toBe("SELECT Shift");
    expect(queryTabel(`UPDATE "public"."Shift" SET "status" = $1 WHERE "id" = $2`)).toBe("UPDATE Shift");
    expect(queryTabel(`INSERT INTO "public"."KeyValueStore" ("key", "value") VALUES ($1, $2)`)).toBe("INSERT KeyValueStore");
    expect(queryTabel(`  delete from "public"."Session" where "id" = $1`)).toBe("DELETE Session");
  });

  it("geeft null bij een onbekende vorm", () => {
    expect(queryTabel("BEGIN")).toBeNull();
    expect(queryTabel("COMMIT")).toBeNull();
    expect(queryTabel("SELECT 1")).toBeNull();
    expect(queryTabel("")).toBeNull();
  });

  it("neemt nooit waarden mee", () => {
    const uit = queryTabel(`UPDATE "public"."User" SET "email" = 'geheim@example.test' WHERE "id" = 'abc123'`);
    expect(uit).toBe("UPDATE User");
    expect(uit).not.toContain("geheim");
    expect(uit).not.toContain("abc123");
  });

  it("geeft elke tabel een eigen groep, en zonder tabel de bestaande", () => {
    const g = (reden: string | null) => groupId("warn", "trage databasequery", null, reden);
    expect(g("SELECT RagChunk")).not.toBe(g("SELECT FreelancerProfile"));
    expect(g("SELECT RagChunk")).toBe(g("SELECT RagChunk"));
    expect(g(null)).toBe(groupId("warn", "trage databasequery", null, null));
  });

  it("laat het niveau van de bekende RagChunk-query ongemoeid", () => {
    expect(trageQueryNiveau(1_700, `SELECT "public"."RagChunk"."id" FROM "public"."RagChunk"`)).toBe("info");
    expect(trageQueryNiveau(1_700, `SELECT "public"."Shift"."id" FROM "public"."Shift"`)).toBe("warn");
  });
});
