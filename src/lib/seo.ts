export function parseSiteNoindex(raw: string | undefined): boolean {
  if (raw === undefined || raw === 'false') return false;
  if (raw === 'true') return true;
  throw new Error('SITE_NOINDEX must be exactly "true" or "false" when set.');
}

export function validateSiteOrigin(site: string | undefined, required: boolean): URL | undefined {
  if (site === undefined && !required) return undefined;
  const message = 'Set site in astro.config.mjs to an absolute HTTP(S) origin, '
    + 'with no credentials, path, query or fragment. Use base for a subpath.';
  if (site === undefined || !/^https?:\/\/[^/?#\\\s]+\/?$/i.test(site)) {
    throw new Error(message);
  }
  let url: URL;
  try {
    url = new URL(site);
  } catch {
    throw new Error(message);
  }
  if (url.username || url.password || url.pathname !== '/') throw new Error(message);
  return url;
}

function projectRoot(origin: URL, base: string): URL {
  const root = new URL(origin.origin);
  root.pathname = base.endsWith('/') ? base : `${base}/`;
  return root;
}

export function resolveProjectUrl(
  value: string,
  origin: URL,
  base: string,
  kind: 'canonical' | 'image',
): string {
  if (!value.trim()) throw new Error(`${kind} URL must not be blank.`);
  let url: URL;
  try {
    url = new URL(value, projectRoot(origin, base));
  } catch {
    throw new Error(`${kind} URL must resolve to a valid HTTP(S) URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${kind} URL must use HTTP(S).`);
  }
  if (kind === 'canonical' && value.includes('#')) {
    throw new Error('canonical URL must not contain a fragment.');
  }
  return url.href;
}

export function getPageUrl(request: URL, origin: URL): string {
  const page = new URL(origin.origin);
  page.pathname = request.pathname;
  return page.href;
}

export function getFaviconHref(base: string): string {
  return `${base.endsWith('/') ? base : `${base}/`}favicon.ico`;
}

export function getSitemapUrl(origin: URL, base: string): string {
  return new URL('sitemap-index.xml', projectRoot(origin, base)).href;
}

export async function getGeneratedImageUrl(pathname: string, origin: URL, base: string): Promise<string> {
  const bytes = new TextEncoder().encode(pathname);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return new URL(`_social/${hash}.png`, projectRoot(origin, base)).href;
}
