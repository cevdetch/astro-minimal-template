import type { AstroIntegration } from 'astro';
import { validateSiteOrigin } from '../lib/seo.ts';

export function siteValidation(): AstroIntegration {
  let requireSite = false;
  return {
    name: 'starter:site',
    hooks: {
      'astro:config:setup': ({ command }) => {
        requireSite = command === 'build';
      },
      'astro:config:done': ({ config }) => {
        validateSiteOrigin(config.site, requireSite);
      },
    },
  };
}
