import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { cleanImage, importRemoteImage, IMAGE_MAX_INPUT_BYTES } from "@/lib/media/clean-image";
import { addMedia } from "@/lib/sites/store";
import { editableProposalSite } from "@/lib/sales/website-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const urlSchema = z.object({ url: z.string().trim().url().max(2000), alt: z.string().trim().max(200).optional() });

// POST /api/admin/websitevoorstellen/<id>/site/media — add a photo to a proposal's
// site: an upload (multipart "file") or a photo from the internet ({ url }),
// fetched once and stored here, exactly like the company builder does.
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  await enforceRateLimit({ name: "site-media", identifier: principal.userId, limit: 80, windowSeconds: 3600, message: "Even rustig aan met foto's toevoegen; probeer het zo opnieuw." });
  const site = await editableProposalSite(params.id);
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw AppError.validation("Kies een foto.");
    if (file.size > IMAGE_MAX_INPUT_BYTES) throw AppError.validation("Deze foto is groter dan 15 MB.");
    const image = await cleanImage(Buffer.from(await file.arrayBuffer()));
    const alt = String(form.get("alt") ?? "").trim() || file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 200);
    return NextResponse.json({ media: await addMedia(site.id, image, { alt, bron: "upload" }) }, { status: 201 });
  }
  const input = urlSchema.parse(await request.json().catch(() => ({})));
  const image = await importRemoteImage(input.url);
  return NextResponse.json({ media: await addMedia(site.id, image, { alt: input.alt ?? "", bron: "internet", sourceUrl: image.sourceUrl }) }, { status: 201 });
});
