import { Section } from "@/components/marketing/primitives";

// Order success page after Stripe checkout

export default function OrderSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  return (
    <Section>
      <div className="mx-auto max-w-md rounded-lg border p-6 text-center" style={{ borderColor: "var(--a-border)" }}>
        <div className="mb-4 text-4xl">✓</div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--a-text)" }}>
          Bestelling geplaatst!
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--a-mute)" }}>
          Je ontvangt zo een bevestigingsmail. Dank je voor je aankoop!
        </p>

        <div className="mt-6 space-y-2">
          <a
            href="/shop"
            className="block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            style={{ background: "var(--a-act)" }}
          >
            Terug naar winkel
          </a>
          <a
            href="/shop/account"
            className="block rounded-lg border px-4 py-2"
            style={{ borderColor: "var(--a-border)", color: "var(--a-link)" }}
          >
            Mijn bestellingen
          </a>
        </div>
      </div>
    </Section>
  );
}
