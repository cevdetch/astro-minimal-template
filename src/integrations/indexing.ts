import type { AstroConfig, AstroIntegration, IntegrationResolvedRoute } from 'astro';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import { getSitemapUrl, validateSiteOrigin } from '../lib/seo.ts';
import { parseDocument, removeMarkerSpans } from './documents.ts';
import { clearBuildReceipt, writeBuildReceipt, type BuildReceipt } from './receipt.ts';

function locations(xml: string): string[] {
  const text = (node: DefaultTreeAdapterTypes.Node): string => 'value' in node ? node.value
    : 'childNodes' in node ? node.childNodes.map(text).join('') : '';
  const walk = (node: DefaultTreeAdapterTypes.Node): string[] => {
    if ('tagName' in node && node.tagName === 'loc') return [text(node)];
    return 'childNodes' in node ? node.childNodes.flatMap(walk) : [];
  };
  return walk(parseFragment(xml));
}

async function exists(file: URL): Promise<boolean> {
  try { await access(file); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function createIndexing() {
  let config: AstroConfig;
  let routes: IntegrationResolvedRoute[] = [];
  let receipt: BuildReceipt | undefined;
  const allowed = new Set<string>();
  const sitemapPages: string[] = [];
  const collect: AstroIntegration = {
    name: 'starter:indexing',
    hooks: {
      'astro:config:setup': async ({ config: initial, command }) => {
        allowed.clear();
        sitemapPages.length = 0;
        receipt = undefined;
        if (command === 'build') await clearBuildReceipt(initial.root);
      },
      'astro:config:done': ({ config: resolved }) => { config = resolved; },
      'astro:routes:resolved': ({ routes: resolved }) => { routes = resolved; },
      'astro:build:done': async ({ assets, pages, dir }) => {
        const origin = validateSiteOrigin(config.site, true)!;
        const records: BuildReceipt['pages'][number][] = [];
        const files = new Set<string>();
        const identities = new Set<string>();
        const base = config.base.endsWith('/') ? config.base : `${config.base}/`;
        for (const [pattern, outputs] of assets) {
          const route = routes.find(candidate => candidate.pattern === pattern);
          if (route?.type !== 'page') continue;
          for (const file of outputs) {
            if (!file.href.startsWith(dir.href) || !file.pathname.endsWith('.html')) continue;
            const relative = file.href.slice(dir.href.length);
            if (await exists(new URL(relative, config.publicDir))) continue;
            if (files.has(file.href)) throw new Error(`Duplicate output collision: ${file.href}. Use distinct routes or directory output.`);
            files.add(file.href);
            const matches = pages.filter(page => {
              const path = page.pathname.replace(/^\/|\/$/g, '');
              return [path ? `${path}/index.html` : 'index.html', path ? `${path}.html` : 'index.html']
                .some(candidate => new URL(encodeURI(candidate), dir).href === file.href);
            });
            if (matches.length !== 1) throw new Error(`Ambiguous emitted output: ${file.href}. Use distinct route filenames.`);
            const path = matches[0]!.pathname.replace(/^\/|\/$/g, '');
            const directory = config.build.format === 'directory'
              || (config.build.format === 'preserve' && (relative === 'index.html' || relative.endsWith('/index.html')));
            const pathname = directory
              ? path ? `${base}${path}${config.trailingSlash === 'never' ? '' : '/'}`
                : config.trailingSlash === 'never' ? base.replace(/\/$/, '') || '/' : base
              : `${base}${path || 'index'}.html`;
            const identity = new URL(origin);
            identity.pathname = pathname;
            const html = await readFile(file, 'utf8');
            const parsed = parseDocument(html);
            if (parsed.pagePolicy && parsed.pagePolicy.pathname !== identity.pathname) {
              throw new Error(`Page marker disagrees with emitted output: ${file.href}.`);
            }
            if (identities.has(identity.href)) throw new Error(`Duplicate page identity: ${identity.href}.`);
            identities.add(identity.href);
            const owned = parsed.pagePolicy !== undefined;
            records.push({ file: file.href, url: identity.href, owned });
            const noindex = parsed.pagePolicy?.noindex ?? parsed.robotsNoindex;
            const canonical = parsed.canonicalUrl === undefined ? identity : new URL(parsed.canonicalUrl, identity);
            if (!['http:', 'https:'].includes(canonical.protocol) || canonical.hash) throw new Error(`Invalid canonical URL in ${file.href}.`);
            const status = pattern === '/404' || pattern === '/500';
            if (!noindex && !status && !parsed.redirect && canonical.href === identity.href) allowed.add(identity.href);
            if (parsed.pageMarkerSpan) await writeFile(file, removeMarkerSpans(html, [parsed.pageMarkerSpan]));
          }
        }
        const sitemapUrls = [...allowed].sort();
        sitemapPages.push(...sitemapUrls);
        receipt = { version: 1, site: origin.href, base: config.base, outDir: dir.href,
          format: config.build.format, pages: records.sort((a, b) => a.url.localeCompare(b.url)), sitemapUrls };
      },
    },
  };
  const finalize: AstroIntegration = {
    name: 'starter:crawlers',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        if (!receipt) throw new Error('Indexing collection must run before crawler finalization.');
        const origin = new URL(receipt.site);
        const sitemapUrl = getSitemapUrl(origin, receipt.base);
        const xmlFiles = (await readdir(dir)).filter(name => /^sitemap-(index|\d+)\.xml$/.test(name));
        if (allowed.size === 0) {
          if (xmlFiles.length) throw new Error('Unexpected stale sitemap XML for an empty selection.');
        } else {
          const chunks = locations(await readFile(new URL('sitemap-index.xml', dir), 'utf8'));
          if (!chunks.length || new Set(chunks).size !== chunks.length) throw new Error('Sitemap index has missing or duplicate chunks.');
          const generated = new Set(['sitemap-index.xml']);
          const urls: string[] = [];
          for (const chunk of chunks) {
            const url = new URL(chunk);
            const name = url.pathname.split('/').at(-1)!;
            if (!/^sitemap-\d+\.xml$/.test(name) || new URL(name, sitemapUrl).href !== url.href) {
              throw new Error(`Sitemap index references a nonlocal chunk: ${chunk}.`);
            }
            generated.add(name);
            urls.push(...locations(await readFile(new URL(name, dir), 'utf8')));
          }
          if (xmlFiles.some(name => !generated.has(name)) || urls.length !== allowed.size
            || new Set(urls).size !== urls.length || urls.some(url => !allowed.has(url))) {
            throw new Error('Official sitemap XML does not match the eligible emitted pages.');
          }
        }
        const rules = 'User-agent: *\nAllow: /\n';
        const advertised = `${rules}\nSitemap: ${sitemapUrl}\n`;
        const robots = new URL('robots.txt', dir);
        if (await readFile(robots, 'utf8') !== advertised) throw new Error('robots.txt does not advertise the configured sitemap.');
        if (!allowed.size) await writeFile(robots, rules);
        for (const page of receipt.pages) {
          const parsed = parseDocument(await readFile(new URL(page.file), 'utf8'));
          if (parsed.pageMarkerSpan || parsed.socialMarkerSpan) throw new Error(`Unremoved head marker in ${page.file}.`);
        }
        await writeBuildReceipt(config.root, receipt);
      },
    },
  };
  return {
    collect,
    filter: (url: string) => allowed.has(url),
    sitemapPages,
    finalize,
  };
}
