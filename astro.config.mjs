// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { siteValidation } from './src/integrations/site.ts';
import { createIndexing } from './src/integrations/indexing.ts';

const indexing = createIndexing();

// https://astro.build/config
export default defineConfig({
  // Set site to your production origin before building.
  // Add base only when deploying under a subpath.
  integrations: [
    siteValidation(),
    indexing.collect,
    sitemap({ filter: indexing.filter, customPages: indexing.sitemapPages }),
    indexing.finalize,
  ],
});
