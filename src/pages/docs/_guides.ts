// Files starting with an underscore are not routes. Delete src/pages/docs/
// to remove the guides; nothing outside this folder imports from it.
export interface Guide {
  /** Path below the documentation index, with the trailing slash. */
  path: string;
  title: string;
  description: string;
}

export const guides: readonly Guide[] = [
  {
    path: 'seo/',
    title: 'SEO and metadata defaults for Astro',
    description: 'What the starter puts in every page for search engines and link previews: titles, canonical URLs, sitemap, robots rules, social images and structured data.',
  },
  {
    path: 'build-checks/',
    title: 'Checking an Astro build before it ships',
    description: 'What pnpm verify runs, what the output checks and the deadhead HTML audit catch, and why a plain astro build is not enough.',
  },
  {
    path: 'cloudflare-pages/',
    title: 'Deploying Astro to Cloudflare Pages',
    description: 'Build settings for Cloudflare Pages, preview noindex, a custom domain with the pages.dev address redirected to it, and response headers.',
  },
  {
    path: 'make-it-yours/',
    title: 'Making the starter yours',
    description: 'Set your URL, site name and author, replace the icons with favseed, change the title cards and remove these guides when you no longer need them.',
  },
];
