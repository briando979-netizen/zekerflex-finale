import { featureEnabled } from "@/lib/flags";
import { leesInfoStand } from "@/lib/mail/info-opslag";
import { INFO_MAIL_VLAG } from "@/lib/mail/info-ronde";
import { InfoMailBeeld } from "@/components/admin/InfoMailBeeld";

/** Beheer → Mail: het paneel "Postbus info@ afhandelen" (servercomponent: haalt de stand en de vlag op). */
export async function InfoMailPanel() {
  const [echt, stand] = await Promise.all([featureEnabled(INFO_MAIL_VLAG).catch(() => false), leesInfoStand()]);
  return <InfoMailBeeld echt={echt} stand={stand} />;
}
