// Teksten van de meldingenbel (components/app/NotificationsBell.tsx). Alleen platte strings, zodat een serverpagina of een
// shell ze als prop kan meegeven. Beheer gebruikt de Nederlandse standaard (de bel krijgt dan geen prop); het
// werkersdashboard geeft de vertaling uit lib/i18n/freelancer.ts (sectie meldingen) mee; de werkgeversapp sinds 15 nov 2026
// zijn eigen tabbladen (Diensten, Uren & facturen) in het Nederlands of Engels (NOTIFICATIONS_BEDRIJF). Zelfde aanpak als
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

/** De bel in de werkgeversapp: tabbladen voor een bedrijf in plaats van "Over je klussen" en "Uren & uitbetaling". */
export const NOTIFICATIONS_BEDRIJF: { nl: NotificationsTexts; en: NotificationsTexts } = {
  nl: {
    ...NOTIFICATIONS_NL,
    groups: { klussen: "Diensten", geld: "Uren & facturen", berichten: "Berichten", account: "Account" },
    empty: "Niets nieuws.",
  },
  en: {
    bell: "Notifications",
    close: "Close",
    all: "All",
    markAllRead: "Mark all as read",
    groups: { klussen: "Shifts", geld: "Hours & invoices", berichten: "Messages", account: "Account" },
    sections: { today: "Today", yesterday: "Yesterday", earlier: "Earlier" },
    empty: "Nothing new.",
    emptyTab: "No notifications in this tab.",
    open: "Open",
    read: "Read",
  },
};
