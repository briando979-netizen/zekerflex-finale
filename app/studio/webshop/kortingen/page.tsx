import { Card, Empty, IPercent, PageHead } from "@/components/studio/ui";

export default function StudioKortingenPage() {
  return (<><PageHead title="Kortingen" /><Card><Empty icon={<IPercent />} title="Binnenkort" text="Kortingscodes en acties voor je webshop komen eraan." /></Card></>);
}
