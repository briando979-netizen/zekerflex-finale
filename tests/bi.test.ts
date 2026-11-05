import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { geldigeInbedsleutel, inbedToken, inbedUrl } from "@/lib/bi/embed";
import { BI_ROL, BI_VIEWS, inrichtSql, isHexWachtwoord, sqlTekst } from "@/lib/bi/views";
import { KAARTEN } from "@/lib/bi/dashboards";

const b64 = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString()) as Record<string, unknown>;

describe("bi: inbedtoken", () => {
  const geheim = "ab".repeat(32);
  it("tekent dashboard en vastgezet bedrijf met HS256 en een vervaltijd", () => {
    const nu = Date.parse("2026-11-05T10:00:00Z");
    const t = inbedToken(geheim, 7, { tenant_id: "t_123" }, 600, nu);
    const [kop = "", inhoud = "", hand = ""] = t.split(".");
    expect(b64(kop)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(b64(inhoud)).toEqual({ resource: { dashboard: 7 }, params: { tenant_id: "t_123" }, exp: nu / 1000 + 600 });
    expect(hand).toBe(createHmac("sha256", geheim).update(`${kop}.${inhoud}`).digest("base64url"));
  });
  it("de link wijst naar /embed/dashboard zonder rand en titel", () => {
    expect(inbedUrl("https://bi.example.com/", "x.y.z")).toBe("https://bi.example.com/embed/dashboard/x.y.z#bordered=false&titled=false");
    expect(inbedUrl("https://bi.example.com", "x.y.z", { titel: true, rand: true, thema: "night" })).toContain("#bordered=true&titled=true&theme=night");
  });
  it("een inbedsleutel is 64 hex", () => {
    expect(geldigeInbedsleutel("ab".repeat(32))).toBe(true);
    expect(geldigeInbedsleutel("xyz")).toBe(false);
    expect(geldigeInbedsleutel(null)).toBe(false);
  });
});

describe("bi: schema en views", () => {
  it("elke view heeft tenant_id en leest alleen uit echte tabellen of bi-views", () => {
    for (const v of BI_VIEWS) {
      expect(v.sql).toMatch(/tenant_id/);
      expect(v.sql).not.toMatch(/"User"|passwordHash|email/);
    }
    expect(BI_VIEWS.map((v) => v.naam)).toEqual(["diensten", "uren", "facturen", "bezetting_per_week", "maandoverzicht"]);
  });
  it("de inrichting maakt schema, views en een rol die alleen in bi mag lezen", () => {
    const sql = inrichtSql(sqlTekst("abc123"));
    expect(sql[0]).toBe("CREATE SCHEMA IF NOT EXISTS bi");
    expect(sql.filter((s) => s.startsWith("CREATE OR REPLACE VIEW bi."))).toHaveLength(BI_VIEWS.length);
    expect(sql.join("\n")).toContain(`REVOKE ALL ON SCHEMA public FROM ${BI_ROL}`);
    expect(sql.join("\n")).toContain(`GRANT SELECT ON ALL TABLES IN SCHEMA bi TO ${BI_ROL}`);
    expect(sql.join("\n")).toContain("PASSWORD 'abc123'");
  });
  it("sql-literal ontsnapt aanhalingstekens; wachtwoorden zijn hex", () => {
    expect(sqlTekst("o'neil")).toBe("'o''neil'");
    expect(isHexWachtwoord("ab".repeat(16))).toBe(true);
    expect(isHexWachtwoord("ab'; drop")).toBe(false);
  });
});

describe("bi: dashboard", () => {
  it("elke kaart filtert op {{tenant_id}}, leest uit bi en past in het raster van 24", () => {
    const sleutels = new Set<string>();
    for (const k of KAARTEN) {
      expect(k.sql).toContain("{{tenant_id}}");
      expect(k.sql).toMatch(/\bbi\./);
      expect(k.sql).not.toMatch(/"User"|"Tenant"|public\./);
      expect(k.kolom + k.breedte).toBeLessThanOrEqual(24);
      expect(sleutels.has(k.sleutel)).toBe(false);
      sleutels.add(k.sleutel);
    }
  });
});
