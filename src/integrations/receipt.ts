import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getGeneratedImageUrl, validateSiteOrigin } from '../lib/seo.ts';

export interface BuildReceipt {
  version: 2;
  site: string;
  base: string;
  outDir: string;
  format: 'directory' | 'file' | 'preserve';
  pages: readonly { file: string; url: string; owned: boolean; generatedImageUrl?: string }[];
  sitemapUrls: readonly string[];
}

const location = (root: URL) => new URL('.astro/starter-build.json', root);

export async function clearBuildReceipt(root: URL): Promise<void> {
  await rm(location(root), { force: true });
}

export async function writeBuildReceipt(root: URL, receipt: BuildReceipt): Promise<void> {
  await mkdir(new URL('.astro/', root), { recursive: true });
  await writeFile(location(root), `${JSON.stringify(receipt, null, 2)}\n`);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function localFile(value: unknown, directory: boolean): URL {
  if (typeof value !== 'string') throw new Error('Expected a local file URL.');
  const url = new URL(value);
  if (url.protocol !== 'file:' || value.includes('?') || value.includes('#')
    || (directory && !url.pathname.endsWith('/'))) throw new Error('Invalid local output URL.');
  fileURLToPath(url);
  return url;
}
function pageUrl(value: unknown, origin: URL, base: string): URL {
  if (typeof value !== 'string') throw new Error('Expected a page URL.');
  const url = new URL(value);
  const prefix = new URL(origin);
  prefix.pathname = base.endsWith('/') ? base : `${base}/`;
  if (url.origin !== origin.origin || url.username || url.password || value.includes('?') || value.includes('#')
    || (url.pathname !== prefix.pathname.slice(0, -1) && !url.pathname.startsWith(prefix.pathname))) {
    throw new Error('Page URL is outside the recorded site/base.');
  }
  return url;
}

export async function readBuildReceipt(root: URL): Promise<BuildReceipt> {
  try {
    const value: unknown = JSON.parse(await readFile(location(root), 'utf8'));
    if (!object(value) || value['version'] !== 2 || typeof value['site'] !== 'string'
      || typeof value['base'] !== 'string' || !value['base'].startsWith('/')
      || /[\\?#\u0000-\u001f]/.test(value['base']) || value['base'].startsWith('//')
      || !Array.isArray(value['pages']) || !Array.isArray(value['sitemapUrls'])) {
      throw new Error('Invalid receipt schema.');
    }
    const origin = validateSiteOrigin(value['site'], true)!;
    const base = value['base'];
    const format = value['format'];
    if (format !== 'directory' && format !== 'file' && format !== 'preserve') throw new Error('Invalid output format.');
    const dir = localFile(value['outDir'], true);
    const files = new Set<string>(), identities = new Set<string>();
    const pages: BuildReceipt['pages'][number][] = [];
    for (const entry of value['pages']) {
      if (!object(entry) || typeof entry['owned'] !== 'boolean') throw new Error('Invalid page record.');
      const file = localFile(entry['file'], false);
      const url = pageUrl(entry['url'], origin, base);
      const path = fileURLToPath(file);
      if (!file.href.startsWith(dir.href) || !file.pathname.endsWith('.html')
        || files.has(path) || identities.has(url.href)) throw new Error('Invalid or duplicate emitted page.');
      files.add(path); identities.add(url.href);
      const page: BuildReceipt['pages'][number] = { file: file.href, url: url.href, owned: entry['owned'] };
      if ('generatedImageUrl' in entry) {
        if (!page.owned || typeof entry['generatedImageUrl'] !== 'string' || entry['generatedImageUrl'] !== await getGeneratedImageUrl(url.pathname, origin, base)) {
          throw new Error('Invalid generated image identity.');
        }
        page.generatedImageUrl = entry['generatedImageUrl'];
      }
      pages.push(page);
    }
    const sitemapUrls: string[] = [];
    const selected = new Set<string>();
    for (const entry of value['sitemapUrls']) {
      const url = pageUrl(entry, origin, base).href;
      if (!identities.has(url) || selected.has(url)) throw new Error('Invalid or duplicate sitemap selection.');
      selected.add(url); sitemapUrls.push(url);
    }
    return { version: 2, site: origin.href, base, outDir: dir.href, format, pages, sitemapUrls };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`No valid successful build receipt: ${detail} Run pnpm build with site configured before checking output.`, { cause });
  }
}
