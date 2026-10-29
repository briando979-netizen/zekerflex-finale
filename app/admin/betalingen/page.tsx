import { AgentPayConsole } from "@/components/admin/AgentPayConsole";

export const dynamic = "force-dynamic";

export default function AdminBetalingenPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">AI-betalingen</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          De AI stelt betalingen en aankopen voor (ook buiten ZekerFlex); jij keurt ze goed of af. Er verplaatst nooit geld
          zonder jouw tik, met harde limieten en een noodknop. Pas als je bewust een betaalrail aansluit, gaat een goedgekeurde
          betaling écht door — tot die tijd is het &ldquo;goedgekeurd, handmatig uitvoeren&rdquo;.
        </p>
      </div>
      <AgentPayConsole />
    </div>
  );
}
