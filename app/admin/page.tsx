import { getPrincipal, hasRole } from "@/lib/auth";
import { ControlCenter } from "@/components/admin/ControlCenter";
import { WelcomeBack } from "@/components/app/WelcomeBack";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-slate-600">Het controlecentrum is voor beheerders.</p>
      </main>
    );
  }
  const t = await getDict();
  return (
    <>
      <WelcomeBack name={principal.fullName} labels={t.greet} />
      <ControlCenter />
    </>
  );
}
