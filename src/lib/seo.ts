import type { Thing } from 'schema-dts';
import {
  creditsOwnerElsewhere, graph, serializeJsonLd, softwareSourceCodeNode, websiteNode,
} from './structured-data.ts';

export type Direction = 'ltr' | 'rtl' | 'auto';

/** A person credited by name and the URL of their own site. */
export interface Person { name: string; url: string }

export interface LayoutProps {
  title: string;
  description: string;
  home?: boolean;
  sourceCode?: boolean;
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
  siteName?: string | undefined;
  author?: Person | undefined;
  repository?: string | undefined;
  license?: string | undefined;
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
  siteName?: string;
  author?: Person;
  repository?: string;
  jsonLd?: string;
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

function absoluteUrl(value: unknown, name: string): string {
  const message = `${name} must be an absolute HTTP(S) URL.`;
  let url: URL;
  try {
    url = new URL(requiredText(value, name));
  } catch {
    throw new Error(message);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(message);
  return url.href;
}

function validatePerson(value: unknown, name: string): Person {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object with name and url.`);
  }
  const person = value as Record<string, unknown>;
  return { name: requiredText(person['name'], `${name}.name`), url: absoluteUrl(person['url'], `${name}.url`) };
}

function spdxIdentifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9.+-]+$/.test(value)) {
    throw new Error(`${name} must be an SPDX licence identifier, such as MIT.`);
  }
  return value;
}

export interface StructuredDataInput {
  /** The page's canonical URL, or its production URL without one. */
  url: string;
  siteName: string;
  lang: string;
  home: boolean;
  sourceCode: boolean;
  author?: Person | undefined;
  repository?: string | undefined;
  license?: string | undefined;
}

/**
 * Serializes a page's JSON-LD graph, or returns undefined when it has none.
 * The homepage carries a WebSite with the author as publisher. A page that
 * presents the repository's code, such as a template's homepage, opts in to a
 * SoftwareSourceCode node with `sourceCode`; it needs a repository to point at.
 * Without an author, neither node credits anyone.
 */
export function getStructuredData(input: StructuredDataInput): string | undefined {
  const nodes: Exclude<Thing, string>[] = [];
  if (input.home) {
    // null, not undefined: the builder would otherwise credit its own default publisher.
    nodes.push(websiteNode({
      url: input.url, name: input.siteName, inLanguage: input.lang, publisher: input.author ?? null,
    }));
  }
  if (input.sourceCode && input.repository !== undefined) {
    nodes.push(softwareSourceCodeNode({
      url: input.url, name: input.siteName, codeRepository: input.repository,
      programmingLanguage: ['TypeScript', 'Astro'], license: input.license, author: input.author ?? null,
    }));
  }
  return nodes.length ? serializeJsonLd(graph(...nodes)) : undefined;
}

/**
 * A build-time warning for a copy that still credits the starter's author
 * from a host outside the author's own domain, as a fork does until its
 * config changes. Returns undefined when there is nothing to warn about.
 */
export function getAuthorWarning(site: URL, author: unknown): string | undefined {
  if (author === undefined) return undefined;
  const person = validatePerson(author, 'siteConfig.author');
  if (!creditsOwnerElsewhere(site, person)) return undefined;
  return `siteConfig.author still credits ${person.name} (${person.url}) on ${site.origin}. `
    + 'Set author in src/config.ts to your own name and site, or delete it to credit no one.';
}

/**
 * Inner pages read `Page - Site`; the homepage reads `Site: what it does`.
 * Google names the hyphen as a title delimiter it recognises.
 */
export function formatTitle(title: string, siteName: string | undefined, home: boolean): string {
  if (siteName === undefined) return title;
  return home ? `${siteName}: ${title}` : `${title} - ${siteName}`;
}

export async function resolveSeo(props: LayoutProps, context: SeoContext): Promise<ResolvedSeo> {
  const pageTitle = requiredText(props.title, 'title');
  const description = requiredText(props.description, 'description');
  if (props.home !== undefined && typeof props.home !== 'boolean') {
    throw new Error('home must be a boolean.');
  }
  if (props.sourceCode !== undefined && typeof props.sourceCode !== 'boolean') {
    throw new Error('sourceCode must be a boolean.');
  }
  const siteName = context.siteName === undefined
    ? undefined : requiredText(context.siteName, 'siteConfig.name');
  const home = props.home ?? false;
  const title = formatTitle(pageTitle, siteName, home);
  const author = context.author === undefined ? undefined : validatePerson(context.author, 'siteConfig.author');
  const repository = context.repository === undefined
    ? undefined : absoluteUrl(context.repository, 'siteConfig.repository');
  const license = context.license === undefined ? undefined : spdxIdentifier(context.license, 'siteConfig.license');
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
  if (siteName !== undefined) seo.siteName = siteName;
  if (author !== undefined) seo.author = author;
  if (repository !== undefined) seo.repository = repository;
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
  const jsonLd = siteName === undefined ? undefined : getStructuredData({
    url: seo.canonicalUrl ?? pageUrl, siteName, lang, home, sourceCode: props.sourceCode ?? false,
    author, repository, license,
  });
  if (jsonLd !== undefined) seo.jsonLd = jsonLd;
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
