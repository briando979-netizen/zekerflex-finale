import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Spraakberichten zoals WhatsApp (15 nov 2026, eigenaar): ingedrukt houden, schuiven om te annuleren of vast te zetten, de golf,
// en de blauwe microfoon als het bericht beluisterd is.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const ik = vi.hoisted(() => ({ userId: "b" }));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: ik.userId, fullName: "B" }) }));
vi.mock("@/lib/messaging/contacts", () => ({ isPlatformAdmin: async () => false }));

import {
  annuleerVoortgang,
  GOLF_MAX,
  GOLF_STAAFJES,
  golfHoogtes,
  golfPositie,
  golfSamenvatten,
  liveHoogtes,
  STILTE,
  KORTE_TIK_MS,
  niveauUit,
  schoneGolf,
  schuifStand,
  vasteGolf,
} from "@/lib/chat/spraak";
import { getMessages, markeerAfgespeeld, postMessage, type ChatThread } from "@/lib/messaging/store";
import { POST as afgespeeld } from "@/app/api/inbox/[threadId]/afgespeeld/route";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("ingedrukt houden en schuiven", () => {
  it("naar links annuleert, omhoog zet vast, een beetje bewegen houdt de opname", () => {
    expect(schuifStand(0, 0, 390)).toBe("houden");
    expect(schuifStand(-40, -10, 390)).toBe("houden");
    expect(schuifStand(-125, 0, 390)).toBe("annuleren");
    expect(schuifStand(0, -75, 390)).toBe("vastzetten");
    // schuin omhoog: omhoog wint als dat de grootste beweging is; een grote zwaai naar links blijft annuleren
    expect(schuifStand(-60, -80, 390)).toBe("vastzetten");
    expect(schuifStand(-130, -72, 390)).toBe("annuleren");
    // smal scherm: een derde van de breedte (minimaal 60 px)
    expect(schuifStand(-70, 0, 210)).toBe("annuleren");
  });

  it("de tekst schuift mee en vervaagt naar het annuleren toe", () => {
    expect(annuleerVoortgang(0, 390)).toBe(0);
    expect(annuleerVoortgang(-60, 390)).toBe(0.5);
    expect(annuleerVoortgang(-500, 390)).toBe(1);
  });

  it("korter dan een tik is geen opname maar een uitleg", () => {
    expect(KORTE_TIK_MS).toBeGreaterThanOrEqual(300);
    expect(KORTE_TIK_MS).toBeLessThanOrEqual(600);
  });
});

describe("de geluidsgolf", () => {
  it("stilte is 0, hard geluid tot 1", () => {
    expect(niveauUit(new Uint8Array(512).fill(128))).toBe(0);
    const hard = Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 255 : 0));
    expect(niveauUit(hard)).toBe(1);
    expect(niveauUit([])).toBe(0);
  });

  it("een opname wordt 48 staafjes van 0..31, pieken blijven", () => {
    const niveaus = Array.from({ length: 300 }, (_, i) => (i === 150 ? 1 : 0.1));
    const g = golfSamenvatten(niveaus);
    expect(g).toHaveLength(GOLF_STAAFJES);
    expect(Math.max(...g)).toBe(GOLF_MAX);
    expect(Math.min(...g)).toBe(3);
    expect(golfSamenvatten([])).toEqual([]);
    // korter dan 48 metingen: toch 48 staafjes
    expect(golfSamenvatten([0.5, 1])).toHaveLength(GOLF_STAAFJES);
  });

  it("een golf uit een bericht wordt schoongemaakt; rommel is geen golf", () => {
    expect(schoneGolf([0, 15.4, 40, -2, "x"])).toEqual([0, 15, 31, 0, 0]);
    expect(schoneGolf([])).toBeUndefined();
    expect(schoneGolf("golf")).toBeUndefined();
    expect(schoneGolf(new Array(65).fill(1))).toBeUndefined();
  });

  it("een oud bericht zonder golf krijgt een vaste vorm (zelfde bericht = zelfde golf)", () => {
    const a = vasteGolf("bericht-1");
    expect(a).toEqual(vasteGolf("bericht-1"));
    expect(a).not.toEqual(vasteGolf("bericht-2"));
    expect(a).toHaveLength(GOLF_STAAFJES);
    expect(a.every((n) => n >= 0 && n <= GOLF_MAX)).toBe(true);
  });

  it("tikken of slepen op de golf geeft de plek 0..1", () => {
    expect(golfPositie(150, 100, 200)).toBe(0.25);
    expect(golfPositie(50, 100, 200)).toBe(0);
    expect(golfPositie(400, 100, 200)).toBe(1);
    expect(golfPositie(150, 100, 0)).toBe(0);
  });
});

