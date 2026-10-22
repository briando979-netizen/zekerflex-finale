// ---------------------------------------------------------------------------
// One list of every place ZekerFlex uses the language model, for the admin
// AI overview: who sees it, and what happens while no model is connected.
// Keep it in sync when an AI feature is added — the overview is how the owner
// sees what switching the model on actually buys them.
// ---------------------------------------------------------------------------

export type AiAudience = "bezoeker" | "werknemer" | "opdrachtgever" | "admin";

export interface AiFeature {
  key: string;
  name: string;
  audience: AiAudience[];
  where: string;
  withModel: string;
  /** what still works without the model — "uit" means the feature is simply not available */
  withoutModel: string;
}

export const AI_FEATURES: AiFeature[] = [
  { key: "brain", name: "ZekerFlex-assistent (brein)", audience: ["werknemer", "opdrachtgever", "admin"], where: "Chat → Tools → ✨ assistent, /dashboard/assistent, /werkgever/assistent", withModel: "beantwoordt vrije vragen uit je eigen gegevens (tools) + kennis, met geheugen", withoutModel: "regel-router haalt je gegevens op (planning, uren, geld, bezetting) + beste kennisbank-antwoord" },
  { key: "rag-hybrid", name: "Hybride zoeken (RAG-brein)", audience: ["bezoeker", "werknemer", "opdrachtgever", "admin"], where: "assistent, website-chat, Jarvis, orchestrator, Admin RAG", withModel: "BM25 + brein-vector + embedding-vectoren, samengevoegd met Reciprocal Rank Fusion", withoutModel: "BM25 + brein-vector (lokale n-gram-vectoren) met RRF — werkt altijd" },
  { key: "webchat", name: "Website-chat", audience: ["bezoeker"], where: "chatknop op de website", withModel: "beantwoordt vrije vragen in gewone taal", withoutModel: "vaste antwoorden + kennisbank-zoeken" },
  { key: "chat-assist", name: "Antwoordsuggesties in de chat", audience: ["werknemer", "opdrachtgever", "admin"], where: "Berichten → ✨", withModel: "3 passende antwoorden op het laatste bericht", withoutModel: "suggesties op basis van trefwoorden" },
  { key: "chat-rewrite", name: "Herschrijven & vertalen in de chat", audience: ["werknemer", "opdrachtgever", "admin"], where: "Berichten → ✨ herschrijf", withModel: "vriendelijker / korter / zakelijk, of vertalen (EN/PL/DE/RO/AR)", withoutModel: "uit" },
  { key: "shift-writer", name: "Klus-omschrijving schrijven", audience: ["opdrachtgever"], where: "Nieuwe klus → ✨ Schrijf voor mij", withModel: "volledige vacaturetekst + kledingvoorschriften", withoutModel: "sjabloon per beroep (taken, werktijd, meenemen)" },
  { key: "motivation-writer", name: "Motivatie schrijven", audience: ["werknemer"], where: "Reageren op klus → ✨ Help me", withModel: "persoonlijke motivatie uit je eigen werkverleden", withoutModel: "sjabloon met je aantal diensten en eerdere klussen bij deze klant" },
  { key: "kyc-vision", name: "ID- en selfiecontrole", audience: ["werknemer", "admin"], where: "verificatie", withModel: "leest het document en vergelijkt met de selfie (vision-model)", withoutModel: "admin beoordeelt handmatig (Gebruikers → KYC goed-/afkeuren)" },
  { key: "onboarding-verify", name: "Gegevens-check bij aanmelden", audience: ["werknemer", "opdrachtgever"], where: "onboarding", withModel: "controleert ingevulde gegevens op tegenstrijdigheden", withoutModel: "alleen de vaste regels (KVK, IBAN, BSN-checks)" },
  { key: "agenda-titles", name: "Agenda-titels uit mail", audience: ["opdrachtgever"], where: "Agenda", withModel: "nette titel + locatie uit een afspraakmail", withoutModel: "titel uit de onderwerpregel" },
  { key: "skills-paths", name: "Leerpaden", audience: ["werknemer"], where: "Account → Vaardigheden", withModel: "persoonlijk leerpad naar beter betaalde klussen", withoutModel: "vaste leerpaden" },
  { key: "rag", name: "Kennisbank-antwoorden", audience: ["bezoeker", "admin"], where: "chat + Jarvis", withModel: "antwoord samengesteld uit eigen documenten", withoutModel: "lijst met gevonden passages" },
  { key: "ads", name: "Advertentieteksten", audience: ["admin"], where: "Admin → Marketing", withModel: "nieuwe varianten per doelgroep", withoutModel: "vaste sjablonen" },
  { key: "sales", name: "Sales- en recruitermails", audience: ["admin"], where: "Admin → Sales", withModel: "gepersonaliseerde concepten per lead", withoutModel: "handgeschreven standaardmail per stap" },
  { key: "jarvis", name: "Jarvis / admin-console", audience: ["admin"], where: "Admin → Jarvis", withModel: "vrije opdrachten en uitleg", withoutModel: "vaste commando's" },
  { key: "ai-teams", name: "AI-teams & voice-briefing", audience: ["admin"], where: "Admin → AI-teams", withModel: "autonome analyses en dagbriefing", withoutModel: "uit (gepauzeerd)" },
];
