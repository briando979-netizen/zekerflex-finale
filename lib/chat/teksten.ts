import { SHARED_NL } from "@/lib/chat/teksten-shared";
import { INBOX_NL } from "@/lib/chat/teksten-inbox";
import { COMPOSER_NL } from "@/lib/chat/teksten-composer";
import { POLL_NL } from "@/lib/chat/teksten-poll";
import { ACTIES_NL } from "@/lib/chat/teksten-acties";
import { BUBBLE_NL } from "@/lib/chat/teksten-bubble";
import { MENU_NL } from "@/lib/chat/teksten-menu";
import { ZOEK_NL } from "@/lib/chat/teksten-zoek";
import { KAART_NL } from "@/lib/chat/teksten-kaart";
import { MODALS_NL } from "@/lib/chat/teksten-modals";
import { INSTELLINGEN_NL } from "@/lib/chat/teksten-instellingen";
import { DOCK_NL } from "@/lib/chat/teksten-dock";
import { BEL_NL } from "@/lib/chat/teksten-bel";

// Alle teksten van de chat (components/chat/: InboxPage en wat daaronder hangt), Nederlandse bron. Puur en klein genoeg voor de
// browser; de vier vertalingen staan in lib/chat/teksten-talen.ts en gaan alleen via de werker-pagina (server) mee als `texts`.
// Zonder `texts` (opdrachtgever, beheer) blijft de chat Nederlands. Alleen tekst: het gedrag staat in de componenten.

export interface ChatTeksten {
  inbox: typeof INBOX_NL;
  composer: typeof COMPOSER_NL;
  poll: typeof POLL_NL;
  acties: typeof ACTIES_NL;
  bubble: typeof BUBBLE_NL;
  menu: typeof MENU_NL;
  zoek: typeof ZOEK_NL;
  kaart: typeof KAART_NL;
  modals: typeof MODALS_NL;
  instellingen: typeof INSTELLINGEN_NL;
  dock: typeof DOCK_NL;
  bel: typeof BEL_NL;
  shared: typeof SHARED_NL;
}

export const CHAT_NL: ChatTeksten = {
  inbox: INBOX_NL,
  composer: COMPOSER_NL,
  poll: POLL_NL,
  acties: ACTIES_NL,
  bubble: BUBBLE_NL,
  menu: MENU_NL,
  zoek: ZOEK_NL,
  kaart: KAART_NL,
  modals: MODALS_NL,
  instellingen: INSTELLINGEN_NL,
  dock: DOCK_NL,
  bel: BEL_NL,
  shared: SHARED_NL,
};
