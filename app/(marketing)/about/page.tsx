import { permanentRedirect } from "next/navigation";

// /about was een Engelse kopie van /over-ons (met een canonical daarheen), voor tools die naar een /about-pagina zoeken.
// 16 nov 2026: de eigenaar leest geen Engels en alle zichtbare tekst is Nederlands, dus /about stuurt nu blijvend door
// naar /over-ons (308). De map blijft bestaan, zodat het adres niet op een 404 uitkomt.
export default function AboutPage() {
  permanentRedirect("/over-ons");
}
