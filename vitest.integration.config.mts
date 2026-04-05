import { defineConfig } from "vitest/config";
import { cloudflarePool } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    pool: cloudflarePool({
      main: "./src/index.ts",
      wrangler: {
        configPath: "./wrangler.toml",
      },
      miniflare: {
        d1Databases: ["DB"],
      },
    }),
  },
});
