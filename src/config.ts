import type { Person } from './lib/seo.ts';

export interface SiteConfig {
  /** Site name: ends inner page titles and starts the homepage title. */
  name: string;
  /** Credited in the footer and as the homepage's publisher. Remove to omit both. */
  author?: Person | undefined;
  /** Source repository linked from the footer. Remove to omit the link. */
  repository?: string | undefined;
  /** Generate a title card for each eligible page without a manual image. */
  socialImages: boolean;
}

export const siteConfig: SiteConfig = {
  name: 'Astro Minimal Template',
  author: { name: 'Cevdet', url: 'https://cevdet.ch/' },
  repository: 'https://github.com/cevdetch/astro-minimal-template',
  socialImages: true,
};
