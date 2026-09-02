import { requirePrincipal } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { InboxPage } from "@/components/chat/InboxPage";

export const dynamic = "force-dynamic";

export default async function WerkgeverBerichtenPage() {
  await requirePrincipal();
  return (
    <>
      <PageHeader
        title="Berichten"
        eyebrow="Chat"
        subtitle="Chat met je krachten over diensten, en met ZekerFlex Support."
      />
      <InboxPage />
    </>
  );
}
