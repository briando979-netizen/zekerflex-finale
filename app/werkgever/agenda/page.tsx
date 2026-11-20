import { requirePrincipal } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { AgendaView } from "@/components/app/AgendaView";
import { PlanningTabs } from "@/components/werkgever/PlanningTabs";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";

export const dynamic = "force-dynamic";

export default async function WerkgeverAgendaPage() {
  await requirePrincipal();
  // vlag `publiek-alleen-flexwerk`: de zakelijke mailbox en de WhatsApp-koppeling zijn geen flexwerk, dus ook hier geen
  // links ernaartoe (de bronnen mail en WhatsApp staan dan niet in het lijstje)
  const alleenFlexwerk = await alleenFlexwerkAan().catch(() => false);
  return (
    <>
      <PlanningTabs actief="agenda" />
      <AgendaView
        t={(await getDict()).agenda}
        withShifts
        {...(alleenFlexwerk ? {} : { mailHref: "/werkgever/mail", whatsappHref: "/werkgever/whatsapp" })}
        shiftHrefBase="/werkgever/diensten/"
      />
    </>
  );
}
