import { readFile, readdir, realpath } from 'node:fs/promises';
import { sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import { parseDocument } from '../src/integrations/documents.ts';
import { readBuildReceipt, type BuildReceipt } from '../src/integrations/receipt.ts';
import { getGeneratedImageUrl, getSitemapUrl } from '../src/lib/seo.ts';

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
function elements(node: Node): Element[] {
  return 'childNodes' in node ? node.childNodes.flatMap(child => 'tagName' in child ? [child, ...elements(child)] : elements(child)) : [];
}
function attr(node: Element, name: string) { return node.attrs.find(value => value.name === name)?.value; }
function text(node: Node): string { return 'value' in node ? node.value : 'childNodes' in node ? node.childNodes.map(text).join('') : ''; }
function httpUrl(value: string, base?: string): URL {
  const url = base === undefined ? new URL(value) : new URL(value, base);
  if (!value.trim() || !['http:', 'https:'].includes(url.protocol)) throw new Error('Expected a nonblank HTTP(S) URL.');
  return url;
}
function exactlyOne(values: string[], name: string): string {
  if (values.length !== 1 || !values[0]?.trim()) throw new Error(`Expected one nonblank ${name}.`);
  return values[0];
}
async function verifyPage(page: BuildReceipt['pages'][number], receipt: BuildReceipt) {
  const file = new URL(page.file), dir = new URL(receipt.outDir);
  if (!(await realpath(file)).startsWith(`${await realpath(dir)}${sep}`)) throw new Error('Page file escapes the output directory.');
  const html = await readFile(file, 'utf8');
  const parsed = parseDocument(html);
  if (parsed.pageMarkerSpan || parsed.socialMarkerSpan) throw new Error('Internal head marker remains.');
  const tree = elements(parse(html));
  const head = tree.find(node => node.tagName === 'head');
  if (!head) throw new Error('Missing head.');
  const nodes = elements(head);
  const values = (name: string) => nodes.filter(node => node.tagName === 'meta'
    && (attr(node, 'name')?.toLowerCase() === name || attr(node, 'property')?.toLowerCase() === name)).map(node => attr(node, 'content') ?? '');
  if (parsed.canonicalUrl !== undefined) {
    httpUrl(parsed.canonicalUrl, page.owned ? undefined : page.url);
    if (parsed.canonicalUrl.includes('#')) throw new Error('Canonical URL contains a fragment.');
  }
  if (!page.owned) return;
  if (!parsed.lang.trim()) throw new Error('Expected a nonblank page language.');
  const title = exactlyOne(nodes.filter(node => node.tagName === 'title').map(text), 'title');
  const description = exactlyOne(values('description'), 'description');
  const social = nodes.some(node => node.tagName === 'meta'
    && /^(og:|twitter:)/.test(attr(node, 'property')?.toLowerCase() ?? attr(node, 'name')?.toLowerCase() ?? ''));
  if (page.generatedImageUrl !== undefined && parsed.imageUrl !== page.generatedImageUrl) {
    throw new Error('Generated image metadata does not match the recorded image URL.');
  }
  if (!social) return;
  const type = exactlyOne(values('og:type'), 'og:type');
  const url = exactlyOne(values('og:url'), 'og:url');
  const socialTitle = exactlyOne(values('og:title'), 'og:title');
  const socialDescription = exactlyOne(values('og:description'), 'og:description');
  const image = httpUrl(exactlyOne(values('og:image'), 'og:image'));
  const card = exactlyOne(values('twitter:card'), 'twitter:card');
  if (type !== 'website' || card !== 'summary_large_image' || url !== (parsed.canonicalUrl ?? page.url)
    || socialTitle !== title || socialDescription !== description) throw new Error('Social metadata disagrees with HTML metadata.');
  httpUrl(url);
  if (values('og:image:alt').length > 1) throw new Error('Duplicate og:image:alt.');
  const site = new URL(receipt.site);
  if (page.generatedImageUrl === undefined) return;
  if (image.href !== await getGeneratedImageUrl(new URL(page.url).pathname, site, receipt.base)) {
    throw new Error('Generated image does not match the request pathname identity.');
  }
  const png = new URL(`_social/${image.pathname.split('/').at(-1)!}`, dir);
  if (!(await realpath(png)).startsWith(`${await realpath(dir)}${sep}`)) throw new Error('Generated PNG escapes the output directory.');
  const bytes = await readFile(png);
  const { default: sharp } = await import('sharp');
  if ((await sharp(bytes).metadata()).format !== 'png') throw new Error('Generated image must be PNG.');
  const { info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 1200 || info.height !== 630) throw new Error('Generated PNG must decode as 1200x630.');
}
function locations(xml: string, root: string): string[] {
  const nodes = elements(parseFragment(xml));
  if (!nodes.some(node => node.tagName === root)) throw new Error(`Expected ${root} XML.`);
  return nodes.filter(node => node.tagName === 'loc').map(text);
}
async function verifyCrawlers(receipt: BuildReceipt) {
  const dir = new URL(receipt.outDir), site = new URL(receipt.site);
  const sitemap = getSitemapUrl(site, receipt.base);
  const xmlFiles = (await readdir(dir)).filter(name => /^sitemap-(index|\d+)\.xml$/.test(name));
  const rules = 'User-agent: *\nAllow: /\n';
  const expectedRobots = receipt.sitemapUrls.length ? `${rules}\nSitemap: ${sitemap}\n` : rules;
  if (await readFile(new URL('robots.txt', dir), 'utf8') !== expectedRobots) throw new Error('robots.txt disagrees with the build site/base and sitemap selection.');
  if (!receipt.sitemapUrls.length) {
    if (xmlFiles.length) throw new Error('Stale sitemap XML for an empty selection.');
    return;
  }
  const chunks = locations(await readFile(new URL('sitemap-index.xml', dir), 'utf8'), 'sitemapindex');
  if (!chunks.length || new Set(chunks).size !== chunks.length) throw new Error('Missing or duplicate sitemap chunks.');
  const files = new Set(['sitemap-index.xml']);
  const urls: string[] = [];
  for (const chunk of chunks) {
    const url = httpUrl(chunk), name = url.pathname.split('/').at(-1)!;
    if (!/^sitemap-\d+\.xml$/.test(name) || new URL(name, sitemap).href !== url.href) throw new Error('Sitemap chunk URL is outside the recorded output.');
    files.add(name); urls.push(...locations(await readFile(new URL(name, dir), 'utf8'), 'urlset'));
  }
  if (xmlFiles.some(name => !files.has(name)) || urls.length !== receipt.sitemapUrls.length
    || new Set(urls).size !== urls.length || urls.some(url => !receipt.sitemapUrls.includes(url))) {
    throw new Error('Sitemap XML disagrees with the recorded selected page URLs.');
  }
}

export async function verifyOutput(receipt: BuildReceipt): Promise<void> {
  for (const page of receipt.pages) {
    try { await verifyPage(page, receipt); } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`${page.url}: ${detail}`, { cause });
    }
  }
  await verifyCrawlers(receipt);
}

if (import.meta.main) {
  try {
    const receipt = await readBuildReceipt(pathToFileURL(`${process.cwd()}/`));
    await verifyOutput(receipt);
    console.log(`Verified ${receipt.pages.length} emitted pages and crawler output in ${receipt.outDir}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
