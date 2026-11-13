import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CANAL_Z, EXITS } from "@/lib/admin/city-layout";
import { afstandTotStuk, afstandTotWeg, overwegen, panden, RING_B, RINGEN, ringPunten, ROUTES, SNELWEG_B, SPOOR_ZONE, STEDEN, wegdelen } from "@/lib/admin/nl-wegen";
import { GANGEN, GEEN_INVOER, GRENS, KIJK_MAX, kijkSlepen, rechtsVan, startStand, verkenStap, type Verkenstand, vooruitVan } from "@/lib/admin/verkennen";

// 13 nov 2026, eigenaar: "ik kan nog steeds niet de hele stad verkennen of wegen zijn gebouwd etc, bouw helemaal uit".
// Nu: zelf rondlopen en rondrijden, snelwegen naar vier steden met een ringweg en panden, verkeer en overwegen.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const START: Verkenstand = { x: 0, z: 0, kijk: 0, op: 0, gang: "lopen" };

describe("rondlopen en rondrijden", () => {
  it("vooruit is de kijkrichting; rechts staat daar haaks op, zoals bij de rijstroken", () => {
    const [fx, fz] = vooruitVan(0);
    expect([fx, fz]).toEqual([0, 1]);
    const [rx, rz] = rechtsVan(0);
    expect(rx).toBeCloseTo(-1);
    expect(rz).toBeCloseTo(0);
  });

  it("een seconde lopen of rijden brengt je zo ver als de snelheid zegt; Shift gaat sneller", () => {
    expect(verkenStap(START, { ...GEEN_INVOER, vooruit: 1 }, 0.1).z).toBeCloseTo(GANGEN.lopen.snelheid * 0.1);
    expect(verkenStap({ ...START, gang: "rijden" }, { ...GEEN_INVOER, vooruit: 1 }, 0.1).z).toBeCloseTo(GANGEN.rijden.snelheid * 0.1);
    expect(verkenStap(START, { ...GEEN_INVOER, vooruit: 1, snel: true }, 0.1).z).toBeGreaterThan(GANGEN.lopen.snelheid * 0.1);
  });

  it("schuin gaat niet sneller dan recht, en een haperend beeld laat je niet wegschieten", () => {
    const s = verkenStap(START, { ...GEEN_INVOER, vooruit: 1, opzij: 1 }, 0.1);
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(GANGEN.lopen.snelheid * 0.1);
    expect(verkenStap(START, { ...GEEN_INVOER, vooruit: 1 }, 5).z).toBeCloseTo(GANGEN.lopen.snelheid * 0.1);
  });

  it("nooit voorbij de rand van de wereld", () => {
    const s = verkenStap({ ...START, x: GRENS.x1 - 0.1, kijk: Math.PI / 2, gang: "rijden" }, { ...GEEN_INVOER, vooruit: 1, snel: true }, 0.1);
    expect(s.x).toBe(GRENS.x1);
  });

  it("pijltje links draait naar links; slepen naar rechts kijkt naar rechts, en omhoog kijken heeft een grens", () => {
    const links = verkenStap(START, { ...GEEN_INVOER, draai: 1 }, 0.1);
    const [fx] = vooruitVan(links.kijk);
    expect(fx).toBeGreaterThan(0); // vanaf +z naar links draaien = naar +x (rechts is −x)
    const rechts = kijkSlepen(START, 100, 0);
    const [rx] = vooruitVan(rechts.kijk);
    expect(rx).toBeLessThan(0);
    expect(kijkSlepen(START, 0, -10_000).op).toBe(KIJK_MAX);
  });

  it("je begint waar de camera naar keek, met de blik dezelfde kant op", () => {
    const s = startStand(0, -100, 10, 20, "lopen");
    expect([s.x, s.z]).toEqual([10, 20]);
    const [fx, fz] = vooruitVan(s.kijk);
    expect(fz).toBeGreaterThan(0.9);
    expect(fx).toBeGreaterThan(0);
  });
});

