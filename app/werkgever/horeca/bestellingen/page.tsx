import { PageHeader } from "@/components/app/ui";

export const metadata = { title: "Bestellingen" };
export const dynamic = "force-dynamic";

export default function HorecaBestellingenPage() {
  return (
    <>
      <PageHeader title="Bestellingen" subtitle="Overzicht van alle tafelbestellingen" />
      <div className="card p-6">
        <p className="text-sm text-neutralx-600">Bestellingen dashboard</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-hair p-4">
            <p className="text-xs text-neutralx-600">Vandaag</p>
            <p className="mt-2 text-2xl font-bold">0</p>
            <p className="text-xs text-neutralx-500">bestellingen</p>
          </div>
          <div className="rounded-lg border border-hair p-4">
            <p className="text-xs text-neutralx-600">In behandeling</p>
            <p className="mt-2 text-2xl font-bold">0</p>
            <p className="text-xs text-neutralx-500">orders</p>
          </div>
          <div className="rounded-lg border border-hair p-4">
            <p className="text-xs text-neutralx-600">Gereed</p>
            <p className="mt-2 text-2xl font-bold">0</p>
            <p className="text-xs text-neutralx-500">klaar</p>
          </div>
        </div>
      </div>
    </>
  );
}
