// Teksten van het belscherm (components/chat/CallOverlay.tsx), Nederlandse bron. Alleen zichtbare tekst; de statuswaarden
// ("ringing", "live", …) blijven in de component en kiezen hier alleen de getoonde zin. Plaatshouders vult vulIn.
export const BEL_NL = {
  statusOvergaan: "Overgaan…",
  statusVerbinden: "Verbinden…",
  statusBeeindigd: "Beëindigd",
  statusGeenMicrofoon: "Geen microfoon",
  statusMislukt: "Verbinding mislukt",
  microfoonAan: "Microfoon aan",
  microfoonUit: "Microfoon uit",
  ophangen: "Ophangen",
  grootScherm: "Groot scherm",
  verkleinen: "↙ Verkleinen en verder chatten",
  geenToegangTitel: "Geen toegang tot je microfoon",
  geenToegangAudio:
    "Sta de microfoon toe in je browser: klik op het slotje naast het adres, zet het op Toestaan en bel daarna opnieuw.",
  geenToegangVideo:
    "Sta de microfoon en camera toe in je browser: klik op het slotje naast het adres, zet het op Toestaan en bel daarna opnieuw.",
  verbindenMisluktTitel: "Kon niet verbinden met {naam}",
  verbindenMisluktUitleg:
    "Dit gebeurt meestal als jullie netwerken geen directe verbinding kunnen opzetten. Probeer het opnieuw, of vraag de ander om via wifi te bellen in plaats van mobiel internet.",
  sluiten: "Sluiten",
  camera: "Camera",
  stopSchermDelen: "Stop scherm delen",
  schermDelen: "Scherm delen",
  terugNaarChat: "Terug naar de chat (het gesprek loopt door)",
  videoAan: "Video aanzetten",
  videoUit: "Video uitzetten",
  cameraWisselen: "Camera wisselen",
  cameraStaatUit: "{naam} heeft de camera uit",
  beeldWisselen: "Groot en klein beeld wisselen",
  knoppenTonen: "Knoppen tonen of verbergen",
  spraakoproep: "Spraakoproep",
  videooproep: "Video-oproep",
  schermoproep: "Wil een scherm delen",
  cameraGeenToegang: "Geen toegang tot je camera. Sta de camera toe via het slotje naast het adres.",
};
export type BelTeksten = typeof BEL_NL;
