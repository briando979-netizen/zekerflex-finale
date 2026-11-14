import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    // tests/setup-klok.ts verzet de klok alleen met ZF_TEST_KLOK_VERZET_MS gezet (meting op tijdbommen)
    setupFiles: ["./tests/setup.ts", "./tests/setup-klok.ts"],
    include: ["tests/**/*.test.ts"],
    // Standaard krijgt een test 5 s. Een bewaker die de hele broncode leest (kv-avg-bewaker, de a11y- en importtests) haalt
    // dat niet als de machine druk is, en de uitrolcontrole op de server (vitest related) houdt dan een gewone uitrol tegen
    // zonder dat er iets kapot is (14 nov: 2 van 4 tests liepen op 5 s af, en slaagden met 120 s). Een echt vastgelopen test
    // faalt nu na 30 s in plaats van 5 s.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": resolve(rootDir, "."),
    },
  },
});
