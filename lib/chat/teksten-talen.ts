import type { Locale } from "@/lib/i18n/config";
import { CHAT_NL, type ChatTeksten } from "@/lib/chat/teksten";
import { SHARED_EN, SHARED_PL, SHARED_RO, SHARED_UK } from "@/lib/chat/teksten-shared-talen";
import { INBOX_EN, INBOX_PL, INBOX_RO, INBOX_UK } from "@/lib/chat/teksten-inbox-talen";
import { COMPOSER_EN, COMPOSER_PL, COMPOSER_RO, COMPOSER_UK } from "@/lib/chat/teksten-composer-talen";
import { POLL_EN, POLL_PL, POLL_RO, POLL_UK } from "@/lib/chat/teksten-poll-talen";
import { ACTIES_EN, ACTIES_PL, ACTIES_RO, ACTIES_UK } from "@/lib/chat/teksten-acties-talen";
import { BUBBLE_EN, BUBBLE_PL, BUBBLE_RO, BUBBLE_UK } from "@/lib/chat/teksten-bubble-talen";
import { MENU_EN, MENU_PL, MENU_RO, MENU_UK } from "@/lib/chat/teksten-menu-talen";
import { ZOEK_EN, ZOEK_PL, ZOEK_RO, ZOEK_UK } from "@/lib/chat/teksten-zoek-talen";
import { KAART_EN, KAART_PL, KAART_RO, KAART_UK } from "@/lib/chat/teksten-kaart-talen";
import { MODALS_EN, MODALS_PL, MODALS_RO, MODALS_UK } from "@/lib/chat/teksten-modals-talen";
import { INSTELLINGEN_EN, INSTELLINGEN_PL, INSTELLINGEN_RO, INSTELLINGEN_UK } from "@/lib/chat/teksten-instellingen-talen";

// De chat in de vijf talen van de werker-app. Alleen voor de server (app/dashboard/berichten/page.tsx kiest de taal en geeft
// `texts` aan <InboxPage>); importeer dit nooit in een client-bestand: de browser krijgt alleen de gekozen taal.
// Machine-assisted translations: native-speaker review recommended.

export const CHAT_TEKSTEN: Record<Locale, ChatTeksten> = {
  nl: CHAT_NL,
  en: { inbox: INBOX_EN, composer: COMPOSER_EN, poll: POLL_EN, acties: ACTIES_EN, bubble: BUBBLE_EN, menu: MENU_EN, zoek: ZOEK_EN, kaart: KAART_EN, modals: MODALS_EN, instellingen: INSTELLINGEN_EN, shared: SHARED_EN },
  pl: { inbox: INBOX_PL, composer: COMPOSER_PL, poll: POLL_PL, acties: ACTIES_PL, bubble: BUBBLE_PL, menu: MENU_PL, zoek: ZOEK_PL, kaart: KAART_PL, modals: MODALS_PL, instellingen: INSTELLINGEN_PL, shared: SHARED_PL },
  ro: { inbox: INBOX_RO, composer: COMPOSER_RO, poll: POLL_RO, acties: ACTIES_RO, bubble: BUBBLE_RO, menu: MENU_RO, zoek: ZOEK_RO, kaart: KAART_RO, modals: MODALS_RO, instellingen: INSTELLINGEN_RO, shared: SHARED_RO },
  uk: { inbox: INBOX_UK, composer: COMPOSER_UK, poll: POLL_UK, acties: ACTIES_UK, bubble: BUBBLE_UK, menu: MENU_UK, zoek: ZOEK_UK, kaart: KAART_UK, modals: MODALS_UK, instellingen: INSTELLINGEN_UK, shared: SHARED_UK },
};
