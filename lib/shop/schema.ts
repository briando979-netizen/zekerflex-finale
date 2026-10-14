import { z } from "zod";

// Shop-productfoto's komen uit twee bronnen: een absolute CDN/upload-URL
// (https://...) of een lokaal, site-relatief pad (/shop/foo.jpg, /api/shop/media/xxx
// — precies wat de eigen admin-upload-knop produceert, en wat elk meegeleverd
// product in public/shop al gebruikt). z.string().url() accepteert alleen de
// eerste vorm en laat elk bestaand product zonder absolute URL — dus praktisch
// elk product — stuklopen zodra het zonder nieuwe foto-upload wordt opgeslagen.
export const shopImageRef = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith("/") || /^https?:\/\//i.test(v), "Ongeldig pad of URL");
