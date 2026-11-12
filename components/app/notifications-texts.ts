// Teksten van de meldingenbel (components/app/NotificationsBell.tsx). Alleen platte strings, zodat een serverpagina of een
// shell ze als prop kan meegeven. Werkgever en beheer gebruiken de Nederlandse standaard (de bel krijgt dan geen prop);
// het werkersdashboard geeft de vertaling uit lib/i18n/freelancer.ts (sectie meldingen) mee. Zelfde aanpak als
// components/auth/two-factor-texts.ts. De meldingen zelf (titel en tekst) komen uit /api/me/notifications.

export interface NotificationsTexts {
  /** de naam van de bel en de kop van het paneel */
  bell: string;
  close: string;
  all: string;
  markAllRead: string;
  groups: { klussen: string; geld: string; berichten: string; account: string };
  sections: { today: string; yesterday: string; earlier: string };
  empty: string;
  emptyTab: string;
  open: string;
  read: string;
}

export const NOTIFICATIONS_NL: NotificationsTexts = {
  bell: "Meldingen",
  close: "Sluiten",
  all: "Alles",
  markAllRead: "Alles als gelezen markeren",
  groups: { klussen: "Over je klussen", geld: "Uren & uitbetaling", berichten: "Berichten", account: "Account" },
  sections: { today: "Vandaag", yesterday: "Gisteren", earlier: "Eerder" },
  empty: "Niets nieuws — je bent bij.",
  emptyTab: "Geen meldingen in dit tabblad.",
  open: "Openen",
  read: "Gelezen",
};
