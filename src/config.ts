export interface SiteConfig {
  /** Site name: ends inner page titles and starts the homepage title. */
  name: string;
  /** Generate a title card for each eligible page without a manual image. */
  socialImages: boolean;
}

export const siteConfig: SiteConfig = {
  name: 'Astro Minimal Template',
  socialImages: true,
};
