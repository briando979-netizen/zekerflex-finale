"use client";

import { SiteChat } from "@/components/sitechat/SiteChat";
import { CONTACT } from "@/lib/voorstel/smileyapp";

// De AI-assistent van het SmileyApp-voorstel: de gewone websitechat
// (components/sitechat) in hun kleuren. Hij kent alleen de teksten van
// smileyapp.nl (lib/voorstel/smileyapp-chat.ts). `team`: kan iemand van
// SmileyApp in het beheer inloggen en dus meelezen? Zo niet, dan is er geen
// knop "Medewerker" en belooft de chat niets: wie het zeker wil weten, mailt.

export function SmileyChat({ team = false }: { team?: boolean }) {
  return (
    <div className="print:hidden">
      <SiteChat
        api="/api/voorstel/smileyapp/chat"
        opslag="smiley-chat"
        titel="AI-assistent van Smileyapp"
        begroeting="Hoi! Ik ben de AI-assistent van Smileyapp. Ik beantwoord je vragen met de informatie van deze site: hoe het werkt, de pakketten en de prijzen. Waar kan ik je mee helpen?"
        suggesties={["Hoe werkt Smileyapp?", "Wat kost het Basis Pakket?", "Welke vragen kan ik stellen?", "Hoe word ik partner?"]}
        contact={`mail naar ${CONTACT.email}`}
        stijl={{ knop: "bg-smiley-sun text-smiley-ink", kop: "bg-smiley-ink text-white", gast: "bg-smiley-ink text-white", actie: "bg-smiley-green text-smiley-ink" }}
        medewerker={team}
        knopTekst="Vraag de AI-assistent"
      />
    </div>
  );
}
