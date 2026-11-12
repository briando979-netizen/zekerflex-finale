import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(), kvListEntries: vi.fn(), kvSet: vi.fn() }));

import { controleCijfer, leesMrz } from "@/lib/kyc/mrz";
import { bsnVoorstelPatch, bsnVoorstelUitRegels } from "@/lib/kyc/bsn-uit-document";
import { hashBsn } from "@/lib/fiscal/bsn";
import { EMPTY_FISCAL, fiscaalVoorKlant } from "@/lib/fiscal/store";

// Verzonnen documenten en een test-BSN dat de elfproef haalt (999999990, zoals op de specimens): geen echte personen.
const NU = new Date("2026-11-13T12:00:00+01:00");
const BSN = "999999990";
const cd = (s: string) => String(controleCijfer(s));
const vul = (s: string, n: number) => s.padEnd(n, "<").slice(0, n);

/** Een Nederlandse ID-kaart (TD1) met alle controlecijfers goed, tenzij anders gevraagd. */
function idKaart(o: { land?: string; bsn?: string; bsnCijfer?: string; totaalFout?: boolean } = {}): string[] {
  const land = o.land ?? "NLD";
  const nr = "SPECI2014";
  const bsn = o.bsn ?? BSN;
  const r1 = `I<${land}${nr}${cd(nr)}${bsn}<<<<<${o.bsnCijfer ?? cd(bsn)}`;
  const geboorte = "900101";
  const verval = "310101";
  const midden = `${geboorte}${cd(geboorte)}F${verval}${cd(verval)}${land}`;
  const staart = "<".repeat(11);
  let totaal = cd(r1.slice(5, 30) + geboorte + cd(geboorte) + verval + cd(verval) + staart);
  if (o.totaalFout) totaal = String((Number(totaal) + 1) % 10);
  const r2 = `${midden}${staart}${totaal}`;
  return [r1, r2, vul("DE<BRUIJN<<WILLEKE<LISELOTTE", 30)];
}

/** Een Nederlands paspoort (TD3): het BSN als persoonlijk nummer. */
function paspoort(o: { land?: string; bsn?: string } = {}): string[] {
  const land = o.land ?? "NLD";
  const nr = "SPECI2014";
  const bsn = o.bsn ?? BSN;
  const persoonlijk = `${bsn}<<<<<`;
  const geboorte = "900101";
  const verval = "310101";
  const zonderTotaal = `${nr}${cd(nr)}${land}${geboorte}${cd(geboorte)}F${verval}${cd(verval)}${persoonlijk}${cd(persoonlijk)}`;
  const totaal = cd(zonderTotaal.slice(0, 10) + zonderTotaal.slice(13, 20) + zonderTotaal.slice(21, 43));
  return [vul(`P<${land}DE<BRUIJN<<WILLEKE<LISELOTTE`, 44), `${zonderTotaal}${totaal}`];
}

