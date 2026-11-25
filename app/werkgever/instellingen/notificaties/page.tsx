import type { Metadata } from "next";
import { requirePrincipal } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { mailPrefsView } from "@/lib/mail/prefs";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";
import { MailPrefsToggles } from "@/components/marketing/MailPrefsToggles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Notificaties" };

// Instellingen → Notificaties (25 nov 2026): een eigen pagina voor e-mailvoorkeuren per gebeurtenis.
// Was een blok onderaan Bedrijfsprofiel (#notificaties); de kaart op Instellingen wijst nu hiernaartoe.
export default async function NotificatiesPage() {
  const principal = await requirePrincipal();
  const d = await getDict();
  const s = d.settings;
  const mailPrefs = await mailPrefsView(principal.email, "bedrijf");

  return (
    <>
      <InstellingenKop title={s.cNotifT} />
      <p className="mb-6 text-sm leading-relaxed text-neutralx-600">{s.cNotifS}</p>
      <MailPrefsToggles
        token={mailPrefs.token}
        initialCategories={mailPrefs.categories}
        initialUnsubscribedAll={mailPrefs.unsubscribedAll}
        kant="bedrijf"
      />
    </>
  );
}
