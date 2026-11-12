// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  // Change once the domain is live.
  site: "https://saadm.tech",
  integrations: [sitemap()],
});
