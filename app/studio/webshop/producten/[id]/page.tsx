import ProductEditor from "@/components/studio/ProductEditor";

export default async function StudioProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // een nieuw product krijgt een eigen editor; daarna wisselt het adres naar het id
  return <ProductEditor key={id} id={id} />;
}
