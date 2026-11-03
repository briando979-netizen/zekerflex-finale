import { liveVersie } from "@/lib/bouwer/versie";
import { agentLeeft, isBezig, leesLive } from "@/lib/bouwer/live";
import { bouwer, bouwerGezond, bouwerIngesteld, bouwerInstellingen, type TaakKort } from "@/lib/bouwer/werker";

// De stand van de Bouwer en de uitrol in gewone taal, voor de ZekerFlex AI-chat
// ("hoe staat de bouwer?"). Alleen lezen; elk onderdeel dat niet antwoordt wordt
// gewoon genoemd in plaats van de hele vraag te laten mislukken.

const OPEN = new Set(["bezig", "klaar", "mislukt", "conflict", "goedkeuren"]);

const tijd = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

const kort = (t: string, n = 90) => (t.length > n ? `${t.slice(0, n)}…` : t);

const STAAT: Record<string, string> = {
  bezig: "is ermee bezig",
  klaar: "is klaar en wacht op jouw oordeel",
  mislukt: "is niet gelukt",
  conflict: "botst met de nieuwste versie",
  goedkeuren: "wordt nu naar GitHub gezet",
};

export async function bouwerStand(): Promise<string> {
  const regels: string[] = [];
  const [live, instellingen, gezond] = await Promise.all([
    leesLive().catch(() => null),
    bouwerInstellingen().catch(() => null),
    bouwerGezond(),
  ]);

  // live
  const versie = liveVersie();
  regels.push(versie ? `Live staat: ${kort(versie.onderwerp)} (${versie.sha.slice(0, 7)}, ${tijd(versie.datum)}).` : "Live staat een versie zonder versienummer (oudere uitrol).");
  if (live?.status) {
    const s = live.status;
    regels.push(
      isBezig(s)
        ? `Er loopt nu een uitrol: ${s.stap}.`
        : s.staat === "wacht-op-akkoord"
          ? `De laatste uitrol wacht op jouw akkoord voor ${s.migraties.length} database-wijziging(en) (tabblad Live zetten).`
          : `Laatste uitrol via de knop: ${s.bericht || s.stap} (${tijd(s.klaar ?? s.bijgewerkt)}).`,
    );
  }
  if (live && !agentLeeft(live.hartslag)) regels.push("Let op: de live-zetter op de server reageert niet.");

  // de Bouwer
  if (!bouwerIngesteld()) regels.push("De Bouwer is nog niet geïnstalleerd op de server.");
  else if (!gezond?.ok) regels.push("De Bouwer reageert nu niet.");
  else {
    const lijst = await bouwer<{ bezig: string | null; taken: TaakKort[] }>("/taken").catch(() => null);
    const open = lijst?.taken.find((t) => OPEN.has(t.staat));
    regels.push(
      open
        ? `De Bouwer ${STAAT[open.staat] ?? open.staat}: "${kort(open.opdracht)}"${open.door ? ` (van ${open.door})` : ""}.`
        : "De Bouwer staat klaar voor een nieuwe opdracht.",
    );
  }
  if (instellingen) {
    regels.push(
      `Model: ${instellingen.model}. GitHub-sleutel: ${instellingen.githubSleutel ? "ingesteld" : "ontbreekt (nodig om live te zetten)"}. Automatische reparaties: ${instellingen.autoFouten ? "aan" : "uit"}.`,
    );
  }
  regels.push("Alles staat in het tabblad Bouwer en Live zetten van deze werkbank.");
  return regels.join("\n");
}
