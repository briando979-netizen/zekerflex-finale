import { requirePrincipal } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { InboxPage } from "@/components/chat/InboxPage";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function WerkgeverBerichtenPage() {
  await requirePrincipal();
  const m = (await getDict()).messages;
  return (
    <>
      <PageHeader title={m.title} eyebrow={m.eyebrow} subtitle={m.subtitle} />
      <InboxPage />
    </>
  );
}
