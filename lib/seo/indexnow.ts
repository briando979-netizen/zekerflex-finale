import { SITE } from "@/lib/seo";

// IndexNow: direct bij Bing (+ Yandex, Seznam) melden welke URL's nieuw/gewijzigd
// zijn, zodat ze snel geïndexeerd worden — precies wat ontbrak t.o.v. Google.
// Zet INDEXNOW_KEY (een GUID) in de env; zonder key is dit een no-op.
// De key wordt gehost op /api/indexnow-key (keyLocation), zodat IndexNow kan
// verifiëren dat wij de site bezitten.

export function indexNowKey(): string | null {
  return process.env.INDEXNOW_KEY?.trim() || null;
}

export function indexNowKeyLocation(): string {
  return `${SITE.url}/api/indexnow-key`;
}

/** Meld een lijst absolute URL's aan IndexNow. Best effort; faalt stil. */
export async function pingIndexNow(urls: string[]): Promise<{ sent: number; ok: boolean }> {
  const key = indexNowKey();
  const list = [...new Set(urls)].filter((u) => u.startsWith("http")).slice(0, 10_000);
  if (!key || list.length === 0) return { sent: 0, ok: false };
  const host = new URL(SITE.url).host;
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: indexNowKeyLocation(), urlList: list }),
    });
    return { sent: list.length, ok: res.ok };
  } catch {
    return { sent: 0, ok: false };
  }
}
