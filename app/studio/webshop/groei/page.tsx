import { Card, Empty, ITrend, PageHead } from "@/components/studio/ui";

export default function StudioGroeiPage() {
  return (<><PageHead title="Groei" /><Card><Empty icon={<ITrend />} title="Binnenkort" text="Hulpmiddelen om je webshop te laten groeien komen eraan." /></Card></>);
}
