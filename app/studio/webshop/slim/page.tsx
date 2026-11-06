import { Card, Empty, ISparkle, PageHead } from "@/components/studio/ui";

export default function StudioSlimPage() {
  return (<><PageHead title="Slim" /><Card><Empty icon={<ISparkle />} title="Binnenkort" text="Slimme hulp voor je webshop komt eraan." /></Card></>);
}
