import { notFound } from "next/navigation";

// Elk ander adres onder het voorstel (op smileyapp.zekerflex.com wordt /x
// /voorstel/smileyapp/x): de eigen "niet gevonden" in de huisstijl van het
// voorstel (not-found.tsx), niet die van ZekerFlex.
export default function SmileyappOnbekend(): never {
  notFound();
}
