// @ts-check
import { defineConfig } from 'astro/config';
import { siteValidation } from './src/integrations/site.ts';

// https://astro.build/config
export default defineConfig({
  // Set site to your production origin before building.
  // Add base only when deploying under a subpath.
  integrations: [siteValidation()],
});
