import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Een eigen domein voor een rijschool: koppelen, eigendom bewijzen met een
// TXT-regel (pas dan geclaimd, gedeeld met de websites), en pas na een geslaagde
// https-controle actief. Caddy krijgt alleen toestemming voor bewezen domeinen.

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
}));
const scholen = new Map([["r1", { slug: "jansen", online: true }], ["r2", { slug: "pietersen", online: false }]]);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    keyValueStore: {
      create: async ({ data }: { data: { key: string; value: unknown } }) => {
        if (store.has(data.key)) throw new Prisma.PrismaClientKnownRequestError("dubbel", { code: "P2002", clientVersion: "5" });
        store.set(data.key, data.value);
        return data;
      },
    },
    rijschool: { findUnique: async ({ where }: { where: { id: string } }) => scholen.get(where.id) ?? null },
  },
}));
const audit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => audit(...a) }));

import {
  controleerDomein,
  dnsRegels,
  domeinVan,
  eigenAdres,
  koppelDomein,
  ontkoppelDomein,
  rijschoolMagCertificaat,
  rijschoolVoorHost,
  verificatieRegel,
} from "@/lib/rijschool/domein";
import type { DomainLookups } from "@/lib/sites/domain";
import { env } from "@/lib/env";

const door = { userId: "u1" };
const r1 = { id: "r1", online: true };
const r2 = { id: "r2", online: false };

function dns(over: Partial<Record<"txt" | "a" | "aaaa", Record<string, string[]>>> & { https?: (host: string) => string | null } = {}): DomainLookups {
  return {
    txt: async (naam) => (over.txt?.[naam] ?? []).map((v) => [v]),
    a: async (naam) => over.a?.[naam] ?? [],
    aaaa: async (naam) => over.aaaa?.[naam] ?? [],
    https: async (host) => (over.https ? over.https(host) : null),
  };
}

const goedeDns = (id: string, https: string | null = null) =>
  dns({
    txt: { "_zekerflex.rijschooljansen.nl": [verificatieRegel(id)] },
    a: { "rijschooljansen.nl": [env.SITES_IPV4], "www.rijschooljansen.nl": [env.SITES_IPV4] },
    https: () => https,
  });

beforeEach(() => {
  store.clear();
  audit.mockClear();
});

describe("eigen domein van een rijschool", () => {
  it("koppelen claimt nog niets; zonder TXT-regel blijft het domein onbekend", async () => {
    const d = await koppelDomein(r1, "https://www.RijschoolJansen.nl/", door);
    expect(d).toMatchObject({ host: "www.rijschooljansen.nl", alias: "rijschooljansen.nl", geverifieerd: null, actief: null });
    expect(store.has("site-host:www.rijschooljansen.nl")).toBe(false);
    const na = await controleerDomein(r1, door, dns());
    expect(na.geverifieerd).toBeNull();
    expect(na.controle?.probleem).toContain("TXT-regel");
    expect(await rijschoolVoorHost("rijschooljansen.nl")).toBeNull();
    expect(await rijschoolMagCertificaat("rijschooljansen.nl")).toBe(false);
  });

  it("de DNS-regels: A en AAAA op het domein, www als CNAME, de TXT-code van déze rijschool", async () => {
    const regels = dnsRegels("r1", { host: "rijschooljansen.nl", alias: "www.rijschooljansen.nl" });
    expect(regels.map((r) => `${r.type} ${r.short}`)).toEqual(["A @", "AAAA @", "CNAME www", "TXT _zekerflex"]);
    expect(regels.at(-1)?.value).toBe(verificatieRegel("r1"));
    expect(verificatieRegel("r1")).not.toBe(verificatieRegel("r2"));
  });

  it("TXT bewezen: geclaimd en bereikbaar (voor de https-proef), nog niet actief", async () => {
    await koppelDomein(r1, "rijschooljansen.nl", door);
    const d = await controleerDomein(r1, door, goedeDns("r1"));
    expect(d.geverifieerd).not.toBeNull();
    expect(d.actief).toBeNull();
    expect(d.controle?.probleem).toContain("https");
    expect(store.get("site-host:rijschooljansen.nl")).toBe("rijschool:r1");
    expect(store.get("site-host:www.rijschooljansen.nl")).toBe("rijschool:r1");
    expect(await rijschoolVoorHost("rijschooljansen.nl")).toEqual({ id: "r1", slug: "jansen", online: true, hoofd: "rijschooljansen.nl" });
    // www stuurt door naar het hoofdadres
    expect((await rijschoolVoorHost("www.rijschooljansen.nl"))?.hoofd).toBe("rijschooljansen.nl");
    expect(await rijschoolMagCertificaat("rijschooljansen.nl")).toBe(true);
    expect(await eigenAdres("r1")).toBeNull();
  });

  it("https geeft de code van de rijschool terug: actief, en het hoofdadres wordt het eigen domein", async () => {
    await koppelDomein(r1, "rijschooljansen.nl", door);
    const d = await controleerDomein(r1, door, goedeDns("r1", verificatieRegel("r1")));
    expect(d.actief).not.toBeNull();
    expect(d.controle?.probleem).toBeNull();
    expect(await eigenAdres("r1")).toBe("https://rijschooljansen.nl");
    expect(audit.mock.calls.map((c) => (c[0] as { action: string }).action)).toEqual([
      "rijschool.domein.gekoppeld",
      "rijschool.domein.bewezen",
      "rijschool.domein.actief",
    ]);
  });

  it("een verkeerde https-code (iemand anders' server) maakt het domein niet actief", async () => {
    await koppelDomein(r1, "rijschooljansen.nl", door);
    const d = await controleerDomein(r1, door, goedeDns("r1", "zekerflex-site=iets-anders"));
    expect(d.actief).toBeNull();
  });

  it("een offline website: het domein werkt, met de tip om de site online te zetten", async () => {
    await koppelDomein(r2, "rijschooljansen.nl", door);
    const d = await controleerDomein(r2, door, goedeDns("r2", verificatieRegel("r2")));
    expect(d.actief).not.toBeNull();
    expect(d.controle?.probleem).toContain("online");
  });

  it("één domein hoort nooit bij twee: een website of andere rijschool die het al heeft, wint", async () => {
    store.set("site-host:rijschooljansen.nl", "s_website1");
    await expect(koppelDomein(r1, "rijschooljansen.nl", door)).rejects.toThrow(/al gekoppeld/);

    store.clear();
    await koppelDomein(r1, "rijschooljansen.nl", door);
    await controleerDomein(r1, door, goedeDns("r1"));
    // een tweede rijschool kan het niet meer koppelen, ook niet via www
    await expect(koppelDomein(r2, "www.rijschooljansen.nl", door)).rejects.toThrow(/al gekoppeld/);
    expect(store.get("site-host:rijschooljansen.nl")).toBe("rijschool:r1");
  });

  it("loskoppelen geeft het domein vrij", async () => {
    await koppelDomein(r1, "rijschooljansen.nl", door);
    await controleerDomein(r1, door, goedeDns("r1", verificatieRegel("r1")));
    await ontkoppelDomein(r1, door);
    expect(await domeinVan("r1")).toBeNull();
    expect(store.has("site-host:rijschooljansen.nl")).toBe(false);
    expect(store.has("site-host:www.rijschooljansen.nl")).toBe(false);
    expect(await rijschoolVoorHost("rijschooljansen.nl")).toBeNull();
    expect(await eigenAdres("r1")).toBeNull();
  });
});
