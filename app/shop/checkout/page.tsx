import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Section } from "@/components/marketing/primitives";
import { PageHead } from "@/components/admin/kit";

// Shop checkout page with purchase mode selection
// Placeholder — vervang met echte cart implementation

export const dynamic = "force-dynamic";

export default async function ShopCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ cart?: string; mode?: "onetime" | "subscription" }>;
}) {
  const { cart, mode } = await searchParams;

  if (!cart) {
    redirect("/shop");
  }

  return (
    <Section>
      <PageHead
        title="Winkelwagen"
        subtitle="Kies hoe je wilt betalen: eenmalig of maandelijks abonnement"
      />
      <div className="space-y-6 rounded-lg border p-6" style={{ borderColor: "var(--a-border)" }}>
        <p className="text-sm" style={{ color: "var(--a-mute)" }}>
          {mode === "subscription"
            ? "✓ Je abonnement begint volgende maand. Je kunt het altijd opzeggen."
            : "✓ Eenmalige betaling, geen verdere verplichtingen."}
        </p>

        <button
          onClick={() => {
            // TODO: POST /api/shop/checkout with cart items + mode
            // window.location.href = response.url
          }}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
          style={{ background: "var(--a-act)" }}
        >
          Doorgaan naar betaling
        </button>

        <a
          href="/shop"
          className="block text-center text-sm underline"
          style={{ color: "var(--a-link)" }}
        >
          Terug naar winkel
        </a>
      </div>
    </Section>
  );
}
