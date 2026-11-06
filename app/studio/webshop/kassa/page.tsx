import { Card, Empty, IPin, PageHead } from "@/components/studio/ui";

export default function StudioKassaPage() {
  return (<><PageHead title="Op locatie" /><Card><Empty icon={<IPin />} title="Binnenkort" text="Verkopen op locatie, bij jou in de winkel, komt eraan." /></Card></>);
}
