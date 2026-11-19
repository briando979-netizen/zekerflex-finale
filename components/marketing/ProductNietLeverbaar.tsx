import Image from "next/image";
import Link from "next/link";
import { ProductPlaceholder } from "@/components/marketing/ProductPlaceholder";

// Pagina voor een oude link naar een eigen product dat uit staat (lib/shop/niet-leverbaar.ts):
// zeggen dat het niet meer leverbaar is en meteen vergelijkbare producten laten zien, in plaats
// van een kale 404. Servercomponent: alleen links en foto's, niets om aan te klikken behalve links.

export interface NietLeverbaarProduct {
  slug: string;
  name: string;
  category: string;
  priceCents: number;
  imageUrl: string | null;
}

const euro = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

export function ProductNietLeverbaar({ product, vergelijkbaar }: { product: Omit<NietLeverbaarProduct, "priceCents">; vergelijkbaar: NietLeverbaarProduct[] }) {
  const categorie = `/shop?cat=${encodeURIComponent(product.category)}#collectie`;
  return (
    // ShopChrome heeft de <main> al
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <div className="grid gap-6 sm:grid-cols-[220px_1fr] sm:items-center">
        <div className="relative aspect-square w-40 overflow-hidden rounded-xl bg-paper-soft opacity-70 sm:w-full">
          {product.imageUrl ? (
            <Image src={product.imageUrl} alt="" fill sizes="220px" className="object-cover grayscale" />
          ) : (
            <ProductPlaceholder name={product.name} slug={product.slug} category={product.category} glyphSize={56} className="text-neutralx-300" />
          )}
        </div>
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wide text-neutralx-500">Niet meer leverbaar</p>
          <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">{product.name}</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-neutralx-600">
            Dit artikel verkopen we niet meer. Hieronder staan vergelijkbare producten die je wel meteen kunt bestellen.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={categorie} className="inline-flex h-11 items-center rounded-lg bg-ink px-5 text-[14px] font-bold text-white">
              Meer in {product.category}
            </Link>
            <Link href="/shop" className="inline-flex h-11 items-center rounded-lg px-5 text-[14px] font-bold text-ink ring-1 ring-black/15">
              Naar de shop
            </Link>
          </div>
        </div>
      </div>

      {vergelijkbaar.length > 0 && (
        <section aria-labelledby="vergelijkbaar" className="mt-12">
          <h2 id="vergelijkbaar" className="text-xl font-bold text-ink">
            Vergelijkbaar en wel leverbaar
          </h2>
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {vergelijkbaar.map((p) => (
              <li key={p.slug}>
                <Link href={`/shop/${p.slug}`} className="group block">
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-paper-soft">
                    {p.imageUrl ? (
                      <Image src={p.imageUrl} alt="" fill sizes="(min-width: 640px) 22vw, 46vw" className="object-cover transition duration-500 group-hover:scale-[1.03]" />
                    ) : (
                      <ProductPlaceholder name={p.name} slug={p.slug} category={p.category} glyphSize={48} className="text-neutralx-300" />
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-[14px] font-semibold text-ink group-hover:underline">{p.name}</p>
                  <p className="mt-1 text-[14px] font-bold text-ink">{euro(p.priceCents)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