describe("de golf op schaal (zoals WhatsApp)", () => {
  it("een stille opname met een piek: de piek haalt de volle hoogte", () => {
    const stil = Array.from({ length: 100 }, (_, i) => (i === 40 ? 0.05 : 0.01));
    const g = golfSamenvatten(stil);
    expect(Math.max(...g)).toBe(GOLF_MAX);
    expect(Math.min(...g)).toBe(6);
  });
  it("echte stilte blijft laag, ruis krijgt geen volle hoogte", () => {
    const g = golfSamenvatten(new Array(100).fill(STILTE / 2));
    expect(Math.max(...g)).toBeLessThanOrEqual(1);
  });
  it("tekenen: op schaal van de eigen golf, nooit lager dan het minimum, ook een oude platte golf", () => {
    expect(golfHoogtes([1, 0, 1])).toEqual([1, 0.14, 1]);
    expect(golfHoogtes([0, 0])).toEqual([0.14, 0.14]);
    expect(golfHoogtes([31, 15])[1]).toBeCloseTo(15 / 31);
  });
  it("tijdens het opnemen: op schaal van het hardste dat te zien is", () => {
    expect(liveHoogtes([0.05, 0.1])).toEqual([0.5, 1]);
    // onder de ondergrens (STILTE * 2,5) niet opgeblazen
    expect(liveHoogtes([0.02, 0.04])[1]).toBeCloseTo(0.8);
    expect(liveHoogtes([0.001])[0]).toBeLessThan(0.05);
  });
});

describe("beluisterd (de blauwe microfoon)", () => {
  beforeEach(() => {
    kv.clear();
    ik.userId = "b";
    kv.set("chat-thread:t1", { id: "t1", kind: "direct", participants: ["a", "b"], createdAt: "", lastMessageAt: "", lastMessage: null, meta: {}, reads: {} } as ChatThread);
  });
  const spraakVanA = () => postMessage("t1", "a", "", "voice", { attachment: { mediaId: "med1", filename: "spraak.webm", mimeType: "audio/webm", sizeBytes: 11, durationSec: 3, golf: [1, 2, 3] } });

  it("de ontvanger vinkt af, één keer; de afzender zelf en een tekstbericht niet", async () => {
    const m = await spraakVanA();
    expect((await markeerAfgespeeld("t1", m.id, "b"))?.afgespeeld).toEqual(["b"]);
    expect((await markeerAfgespeeld("t1", m.id, "b"))?.afgespeeld).toEqual(["b"]);
    expect(await markeerAfgespeeld("t1", m.id, "a")).toBeNull();
    const tekst = await postMessage("t1", "a", "hoi", "text");
    expect(await markeerAfgespeeld("t1", tekst.id, "b")).toBeNull();
    const [opgeslagen] = await getMessages("t1");
    expect(opgeslagen?.attachment?.golf).toEqual([1, 2, 3]);
  });

  it("de route: alleen voor wie in het gesprek zit; geen fout als er niets te doen is", async () => {
    const m = await spraakVanA();
    const vraag = (messageId: string) =>
      afgespeeld(new Request("http://localhost/api/inbox/t1/afgespeeld", { method: "POST", body: JSON.stringify({ messageId }) }), { params: Promise.resolve({ threadId: "t1" }) });
    expect(await (await vraag(m.id)).json()).toEqual({ ok: true, afgevinkt: true });
    expect(await (await vraag("bestaat-niet")).json()).toEqual({ ok: true, afgevinkt: false });
    ik.userId = "c";
    expect((await vraag(m.id)).status).toBe(404);
  });

  it("GET geeft de client alleen beluisterd/doorMijBeluisterd, met de regel van de leesbevestigingen; nooit de lijst met wie", () => {
    const route = lees("app/api/inbox/[threadId]/route.ts");
    expect(route).toContain("const berichten = messages.map(({ afgespeeld, ...m }) => ({");
    expect(route).toContain("beluisterd: !privacy.noReceipts.has(p.userId) && (afgespeeld ?? []).some((uid) => uid !== m.from && !privacy.noReceipts.has(uid)),");
    expect(route).toContain("doorMijBeluisterd: (afgespeeld ?? []).includes(p.userId),");
    expect(route).toContain('golf: z.array(z.number().int().min(0).max(31)).max(64).optional()');
  });
});

describe("de schermen", () => {
  const composer = lees("components/chat/Composer.tsx");
  const bubbel = lees("components/chat/MessageBubble.tsx");

  it("opnemen: ingedrukt houden met de vinger, schuiven, vastzetten met pauze, terugluisteren en verwijderen", () => {
    for (const k of ["onPointerDown={micDown}", "onPointerMove={micMove}", "onPointerUp={micUp}", "touch-none", "schuifStand(dx, dy,", "chat.composer.schuifAnnuleren", "chat.composer.houdIngedrukt", "chat.composer.opnameVerwijderen", "chat.composer.opnamePauzeren", "chat.composer.opnameBeluisteren", "rec.pause()", "rec.resume()", "rec.requestData()"]) {
      expect(composer, k).toContain(k);
    }
    // muis en toetsenbord: klik = meteen vast (zoals WhatsApp Web); een vinger gaat niet via de klik
    expect(composer).toContain('if (e.detail === 0 || via === "mouse") void startOpname("vast");');
    // de golf gaat mee met het bericht
    expect(composer).toContain("attachment: { ...att, ...(golf.length ? { golf } : {}) }");
  });

  it("afspelen: golf, foto met microfoontje, snelheid, één tegelijk en automatisch door", () => {
    for (const k of ["data-spraak-id={id}", '"zf:spraak-speelt"', '"zf:spraak-speel"', "t.beluisterd", "t.nietBeluisterd", "vasteGolf(id)", "/afgespeeld`"]) {
      expect(bubbel, k).toContain(k);
    }
  });
});