describe("BSN van het document (13 nov)", () => {
  it("de testdocumenten zijn echte MRZ's: alle controlecijfers kloppen", () => {
    expect(leesMrz("TD1", idKaart(), NU)?.volledig).toBe(true);
    expect(leesMrz("TD3", paspoort(), NU)?.volledig).toBe(true);
  });

  it("leest het BSN van een NL-ID-kaart en een NL-paspoort, alleen als hash + laatste 4", () => {
    expect(bsnVoorstelUitRegels("TD1", idKaart(), NU)).toEqual(hashBsn(BSN));
    expect(bsnVoorstelUitRegels("TD3", paspoort(), NU)).toEqual(hashBsn(BSN));
    expect(bsnVoorstelUitRegels("TD1", idKaart(), NU)?.last4).toBe("9990");
  });

  it("geen Nederlands document: geen voorstel", () => {
    expect(bsnVoorstelUitRegels("TD1", idKaart({ land: "BEL" }), NU)).toBeNull();
    expect(bsnVoorstelUitRegels("TD3", paspoort({ land: "D<<" }), NU)).toBeNull();
  });

  it("een nummer dat door de elfproef valt: geen voorstel, ook als alle controlecijfers kloppen", () => {
    const fout = "999999991";
    expect(leesMrz("TD1", idKaart({ bsn: fout }), NU)?.volledig).toBe(true);
    expect(bsnVoorstelUitRegels("TD1", idKaart({ bsn: fout }), NU)).toBeNull();
    expect(bsnVoorstelUitRegels("TD3", paspoort({ bsn: fout }), NU)).toBeNull();
  });

  it("een leesfout in het vrije veld (samengesteld of eigen controlecijfer klopt niet): geen voorstel", () => {
    expect(bsnVoorstelUitRegels("TD1", idKaart({ totaalFout: true }), NU)).toBeNull();
    const eigenFout = String((Number(cd(BSN)) + 1) % 10);
    expect(bsnVoorstelUitRegels("TD1", idKaart({ bsnCijfer: eigenFout }), NU)).toBeNull();
  });

  it("de uitslag van de MRZ en het voorstel bevatten de 9 cijfers nergens", () => {
    for (const [formaat, regels] of [["TD1", idKaart()], ["TD3", paspoort()]] as const) {
      expect(JSON.stringify(leesMrz(formaat, regels, NU))).not.toContain(BSN);
      expect(JSON.stringify(bsnVoorstelUitRegels(formaat, regels, NU))).not.toContain(BSN);
    }
  });

  it("alleen voor een uitzendkracht die nog geen BSN heeft", () => {
    const v = hashBsn(BSN);
    expect(bsnVoorstelPatch({ workerKind: "uitzendkracht", bsnHash: null }, v, NU)).toEqual({ bsnVoorstelHash: v.hash, bsnVoorstelLast4: "9990", bsnVoorstelAt: NU.toISOString() });
    expect(bsnVoorstelPatch({ workerKind: "zzp", bsnHash: null }, v)).toBeNull();
    expect(bsnVoorstelPatch({ workerKind: "flexwerker", bsnHash: null }, v)).toBeNull();
    expect(bsnVoorstelPatch({ workerKind: null, bsnHash: null }, v)).toBeNull();
    expect(bsnVoorstelPatch({ workerKind: "uitzendkracht", bsnHash: "al-een" }, v)).toBeNull();
    expect(bsnVoorstelPatch({ workerKind: "uitzendkracht", bsnHash: null }, null)).toBeNull();
  });

  it("naar de browser gaat alleen de laatste 4, niet de hash van het voorstel", () => {
    const v = hashBsn(BSN);
    const uit = fiscaalVoorKlant({ ...EMPTY_FISCAL, bsnVoorstelHash: v.hash, bsnVoorstelLast4: v.last4 });
    expect(uit.bsnVoorstelLast4).toBe("9990");
    expect(JSON.stringify(uit)).not.toContain(v.hash);
  });

  it("rawPayload van de ID-controle krijgt geen BSN of voorstel, en niets hiervan logt", () => {
    const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    const verify = bron("lib/onboarding/verify.ts");
    const begin = verify.indexOf("rawPayload: JSON.parse(");
    const eind = verify.indexOf("fileSha256", begin);
    expect(begin).toBeGreaterThan(0);
    const raw = verify.slice(begin, eind);
    expect(raw).not.toMatch(/\bbsn\b|mrzLezing|Voorstel/);
    // de QR-lezer (stap iii) ook niet: zijn uitkomst gaat alleen naar bewaarBsnVoorstel
    expect(raw).not.toMatch(/leesBsnUitQr|bsn-qr|jsqr/i);
    const qrCode = bron("lib/kyc/bsn-qr.ts").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(qrCode).not.toMatch(/rawPayload|recordAudit|throw /);
    for (const f of ["lib/kyc/bsn-uit-document.ts", "lib/fiscal/bsn-voorstel.ts", "lib/fiscal/bsn.ts", "lib/kyc/mrz-lezen.ts", "lib/kyc/bsn-qr.ts"]) {
      expect(bron(f), f).not.toMatch(/logger|console\./);
    }
  });
});
