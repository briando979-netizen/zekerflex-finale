import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { outlinePubliekeUrl } from "@/lib/oidc/aanbieder";

// ---------------------------------------------------------------------------
// De kennisbank: Outline (open source, Notion-achtig) in Docker op de eigen
// server, met "Inloggen met ZekerFlex" (lib/oidc). Alle ZekerFlex-accounts
// kunnen erin; de eerste die inlogt is beheerder. ZekerFlex vult hem met de
// handleidingen uit docs/kennisbank (één map per verzameling) via de API van
// Outline; daarvoor is een API-sleutel nodig die de beheerder in Outline maakt
// en in Admin → Kennisbank plakt (KV kennisbank:api).
// ---------------------------------------------------------------------------

const K_API = "kennisbank:api";
const K_STAND = "kennisbank:stand";
const MAP = path.join(process.cwd(), "docs", "kennisbank");

export const kennisbankIngesteld = () => Boolean(env.OUTLINE_URL && outlinePubliekeUrl() && env.OIDC_OUTLINE_SECRET);

export interface KennisbankStand {
  apiGezet: boolean;
  laatstGevuld: string | null;
  verzamelingen: { naam: string; documenten: number }[];
  laatsteFout: string | null;
}

export async function leesStand(): Promise<KennisbankStand> {
  const [api, stand] = await Promise.all([kvGet<string>(K_API), kvGet<Partial<KennisbankStand>>(K_STAND)]);
  return { apiGezet: Boolean(api), laatstGevuld: null, verzamelingen: [], laatsteFout: null, ...(stand ?? {}) };
}

export async function bewaarApiSleutel(sleutel: string): Promise<void> {
  const s = sleutel.trim();
  if (!/^ol_api_[A-Za-z0-9]{20,}$/.test(s) && s.length < 20) throw AppError.validation("Dat ziet er niet uit als een API-sleutel van Outline (begint met ol_api_).");
  await kvSet(K_API, s);
}

/** Draait Outline en antwoordt hij? */
export async function outlineGezond(): Promise<boolean> {
  if (!env.OUTLINE_URL) return false;
  try {
    const r = await fetch(`${env.OUTLINE_URL.replace(/\/$/, "")}/_health`, { signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function api<T>(pad: string, body: Record<string, unknown>): Promise<T> {
  const sleutel = await kvGet<string>(K_API);
  if (!sleutel) throw AppError.precondition("Nog geen API-sleutel van Outline (Admin → Kennisbank).");
  const r = await fetch(`${(env.OUTLINE_URL ?? "").replace(/\/$/, "")}/api/${pad}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${sleutel}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const d = (await r.json().catch(() => null)) as { ok?: boolean; data?: T; message?: string; error?: string } | null;
  if (!r.ok || !d?.ok) throw AppError.upstream(`Outline ${pad}: ${d?.message ?? d?.error ?? `status ${r.status}`}`);
  return d.data as T;
}

interface Verzameling {
  id: string;
  name: string;
}
interface Document {
  id: string;
  title: string;
}

/** De handleidingen op schijf: elke submap is een verzameling, elk .md-bestand een document (eerste # = titel). */
export async function handleidingenOpSchijf(): Promise<{ verzameling: string; uitleg: string; documenten: { titel: string; tekst: string; volgorde: number }[] }[]> {
  const mappen = (await readdir(MAP, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const uit = [];
  for (const map of mappen) {
    const bestanden = (await readdir(path.join(MAP, map))).filter((f) => f.endsWith(".md")).sort();
    const documenten = [];
    let uitleg = "";
    let verzameling = map.replace(/^\d+-/, "").replace(/-/g, " ");
    for (const f of bestanden) {
      const tekst = await readFile(path.join(MAP, map, f), "utf8");
      if (f === "_verzameling.md") {
        // eerste regel = naam, de rest = omschrijving
        const [eerste = "", ...rest] = tekst.trim().split("\n");
        verzameling = eerste.replace(/^#\s*/, "").trim() || verzameling;
        uitleg = rest.join("\n").trim();
        continue;
      }
      const titel = (/^#\s+(.+)$/m.exec(tekst)?.[1] ?? f.replace(/\.md$/, "")).trim();
      documenten.push({ titel, tekst: tekst.replace(/^#\s+.+\n/, "").trim(), volgorde: documenten.length });
    }
    uit.push({ verzameling, uitleg, documenten });
  }
  return uit;
}

/** Vult (of vult aan) de kennisbank met de handleidingen op schijf. Bestaande titels worden bijgewerkt. */
export async function vulKennisbank(): Promise<KennisbankStand> {
  const stand = await leesStand();
  try {
    const bestaand = await api<Verzameling[]>("collections.list", { limit: 100 });
    const verzamelingen: KennisbankStand["verzamelingen"] = [];
    for (const v of await handleidingenOpSchijf()) {
      let col = bestaand.find((c) => c.name === v.verzameling);
      if (!col) col = await api<Verzameling>("collections.create", { name: v.verzameling, description: v.uitleg, permission: "read", sharing: false });
      const docs = await api<Document[]>("documents.list", { collectionId: col.id, limit: 100 });
      for (const d of v.documenten) {
        const al = docs.find((x) => x.title === d.titel);
        if (al) await api("documents.update", { id: al.id, text: d.tekst, publish: true, done: true });
        else await api("documents.create", { collectionId: col.id, title: d.titel, text: d.tekst, publish: true });
      }
      verzamelingen.push({ naam: v.verzameling, documenten: v.documenten.length });
    }
    const nieuw: KennisbankStand = { apiGezet: true, laatstGevuld: new Date().toISOString(), verzamelingen, laatsteFout: null };
    await kvSet(K_STAND, nieuw);
    return nieuw;
  } catch (e) {
    const nieuw: KennisbankStand = { ...stand, laatsteFout: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
    await kvSet(K_STAND, nieuw);
    return nieuw;
  }
}
