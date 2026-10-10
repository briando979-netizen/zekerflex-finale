import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account verwijderd" };

export default function AccountVerwijderdPage() {
  return (
    <AuthShell
      title="Je account is verwijderd"
      subtitle="Je naam, e-mailadres, telefoonnummer en profielgegevens zijn geanonimiseerd en je kunt niet meer inloggen."
      footer={
        <Link href="/" className="font-semibold text-brand-600 hover:underline">
          ← Terug naar zekerflex.com
        </Link>
      }
    >
      <p className="text-sm text-neutralx-600">
        Gegevens waar we wettelijk een bewaarplicht voor hebben (zoals facturen en urenstaten) blijven nog een
        tijd bewaard, maar zijn niet langer aan een werkend account gekoppeld. Vragen? Mail{" "}
        <a href="mailto:privacy@zekerflex.com" className="font-semibold text-brand-600 hover:underline">
          privacy@zekerflex.com
        </a>
        .
      </p>
    </AuthShell>
  );
}
