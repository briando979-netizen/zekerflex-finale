import { requirePrincipal } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { AgendaView } from "@/components/app/AgendaView";

export const dynamic = "force-dynamic";

export default async function WerkgeverAgendaPage() {
  await requirePrincipal();
  return (
    <AgendaView
      t={(await getDict()).agenda}
      withShifts
      mailHref="/werkgever/mail"
      whatsappHref="/werkgever/whatsapp"
      shiftHrefBase="/werkgever/diensten/"
    />
  );
}
