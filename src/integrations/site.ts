import type { AstroIntegration } from 'astro';
import { getAuthorWarning, validateSiteOrigin, type Person } from '../lib/seo.ts';

export interface SiteValidationOptions {
  /** siteConfig.author, checked once per build against the production site. */
  author?: Person | undefined;
}

export function siteValidation(options: SiteValidationOptions = {}): AstroIntegration {
  let requireSite = false;
  return {
    name: 'starter:site',
    hooks: {
      'astro:config:setup': ({ command }) => {
        requireSite = command === 'build';
      },
      'astro:config:done': ({ config, logger }) => {
        const origin = validateSiteOrigin(config.site, requireSite);
        // A fork that still credits the starter's author builds fine but warns.
        const warning = requireSite && origin ? getAuthorWarning(origin, options.author) : undefined;
        if (warning !== undefined) logger.warn(warning);
      },
    },
  };
}
