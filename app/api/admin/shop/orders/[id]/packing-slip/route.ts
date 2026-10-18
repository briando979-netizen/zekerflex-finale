import { withAdminAccess } from "@/lib/auth/handlers";
import { packingSlipPdf } from "@/lib/shop/admin-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/shop/orders/:id/packing-slip — printable pakbon (PDF).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
  const { bytes, filename } = await packingSlipPdf(id);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` } });
});
