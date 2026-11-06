import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { alleEfactuurStanden } from "@/lib/efactuur/bezorging";
import { peppolIngesteld, platformPartij } from "@/lib/efactuur/instellingen";
import { count } from "@/lib/admin/format";
import { InfoList, KpiStrip, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { EfactuurAdmin } from "@/components/admin/EfactuurAdmin";

export const dynamic = "force-dynamic";

// E-facturen (UBL / Peppol): wat er verstuurd is, wat mislukte en of het
// platform zelf klaar is voor het Peppol-netwerk (lib/efactuur).
export default async function AdminEfacturenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="E-facturen zijn alleen voor platformbeheerders." />;
  }

  const standen = await alleEfactuurStanden(500);
  const tenantIds = [...new Set(standen.flatMap((s) => (s.tenantId ? [s.tenantId] : [])))];
  const tenants = tenantIds.length ? await prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }) : [];
  const bedrijven = Object.fromEntries(tenants.map((t) => [t.id, t.name]));

  const dertigDagen = Date.now() - 30 * 86_400_000;
  const recent = standen.filter((s) => new Date(s.at).getTime() >= dertigDagen);
  const tel = (status: string) => recent.filter((s) => s.status === status).length;
  const viaPeppol = recent.filter((s) => s.status === "verstuurd" && s.via === "peppol").length;
  const platform = platformPartij();
  const peppol = peppolIngesteld();

  return (
    <>
      <PageHead
        title="E-facturen"
        subtitle="Elke factuur als UBL-bestand (Peppol BIS 3 / NLCIUS) dat boekhoudpakketten direct inlezen. Bedrijven zetten het zelf aan onder Werkgever → Facturen."
      />

      <KpiStrip
        items={[
          { label: "Verstuurd (30 dagen)", value: count(tel("verstuurd")), hint: viaPeppol ? `${count(viaPeppol)} via Peppol` : "via mail als bijlage" },
          { label: "Mislukt", value: count(tel("mislukt")), hint: tel("mislukt") ? "zie de lijst, opnieuw versturen kan" : "niets mislukt" },
          { label: "Gegevens onvolledig", value: count(tel("ongeldig")), hint: "KVK, btw of adres ontbreekt bij de koper" },
          { label: "Peppol-netwerk", value: peppol ? "Aan" : "Uit", hint: peppol ? "toegangspunt ingesteld" : "gaat per mail; zie Te doen" },
        ]}
      />

      {!platform.compleet && (
        <Notice tone="warn">
          De bedrijfsgegevens van ZekerFlex op de e-factuur zijn nog niet compleet (KVK, btw-nummer, adres). Downloaden en mailen werkt; versturen via het Peppol-netwerk niet. Zie Admin → Te doen → “Bedrijfsgegevens voor e-facturen”.
        </Notice>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel title="Per factuur" subtitle="Nieuwste eerst; klik Opnieuw versturen na een correctie bij het bedrijf">
          <EfactuurAdmin standen={standen} bedrijven={bedrijven} />
        </Panel>
        <Panel title="Hoe het werkt">
          <InfoList
            rows={[
              { label: "Verkoper op platformfacturen", value: platform.naam },
              { label: "KVK / btw", value: platform.kvk && platform.btw ? <Pill tone="ok">ingevuld</Pill> : <Pill tone="warn">ontbreekt</Pill> },
              { label: "Peppol-afzender", value: env.PEPPOL_SENDER_ID ?? "—" },
              { label: "Toegangspunt", value: peppol ? <Pill tone="ok">ingesteld</Pill> : <Pill tone="neutral">niet ingesteld</Pill> },
              { label: "Volgorde", value: "Peppol als beide kanten een adres hebben, anders mail naar het boekhoudpakket, anders alleen download." },
              { label: "Controle vooraf", value: "Totalen, btw-categorie, verlegde btw, vervaldatum en referentie (EN 16931 / NLCIUS)." },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
