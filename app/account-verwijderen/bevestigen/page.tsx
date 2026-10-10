import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ConfirmAccountDeletionForm } from "@/components/auth/ConfirmAccountDeletionForm";
import { ErasureScopeInfo } from "@/components/privacy/ErasureScopeInfo";
import { isDeletionTokenValid } from "@/lib/privacy/deletion-request";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account verwijderen bevestigen" };

export default async function BevestigAccountVerwijderenPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const searchParams = await props.searchParams;
  const token = searchParams.token ?? "";
  const valid = token ? await isDeletionTokenValid(token) : false;

  return (
    <AuthShell
      title={valid ? "Weet je het zeker?" : "Link werkt niet meer"}
      subtitle={
        valid
          ? "Dit kan niet ongedaan gemaakt worden. Lees hieronder precies wat er gebeurt."
          : "Deze bevestigingslink is verlopen of al gebruikt."
      }
      footer={
        valid ? (
          <Link href="/" className="font-semibold text-brand-600 hover:underline">
            ← Terug naar zekerflex.com
          </Link>
        ) : (
          <Link href="/account-verwijderen" className="font-semibold text-brand-600 hover:underline">
            Vraag een nieuwe link aan
          </Link>
        )
      }
    >
      {valid ? (
        <div className="space-y-6">
          <ErasureScopeInfo />
          <ConfirmAccountDeletionForm token={token} />
        </div>
      ) : (
        <p className="text-sm text-neutralx-600">
          Bevestigingslinks zijn één uur geldig en werken maar één keer. Vraag een nieuwe aan om verder te gaan.
        </p>
      )}
    </AuthShell>
  );
}
