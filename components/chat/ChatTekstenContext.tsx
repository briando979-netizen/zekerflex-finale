"use client";

import { createContext, useContext, type ReactNode } from "react";
import { CHAT_NL, type ChatTeksten } from "@/lib/chat/teksten";

// De teksten van de chat (InboxPage en alles eronder) in de taal van de werker. Alleen de werker-pagina geeft `texts` mee
// (app/dashboard/berichten/page.tsx kiest de taal op de server); opdrachtgever en beheer krijgen niets mee en blijven Nederlands.
// Een context in plaats van een prop door elk onderdeel: de vensters en sheets staan in een <Portal>, en een context loopt
// daar gewoon doorheen. Alleen tekst; geen gedrag.

const Ctx = createContext<ChatTeksten>(CHAT_NL);

export function ChatTekstenProvider({ texts, children }: { texts?: ChatTeksten | undefined; children: ReactNode }) {
  return <Ctx.Provider value={texts ?? CHAT_NL}>{children}</Ctx.Provider>;
}

/** De teksten van het scherm; zonder provider (of zonder `texts`) Nederlands. */
export function useChatTeksten(): ChatTeksten {
  return useContext(Ctx);
}
