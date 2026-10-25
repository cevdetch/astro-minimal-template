import type { APIRoute } from 'astro';
import { getSitemapUrl } from '../lib/seo.ts';

export const GET: APIRoute = ({ site }) => {
  const rules = 'User-agent: *\nAllow: /\n';
  const sitemap = site ? `\nSitemap: ${getSitemapUrl(site, import.meta.env.BASE_URL)}\n` : '';
  return new Response(rules + sitemap, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
