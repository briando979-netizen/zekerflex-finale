import Image, { alt } from "./opengraph-image";
import { DEELKAART_SIZE } from "@/components/marketing/rekentools/deelkaart";

// X/Twitter reads twitter:image, not og:image: the same card as opengraph-image.
export const runtime = "edge";
export { alt };
export const size = DEELKAART_SIZE;
export const contentType = "image/png";
export default Image;
