import type { Person } from './lib/seo.ts';

export interface SiteConfig {
  /** Site name: ends inner page titles and starts the homepage title. */
  name: string;
  /**
   * Credited in the footer and as the publisher in structured data. Remove to omit both.
   * The build warns while a site outside cevdet.ch still credits the starter's author.
   */
  author?: Person | undefined;
  /** Source repository linked from the footer. Remove to omit the link. */
  repository?: string | undefined;
  /** SPDX identifier of the repository's licence, named where a page sets sourceCode. */
  license?: string | undefined;
  /** Generate a title card for each eligible page without a manual image. */
  socialImages: boolean;
}

export const siteConfig: SiteConfig = {
  name: 'Astro Minimal Template',
  author: { name: 'Cevdet Haran', url: 'https://cevdet.ch/' },
  repository: 'https://github.com/cevdetch/astro-minimal-template',
  license: 'MIT',
  socialImages: true,
};
