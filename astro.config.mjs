// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { siteValidation } from './src/integrations/site.ts';
import { socialImages } from './src/integrations/social-images.ts';
import { createIndexing } from './src/integrations/indexing.ts';

const indexing = createIndexing();

// https://astro.build/config
export default defineConfig({
  // Set your production origin here, or pass --site when building.
  // site: 'https://example.com',
  // Add base only when deploying under a subpath.
  integrations: [
    siteValidation(),
    indexing.collect,
    socialImages(),
    sitemap({ filter: indexing.filter, customPages: indexing.sitemapPages }),
    indexing.finalize,
  ],
});
