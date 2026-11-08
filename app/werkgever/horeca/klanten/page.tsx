import { PageHeader } from "@/components/app/ui";

export const metadata = { title: "Klanten" };
export const dynamic = "force-dynamic";

export default function HorecaKlantenPage() {
  return (
    <>
      <PageHeader title="Klanten" subtitle="Beheer klanten en hun voorkeuren" />
      <div className="card p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-hair p-4">
            <p className="text-xs text-neutralx-600">Totaal klanten</p>
            <p className="mt-2 text-2xl font-bold">0</p>
          </div>
          <div className="rounded-lg border border-hair p-4">
            <p className="text-xs text-neutralx-600">Deze maand</p>
            <p className="mt-2 text-2xl font-bold">0</p>
            <p className="text-xs text-neutralx-500">nieuw</p>
          </div>
          <div className="rounded-lg border border-hair p-4">
            <p className="text-xs text-neutralx-600">Favoriete tafel</p>
            <p className="mt-2 text-2xl font-bold">—</p>
          </div>
          <div className="rounded-lg border border-hair p-4">
            <p className="text-xs text-neutralx-600">Gemiddelde besteding</p>
            <p className="mt-2 text-2xl font-bold">€0</p>
          </div>
        </div>
      </div>
    </>
  );
}
