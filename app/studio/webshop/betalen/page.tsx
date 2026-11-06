import { Card, Empty, ICard, PageHead } from "@/components/studio/ui";

export default function StudioBetalenPage() {
  return (<><PageHead title="Betalen" /><Card><Empty icon={<ICard />} title="Binnenkort" text="Online betalen in je webshop komt eraan." /></Card></>);
}
