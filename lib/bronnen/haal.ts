import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { fetchPage } from "@/lib/website-check/fetch";
import { isKvkBaseEnabled, lookupCompany } from "@/lib/integrations/kvkbase";
import {
  BRONNEN,
  lege,
  leesBekendmakingen,
  leesMinimumloon,
  leesPompprijzen,
  metingBekendmakingen,
  metingMinimumloon,
  metingPompprijzen,
  metingSchermen,
  type BronId,
  type Meting,
  type Schermafdruk,
} from "@/lib/bronnen/catalogus";
import { kBeeld } from "@/lib/bronnen/store";
import { schermafdruk, scraperIngesteld } from "@/lib/bronnen/scraper";

// ---------------------------------------------------------------------------
// Het ophalen zelf, per bron. Elke bron geeft een Meting terug en gooit nooit:
// een fout wordt een mislukte meting met een leesbare reden. Gewone bronnen
// gaan door de beveiligde fetcher van de website-check (alleen publieke
// adressen, begrensd in tijd en grootte); de schermcontrole door de
// browser-werker (deploy/scraper).
// ---------------------------------------------------------------------------

const UA = "ZekerFlexBronnen/1.0 (+https://zekerflex.com)";

async function haalTekst(url: string, maxBytes = 3_000_000): Promise<string> {
  const p = await fetchPage(url, { timeoutMs: 25_000, maxBytes });
  if (p.status >= 400) throw new Error(`${new URL(url).host} antwoordde met status ${p.status}`);
  return p.body;
}

const CBS = "https://opendata.cbs.nl/ODataApi/odata/80416NED/TypedDataSet";

async function brandstof(): Promise<Omit<Meting, "op" | "duurMs">> {
  // de laatste 45 dagen (de dag van vandaag staat er meestal pas morgen in)
  const vanaf = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const json: unknown = JSON.parse(await haalTekst(`${CBS}?$filter=Perioden%20ge%20%27${vanaf}%27&$select=Perioden,BenzineEuro95_1,Diesel_2,Lpg_3`));
  return metingPompprijzen(leesPompprijzen(json));
}

async function minimumloon(): Promise<Omit<Meting, "op" | "duurMs">> {
  const jaar = new Date().getUTCFullYear();
  // de pagina van dit jaar, en die van volgend jaar zodra Rijksoverheid hem heeft (vanaf oktober)
  const paginas = [jaar, jaar + 1].map((j) => `https://www.rijksoverheid.nl/themas/werk/minimumloon/bedragen-minimumloon/bedragen-minimumloon-${j}`);
  const tabellen = (await Promise.all(paginas.map((u) => haalTekst(u).then(leesMinimumloon).catch(() => [])))).flat();
  const m = metingMinimumloon(tabellen, amsterdamDayKey(Date.now()));
  // wat het voor ZekerFlex betekent: diensten in de toekomst onder het minimum
  const uur = typeof m.waarden.uurloon21 === "number" ? m.waarden.uurloon21 : 0;
  if (m.ok && uur > 0) {
    const onder = await prisma.shift.count({ where: { startsAt: { gt: new Date() }, status: { not: "CANCELLED" }, hourlyRateCents: { lt: Math.round(uur * 100) } } }).catch(() => 0);
    m.waarden.dienstenOnderMinimum = onder;
    if (onder > 0) m.regels.unshift({ tekst: `${onder} geplande ${onder === 1 ? "dienst ligt" : "diensten liggen"} onder het minimumuurloon voor 21+ (kijk in Admin → Klussen)`, toon: "let-op" });
  }
  return m;
}

const SRU = "https://repository.overheid.nl/sru";

