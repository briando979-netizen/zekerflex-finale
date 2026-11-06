import { Card, Empty, ITruck, PageHead } from "@/components/studio/ui";

export default function StudioVerzendingPage() {
  return (<><PageHead title="Verzending" /><Card><Empty icon={<ITruck />} title="Binnenkort" text="Verzendtarieven en bezorgopties voor je webshop komen eraan." /></Card></>);
}
