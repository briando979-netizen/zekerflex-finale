import { requirePrincipal } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { InboxPage } from "@/components/chat/InboxPage";
import { CHAT_TEKSTEN } from "@/lib/chat/teksten-talen";
import { getFreelancerDict, getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function BerichtenPage() {
  await requirePrincipal();
  const rt = (await getFreelancerDict()).restTaal;
  return (
    <>
      {/* on a phone the bottom tab already says "Chat" — the chat gets the screen */}
      <div className="hidden md:block">
        <PageHeader
          title={rt.berichtenTitel}
          eyebrow="Chat"
          subtitle={rt.berichtenSub}
        />
      </div>
      {/* de kop is op de telefoon verborgen; de pagina houdt een h1 voor schermlezers */}
      <h1 className="sr-only md:hidden">{rt.berichtenTitel}</h1>
      {/* de chat in de taal van de werker; opdrachtgever en beheer geven niets mee en blijven Nederlands */}
      <InboxPage texts={CHAT_TEKSTEN[await getLocale()]} />
    </>
  );
}
