export type Direction = 'ltr' | 'rtl' | 'auto';

export interface LayoutProps {
  title: string;
  description: string;
  lang?: string;
  dir?: Direction;
  canonical?: string | false;
  noindex?: boolean;
  image?: { src?: string; alt?: string } | false;
}

export interface SeoContext {
  site: string | undefined;
  base: string;
  url: URL;
  mode: 'dev' | 'build' | 'server';
  siteNoindex: boolean;
  socialImages: boolean;
}

export interface PagePolicy { pathname: string; noindex: boolean }

export interface ResolvedSeo {
  title: string;
  description: string;
  lang: string;
  dir?: Direction;
  canonicalUrl?: string;
  robotsNoindex: boolean;
  faviconHref: string;
  social?: { url: string; imageUrl: string; imageAlt?: string };
  pagePolicy?: PagePolicy;
  generatedImageUrl?: string;
}

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

function requiredText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a nonblank string.`);
  }
  return value;
}

export async function resolveSeo(props: LayoutProps, context: SeoContext): Promise<ResolvedSeo> {
  const title = requiredText(props.title, 'title');
  const description = requiredText(props.description, 'description');
  const lang = props.lang === undefined ? 'en' : requiredText(props.lang, 'lang');
  if (props.dir !== undefined && !['ltr', 'rtl', 'auto'].includes(props.dir)) {
    throw new Error('dir must be ltr, rtl or auto.');
  }
  if (props.noindex !== undefined && typeof props.noindex !== 'boolean') {
    throw new Error('noindex must be a boolean.');
  }
  const noindex = props.noindex ?? false;
  if (props.canonical !== undefined && props.canonical !== false) {
    requiredText(props.canonical, 'canonical');
  }
  const image = props.image;
  if (image !== undefined && image !== false
    && (image === null || typeof image !== 'object' || Array.isArray(image))) {
    throw new Error('image must be false or an object with optional src and alt.');
  }
  const src = image && image.src !== undefined ? requiredText(image.src, 'image.src') : undefined;
  if (image && image.alt !== undefined && typeof image.alt !== 'string') {
    throw new Error('image.alt must be a string.');
  }
  const alt = image && image.alt?.trim() ? image.alt : undefined;
  const seo: ResolvedSeo = {
    title, description, lang,
    robotsNoindex: noindex || context.siteNoindex,
    faviconHref: getFaviconHref(context.base),
  };
  if (props.dir !== undefined) seo.dir = props.dir;
  if (context.mode === 'build') {
    seo.pagePolicy = { pathname: context.url.pathname, noindex };
  }
  const origin = validateSiteOrigin(context.site, context.mode !== 'dev');
  if (!origin) return seo;

  const pageUrl = getPageUrl(context.url, origin);
  if (props.canonical !== false) {
    seo.canonicalUrl = props.canonical === undefined
      ? pageUrl : resolveProjectUrl(props.canonical, origin, context.base, 'canonical');
  }
  let imageUrl: string | undefined;
  if (src !== undefined) {
    imageUrl = resolveProjectUrl(src, origin, context.base, 'image');
  } else if (image !== false && context.socialImages && context.mode === 'build' && !noindex) {
    imageUrl = await getGeneratedImageUrl(context.url.pathname, origin, context.base);
    seo.generatedImageUrl = imageUrl;
  }
  if (imageUrl !== undefined) {
    seo.social = { url: seo.canonicalUrl ?? pageUrl, imageUrl };
    if (alt !== undefined) seo.social.imageAlt = alt;
  }
  return seo;
}
