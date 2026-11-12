import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { TE_GROOT, eisContentLength, formDataBegrensd, jsonBegrensd, leesBegrensd, tekstBegrensd } from "@/lib/http/body-grens";

// Een body begrensd inlezen (12 nov 2026): eerst Content-Length, en ook zonder die kop stopt het lezen bij de grens.
// Te groot = 422, nooit 403.

const verzoek = (body: BodyInit | null, koppen: Record<string, string> = {}) => new Request("http://localhost/x", { method: "POST", body, headers: koppen, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);

/** Een stroom zonder Content-Length (chunked), in stukken van 1 kB. */
const stroom = (bytes: number) => {
  let rest = bytes;
  // zoals een netwerkstroom: een stuk pas als erom gevraagd wordt (dan kan het lezen halverwege stoppen)
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (rest <= 0) return c.close();
      const n = Math.min(1024, rest);
      rest -= n;
      c.enqueue(new Uint8Array(n));
    },
  });
};

const fout = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x);
  expect(e).toBeInstanceOf(AppError);
  expect((e as AppError).status).toBe(422);
  expect((e as AppError).message).toBe(TE_GROOT);
};

describe("body-grens", () => {
  it("weigert op Content-Length, nog vóór het lezen", async () => {
    expect(() => eisContentLength(verzoek("x", { "content-length": "5000" }), 4000)).toThrow(AppError);
    expect(() => eisContentLength(verzoek("x", { "content-length": "100" }), 4000)).not.toThrow();
    expect(() => eisContentLength(verzoek("x"), 4000)).not.toThrow();
  });

  it("stopt ook zonder Content-Length (chunked) zodra de grens bereikt is", async () => {
    await fout(leesBegrensd(verzoek(stroom(10_000)), 4_000));
    expect((await leesBegrensd(verzoek(stroom(3_000)), 4_000)).byteLength).toBe(3_000);
  });

  it("tekst, JSON en formulier binnen de grens werken gewoon", async () => {
    expect(await tekstBegrensd(verzoek("hallo"), 100)).toBe("hallo");
    expect(await jsonBegrensd(verzoek('{"a":1}', { "content-type": "application/json" }), 100)).toEqual({ ok: true, waarde: { a: 1 } });
    expect(await jsonBegrensd(verzoek("{kapot"), 100)).toEqual({ ok: false });
    const f = new FormData();
    f.set("code", "abc");
    f.set("bestand", new Blob([new Uint8Array(10)], { type: "image/jpeg" }), "a.jpg");
    const r = new Request("http://localhost/x", { method: "POST", body: f });
    const terug = await formDataBegrensd(r, 10_000);
    expect(terug?.get("code")).toBe("abc");
    expect((terug?.get("bestand") as File).size).toBe(10);
  });

  it("een te groot formulier: 422", async () => {
    const f = new FormData();
    f.set("bestand", new Blob([new Uint8Array(20_000)]), "a.bin");
    // zoals een echte upload binnenkomt: de multipart-bytes als netwerkstroom (niet undici's eigen FormData-stroom)
    const vorm = new Response(f);
    const bytes = new Uint8Array(await vorm.arrayBuffer());
    let plek = 0;
    const net = new ReadableStream<Uint8Array>({
      pull(c) {
        if (plek >= bytes.length) return c.close();
        c.enqueue(bytes.slice(plek, plek + 1024));
        plek += 1024;
      },
    });
    await fout(formDataBegrensd(verzoek(net, { "content-type": vorm.headers.get("content-type") ?? "" }), 10_000));
  });
});