async function cao(): Promise<Omit<Meting, "op" | "duurMs">> {
  const vanaf = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);
  const query = `(c.product-area==officielepublicaties AND w.publicatienaam=="Staatscourant" AND (dt.title any "cao" OR dt.title any "arbeidsovereenkomst") AND dt.modified>=${vanaf})`;
  const xml = await haalTekst(`${SRU}?operation=searchRetrieve&version=2.0&maximumRecords=50&query=${encodeURIComponent(query)}`);
  return metingBekendmakingen(leesBekendmakingen(xml), amsterdamDayKey(Date.now()));
}

async function kvk(): Promise<Omit<Meting, "op" | "duurMs">> {
  if (!isKvkBaseEnabled()) return { ...lege("Wacht op een KVKBase-sleutel (KVKBASE_API_KEY in .env.production; zie Te doen)."), tekst: "Nog niet ingesteld" };
  const bedrijven = await prisma.tenant.findMany({ where: { kvkNumber: { not: null } }, select: { id: true, name: true, kvkNumber: true }, orderBy: { createdAt: "asc" }, take: 300 });
  const regels: Meting["regels"] = [];
  let actief = 0;
  let nietActief = 0;
  let onbekend = 0;
  for (const b of bedrijven) {
    try {
      const p = await lookupCompany(b.kvkNumber ?? "");
      if (p.isActive && !p.insolvent) actief++;
      else {
        nietActief++;
        regels.push({ tekst: `${b.name} (KVK ${b.kvkNumber}): ${p.insolvent ? "insolvent" : "niet (meer) actief"}`, toon: "fout" });
      }
    } catch {
      onbekend++;
    }
  }
  return {
    ok: true,
    waarden: { gecontroleerd: bedrijven.length, actief, nietActief, onbekend },
    tekst: bedrijven.length ? `${actief} van ${bedrijven.length} bedrijven actief in het Handelsregister${nietActief ? `, ${nietActief} niet` : ""}${onbekend ? `, ${onbekend} niet op te zoeken` : ""}` : "Nog geen bedrijven met een KVK-nummer",
    regels,
    fout: "",
  };
}

/** De pagina's die elke dag in een echte browser bekeken worden. */
export const SCHERM_PAGINAS = ["/", "/login", "/aanbod", "/shop", "/werkgever/horeca"] as const;

async function schermen(): Promise<Omit<Meting, "op" | "duurMs">> {
  if (!scraperIngesteld()) return { ...lege("De browser-werker staat uit (SCRAPER_TOKEN ontbreekt in .env.production)."), tekst: "Nog niet ingesteld" };
  const basis = env.APP_BASE_URL.replace(/\/$/, "");
  const lijst: Schermafdruk[] = [];
  for (const pad of SCHERM_PAGINAS) {
    try {
      const a = await schermafdruk(`${basis}${pad}`, { breedte: 1280, hoogte: 900, wachtMs: 1200 });
      lijst.push({ pad, status: a.status, dominant: a.dominant, titel: a.titel, ms: a.ms, fout: "" });
      await kvSet(kBeeld(pad), { op: new Date().toISOString(), png: a.png, status: a.status, titel: a.titel, dominant: a.dominant });
    } catch (e) {
      lijst.push({ pad, status: 0, dominant: 0, titel: "", ms: 0, fout: (e instanceof Error ? e.message : "mislukt").slice(0, 160) });
    }
  }
  return metingSchermen(lijst);
}

const HALERS: Record<BronId, () => Promise<Omit<Meting, "op" | "duurMs">>> = { brandstof, minimumloon, cao, kvk, schermen };

/** Eén bron ophalen; geeft altijd een Meting (ook bij een fout). */
export async function haalBron(id: BronId): Promise<Meting> {
  const start = Date.now();
  try {
    const m = await HALERS[id]();
    return { ...m, op: new Date().toISOString(), duurMs: Date.now() - start };
  } catch (e) {
    const reden = e instanceof Error ? e.message : String(e);
    return { ...lege(`${BRONNEN[id].bronNaam}: ${reden.slice(0, 200)}`), op: new Date().toISOString(), duurMs: Date.now() - start };
  }
}

export const BRON_USER_AGENT = UA;