describe("wegen naar de steden", () => {
  it("elke stad heeft een route vanaf een afrit van de stad rond het kantoor, tot aan haar ringweg", () => {
    for (const s of STEDEN) {
      const r = ROUTES[s.id];
      const begin = r[0];
      const eind = r[r.length - 1];
      expect(begin && (begin[0] === EXITS.oost.x || begin[0] === EXITS.west.x)).toBe(true);
      const ring = ringPunten(s.id);
      const opRing = ring.slice(1).some((b, i) => {
        const a = ring[i];
        return a !== undefined && eind !== undefined && afstandTotStuk(eind[0], eind[1], a, b) < 0.01;
      });
      expect(opRing).toBe(true);
    }
  });

  it("alle stukken liggen recht langs x of z (dan kloppen de rijstroken in de bochten) en binnen de wereld", () => {
    for (const d of wegdelen()) {
      expect(d.a[0] === d.b[0] || d.a[1] === d.b[1]).toBe(true);
      for (const p of [d.a, d.b]) {
        expect(p[0]).toBeGreaterThan(GRENS.x0);
        expect(p[0]).toBeLessThan(GRENS.x1);
        expect(p[1]).toBeLessThan(GRENS.z1);
      }
    }
  });

  it("de snelwegen kruisen de gracht (een brug) en het spoor (een overweg), elk twee keer", () => {
    const [cz0, cz1] = CANAL_Z;
    const bruggen = wegdelen().filter((d) => d.a[0] === d.b[0] && Math.min(d.a[1], d.b[1]) < cz0 && Math.max(d.a[1], d.b[1]) > cz1);
    expect(bruggen).toHaveLength(2);
    expect(overwegen()).toHaveLength(2);
    for (const [, z] of overwegen()) expect(z).toBeGreaterThan(SPOOR_ZONE[0]);
  });

  it("de ringweg ligt om de bekende gebouwen heen (het midden blijft vrij) en Amsterdam en Groningen niet op het spoor", () => {
    for (const s of STEDEN) {
      const r = RINGEN[s.id];
      expect(r.x0).toBeLessThan(-40);
      expect(r.x1).toBeGreaterThan(40);
      expect(r.z0).toBeLessThan(-20);
      const zuid = s.z + r.z0 - RING_B / 2;
      const noord = s.z + r.z1 + RING_B / 2;
      expect(noord < SPOOR_ZONE[0] || zuid > SPOOR_ZONE[1]).toBe(true);
    }
  });
});

describe("panden in de steden", () => {
  it("elke stad heeft er tientallen, Rotterdam met glazen torens, de rest met puntdaken", () => {
    for (const s of STEDEN) expect(panden(s.id).length).toBeGreaterThan(20);
    expect(panden("rotterdam").some((p) => p.glas && p.h > 30)).toBe(true);
    expect(panden("amsterdam").every((p) => !p.glas && p.dak)).toBe(true);
  });

  it("nooit op een weg, op het spoor of in de Maas, en elke keer dezelfde", () => {
    for (const s of STEDEN) {
      for (const p of panden(s.id)) {
        expect(afstandTotWeg(p.x, p.z)).toBeGreaterThan(Math.min(p.w, p.d) / 2 + RING_B / 2);
        expect(p.z + p.d / 2 < SPOOR_ZONE[0] || p.z - p.d / 2 > SPOOR_ZONE[1]).toBe(true);
      }
    }
    const maas = STEDEN.find((s) => s.id === "rotterdam");
    for (const p of panden("rotterdam")) expect(p.z).toBeLessThan((maas?.z ?? 0) + 3);
    expect(panden("utrecht")).toEqual(panden("utrecht"));
  });

  it("panden staan niet in elkaar", () => {
    for (const s of STEDEN) {
      const lijst = panden(s.id);
      for (let i = 0; i < lijst.length; i++) {
        for (let j = i + 1; j < lijst.length; j++) {
          const a = lijst[i];
          const b = lijst[j];
          if (!a || !b) continue;
          const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.05;
          const overlapZ = Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 0.05;
          expect(overlapX && overlapZ).toBe(false);
        }
      }
    }
  });

  it("een snelweg komt de stad in zonder door een pand te rijden", () => {
    for (const s of STEDEN) {
      const r = ROUTES[s.id];
      const a = r[r.length - 2];
      const b = r[r.length - 1];
      if (!a || !b) continue;
      for (const p of panden(s.id)) expect(afstandTotStuk(p.x, p.z, a, b)).toBeGreaterThan(Math.max(p.w, p.d) / 2 + SNELWEG_B / 2);
    }
  });
});

describe("in de motor en op het scherm", () => {
  it("de wegen zitten in de stad, met verkeer, en de camera mag overal komen", () => {
    const scene = bron("components/admin/city/scene.ts");
    expect(scene).toContain("const wegen = buildWegen(kit, shadow, win, reduced);");
    expect(scene).toContain("wegen.update(dt, now);");
    expect(scene).toContain("controls.target.x = Math.max(GRENS.x0, Math.min(GRENS.x1, controls.target.x));");
    expect(scene).toContain("verken = verkenStap(verken, invoer(), dt);");
    // de toetsen alleen tijdens het rondlopen, en nooit als iemand in een veld typt
    expect(scene).toContain("if (!verken || typt(ev.target)) return;");
    expect(scene).toContain('window.removeEventListener("keydown", onKeyDown);');
  });

  it("knoppen voor rondlopen, rondrijden en de vier steden; vasthouden op de telefoon", () => {
    const kantoor = bron("components/admin/Office3D.tsx");
    expect(kantoor).toContain("🚶 Rondlopen");
    expect(kantoor).toContain("🚗 Rondrijden");
    for (const s of STEDEN) expect(kantoor).toContain(`["${s.id}", "${s.naam}"]`);
    expect(kantoor).toContain('aria-label="Vooruit"');
    expect(kantoor).toContain("onLostPointerCapture");
  });

  it("geen bomen op de nieuwe wegen, en niets van buiten", () => {
    expect(bron("components/admin/city/world.ts")).toContain("const opWeg = afstandTotWeg(x, z) < 7;");
    for (const f of ["components/admin/city/wegen.ts", "lib/admin/nl-wegen.ts", "lib/admin/verkennen.ts"]) expect(bron(f)).not.toMatch(/https?:\/\//);
  });
});
