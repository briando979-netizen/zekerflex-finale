import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = { title: "Copyright" };

export default function CopyrightPage() {
  const year = new Date().getFullYear();
  return (
    <LegalPage title="Copyright" updated="1 mei 2026" note={null}>
      <LegalSection
        body="De informatie op deze website is met grote zorgvuldigheid samengesteld. ZekerFlex is echter niet aansprakelijk voor enige directe of indirecte schade die zou kunnen ontstaan door het gebruik van de hier aangeboden informatie."
      />
      <LegalSection
        body="Aan de inhoud van deze website kunnen op geen enkele wijze rechten worden ontleend."
      />
      <LegalSection body={`© ${year} ZekerFlex B.V. Alle rechten voorbehouden.`} />
    </LegalPage>
  );
}
