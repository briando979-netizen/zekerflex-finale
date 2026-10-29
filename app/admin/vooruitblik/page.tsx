import { DemandForecast } from "@/components/admin/DemandForecast";

export const dynamic = "force-dynamic";

export default function AdminVooruitblikPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Vooruitblik</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Een eerlijke, statistische voorspelling van de drukte voor de komende week — berekend uit je eigen shift-historie. Zo kun je
          kandidaten werven of benaderen vóórdat de piek er is, in plaats van erachteraan te hollen.
        </p>
      </div>
      <DemandForecast />
    </div>
  );
}
