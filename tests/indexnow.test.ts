import { describe, expect, it } from "vitest";
import { indexNowKeyLocation } from "@/lib/seo/indexnow";

describe("IndexNow keyLocation", () => {
  it("sits in the site root, so it vouches for every page", () => {
    // A key file only covers URLs in its own folder and below; under /api/
    // IndexNow rejected every page with 422.
    const { pathname } = new URL(indexNowKeyLocation());
    expect(pathname).toBe("/indexnow-key.txt");
    expect(pathname.split("/").filter(Boolean)).toHaveLength(1);
  });
});
