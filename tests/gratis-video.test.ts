import { afterEach, describe, expect, it, vi } from "vitest";

import { leesSse, ltxMaat, maakGratisClip, vertaalFout } from "@/lib/ai/gratis-video";

const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(2000)]);

function antwoord(status: number, body: string | Buffer) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body.toString(),
    json: async () => JSON.parse(body.toString()),
    arrayBuffer: async () => Uint8Array.from(Buffer.isBuffer(body) ? body : Buffer.from(body)).buffer,
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("gratis AI-video (LTX-2.3)", () => {
  it("leest een Gradio-eventstream", () => {
    const ev = leesSse('event: heartbeat\ndata: null\n\nevent: complete\ndata: [{"url": "x"}, 5]\n\n');
    expect(ev.map((e) => e.event)).toEqual(["heartbeat", "complete"]);
    expect(JSON.parse(ev[1]!.data)[1]).toBe(5);
  });

  it("maten zijn veelvouden van 32 en volgen het formaat", () => {
    for (const f of ["9:16", "16:9", "1:1", "4:5"] as const) {
      for (const k of ["snel", "scherp"] as const) {
        const { breedte, hoogte } = ltxMaat(f, k);
        expect(breedte % 32).toBe(0);
        expect(hoogte % 32).toBe(0);
      }
    }
    expect(ltxMaat("9:16", "scherp").hoogte).toBeGreaterThan(ltxMaat("9:16", "scherp").breedte);
    expect(ltxMaat("16:9", "snel").breedte).toBeGreaterThan(ltxMaat("16:9", "snel").hoogte);
  });

  it("vertaalt een op tegoed in gewone taal", () => {
    expect(vertaalFout('"You have exceeded your GPU quota (75s requested vs. 10s left)."')).toMatch(/tegoed/);
    expect(vertaalFout(null)).toMatch(/fout/);
  });

  it("start, wacht op 'complete' en downloadt van de generator zelf", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(antwoord(200, JSON.stringify({ event_id: "abc12345def" })))
      .mockResolvedValueOnce(antwoord(200, 'event: heartbeat\ndata: null\n\nevent: complete\ndata: [{"url": "https://lightricks-ltx-2-3.hf.space/gradio_api/file=/tmp/x.mp4"}, 42]\n\n'))
      .mockResolvedValueOnce(antwoord(200, MP4));
    vi.stubGlobal("fetch", fetchMock);
    const uit = await maakGratisClip({ prompt: "a waiter", duur: 4, formaat: "9:16", kwaliteit: "scherp" });
    expect(uit.seed).toBe(42);
    expect(uit.mp4.subarray(4, 8).toString()).toBe("ftyp");
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    // foto, prompt, duur, verbeteren, seed, willekeurig, hoogte, breedte
    expect(body.data).toEqual([null, "a waiter", 4, false, 10, true, 1536, 864]);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/gradio_api/call/generate_video/abc12345def");
  });

  it("een foto gaat eerst via de upload en daarna als pad mee", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(antwoord(200, JSON.stringify(["/tmp/gradio/abc/foto.jpg"])))
      .mockResolvedValueOnce(antwoord(200, JSON.stringify({ event_id: "abc12345def" })))
      .mockResolvedValueOnce(antwoord(200, 'event: complete\ndata: [{"url": "https://lightricks-ltx-2-3.hf.space/gradio_api/file=/tmp/y.mp4"}, 7]\n\n'))
      .mockResolvedValueOnce(antwoord(200, MP4));
    vi.stubGlobal("fetch", fetchMock);
    await maakGratisClip({ prompt: "move", duur: 3, formaat: "16:9", kwaliteit: "snel", foto: Buffer.from([0xff, 0xd8, 0xff]) });
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/gradio_api/upload");
    const body = JSON.parse(String(fetchMock.mock.calls[1]![1].body));
    expect(body.data[0].path).toBe("/tmp/gradio/abc/foto.jpg");
    expect(body.data[6]).toBe(576);
    expect(body.data[7]).toBe(1024);
  });

  it("een directe weigering zonder tekst = tegoed op", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(antwoord(200, JSON.stringify({ event_id: "abc12345def" })))
        .mockResolvedValueOnce(antwoord(200, "event: error\ndata: null\n\n")),
    );
    await expect(maakGratisClip({ prompt: "x", duur: 3, formaat: "1:1", kwaliteit: "snel" })).rejects.toThrow(/tegoed/);
  });

  it("weigert een download van een ander adres", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(antwoord(200, JSON.stringify({ event_id: "abc12345def" })))
        .mockResolvedValueOnce(antwoord(200, 'event: complete\ndata: [{"url": "https://kwaad.example/x.mp4"}, 1]\n\n')),
    );
    await expect(maakGratisClip({ prompt: "x", duur: 3, formaat: "1:1", kwaliteit: "snel" })).rejects.toThrow(/onverwacht adres/);
  });

  it("een fout-event wordt een nette melding", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(antwoord(200, JSON.stringify({ event_id: "abc12345def" })))
        .mockResolvedValueOnce(antwoord(200, 'event: error\ndata: "You have exceeded your free GPU quota"\n\n')),
    );
    await expect(maakGratisClip({ prompt: "x", duur: 3, formaat: "1:1", kwaliteit: "snel" })).rejects.toThrow(/tegoed/);
  });
});
