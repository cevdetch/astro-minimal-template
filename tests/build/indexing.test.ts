import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseDocument } from '../../src/integrations/documents.ts';
import { createBuildFixture } from '../helpers/build-fixture.ts';

const source = (path: string) => new URL(`../../src/${path}`, import.meta.url).href;
const layout = source('layouts/Layout.astro');
const page = (props = '{}') => `---
import Layout from ${JSON.stringify(layout)};
---
<Layout title="Fixture" description="Fixture description." image={false} {...${props}}><main><h1>Fixture</h1></main></Layout>`;
const robots = `export { GET } from ${JSON.stringify(source('pages/robots.txt.ts'))};`;
const notFound = `---\nimport Page from ${JSON.stringify(source('pages/404.astro'))};\n---\n<Page />`;
const config = (fields = '', extra = '') => `
import sitemap from '@astrojs/sitemap';
import { siteValidation } from ${JSON.stringify(source('integrations/site.ts'))};
import { createIndexing } from ${JSON.stringify(source('integrations/indexing.ts'))};
${extra}
const indexing = createIndexing();
export default { site: 'https://example.test', ${fields}
  integrations: [siteValidation(), indexing.collect,
    sitemap({ filter: indexing.filter, customPages: indexing.sitemapPages }), indexing.finalize] };
`;
const locs = (xml: string) => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => url!.replaceAll('&amp;', '&'));

for (const base of ['/', '/project/']) {
  for (const format of ['directory', 'file']) {
    test(`sitemap selects actual indexable output and removes markers (${base}, ${format})`, async t => {
      const fixture = await createBuildFixture({
        configSource: config(`base: ${JSON.stringify(base)}, outDir: './output/', build: { format: '${format}' },`),
        pages: {
          'index.astro': page(), 'about.astro': page('{ canonical: false }'),
          'hidden.astro': page('{ noindex: true }'),
          'alias.astro': page('{ canonical: "/somewhere-else/" }'),
          'redirect.astro': '---\nreturn Astro.redirect("/about/");\n---',
          'bypass.astro': '<html lang="en"><head><meta name="robots" content="noindex"></head><body>Bypass</body></html>',
          'plain.astro': '<html lang="en"><head><title>Plain</title></head><body>Plain</body></html>',
          '404.astro': notFound, 'robots.txt.ts': robots,
          '[...slug].astro': page().replace('---\nimport', `---\nexport function getStaticPaths() { return ['café', 'a%2Fb', 'a%252Fb'].map(slug => ({params:{slug}})); }\nimport`),
        },
        publicFiles: { 'unrelated.html': '<html><body>Unrelated public file</body></html>' },
      });
      t.after(() => fixture.cleanup());
      let selected: string[] | undefined;
      for (const preview of ['false', 'true']) {
        const result = await fixture.build([], { SITE_NOINDEX: preview });
        assert.equal(result.code, 0, result.log);
        const receipt = JSON.parse(await readFile(new URL('.astro/starter-build.json', fixture.root), 'utf8')) as {
          pages: { file: string; url: string; owned: boolean }[]; sitemapUrls: string[]; outDir: string; base: string;
        };
        assert.equal(receipt.outDir, result.outDir.href);
        assert.equal(receipt.base, base);
        assert.equal(receipt.pages.length, 11);
        assert.ok(!receipt.pages.some(record => record.url.includes('unrelated')));
        const ending = format === 'directory' ? '/' : '.html';
        const expected = ['', 'about', 'plain', 'caf%C3%A9', 'a%2Fb', 'a%252Fb'].map(route =>
          `https://example.test${base}${route ? route + ending : format === 'file' ? 'index.html' : ''}`).sort();
        const index = await readFile(new URL('sitemap-index.xml', result.outDir), 'utf8');
        assert.deepEqual(locs(index), [`https://example.test${base}sitemap-0.xml`]);
        const urls = locs(await readFile(new URL('sitemap-0.xml', result.outDir), 'utf8')).sort();
        assert.deepEqual(urls, expected);
        assert.deepEqual(receipt.sitemapUrls, expected);
        if (selected) assert.deepEqual(urls, selected);
        selected = urls;
        for (const record of receipt.pages) {
          const html = await readFile(new URL(record.file), 'utf8');
          assert.doesNotMatch(html, /data-starter-/);
          if (record.owned && preview === 'true') assert.equal(parseDocument(html).robotsNoindex, true);
        }
        const error = parseDocument(await readFile(new URL('404.html', result.outDir), 'utf8'));
        assert.equal(error.robotsNoindex, true);
        assert.equal(error.canonicalUrl, undefined);
        assert.equal(error.imageUrl, undefined);
        assert.equal(await readFile(new URL('robots.txt', result.outDir), 'utf8'),
          `User-agent: *\nAllow: /\n\nSitemap: https://example.test${base}sitemap-index.xml\n`);
      }
    });
  }
}

test('empty eligibility removes the sitemap line and repeated builds leave no stale XML', async t => {
  const fixture = await createBuildFixture({ configSource: config(),
    pages: { 'index.astro': page(), 'robots.txt.ts': robots } });
  t.after(() => fixture.cleanup());
  for (const hidden of [false, true, false]) {
    await writeFile(new URL('src/pages/index.astro', fixture.root), page(`{noindex:${hidden}}`));
    const result = await fixture.build();
    assert.equal(result.code, 0, result.log);
    const files = await readdir(result.outDir);
    assert.equal(files.includes('sitemap-index.xml'), !hidden);
    assert.equal(files.includes('sitemap-0.xml'), !hidden);
    assert.equal((await readFile(new URL('robots.txt', result.outDir), 'utf8')).includes('Sitemap:'), !hidden);
  }
});

test('preserve output and trailingSlash choices use actual page identities', async t => {
  for (const [fields, expected] of [
    ["build: {format:'preserve'},", ['https://example.test/', 'https://example.test/about.html', 'https://example.test/nested/']],
    ["trailingSlash:'never',", ['https://example.test/', 'https://example.test/about', 'https://example.test/nested']],
    ["trailingSlash:'always',", ['https://example.test/', 'https://example.test/about/', 'https://example.test/nested/']],
    ["base:'/project/', trailingSlash:'never',", ['https://example.test/project', 'https://example.test/project/about', 'https://example.test/project/nested']],
  ] as const) {
    const fixture = await createBuildFixture({ configSource: config(fields),
      pages: { 'index.astro': page(), 'about.astro': page(), 'nested/index.astro': page(), 'robots.txt.ts': robots } });
    t.after(() => fixture.cleanup());
    const result = await fixture.build();
    assert.equal(result.code, 0, result.log);
    const urls = locs(await readFile(new URL('sitemap-0.xml', result.outDir), 'utf8')).sort();
    assert.deepEqual(urls, expected);
  }
});

test('colliding file-format root and index routes fail with output guidance', async t => {
  const fixture = await createBuildFixture({ configSource: config("build:{format:'file'},"),
    pages: { 'index.astro': page(), 'index/index.astro': page(), 'robots.txt.ts': robots } });
  t.after(() => fixture.cleanup());
  const result = await fixture.build();
  assert.notEqual(result.code, 0, result.log);
  assert.match(result.log, /duplicate|ambiguous|collision/i);
});

test('unknown page marker fails and a failed build clears the previous receipt', async t => {
  const fixture = await createBuildFixture({ configSource: config(), pages: { 'index.astro': page(), 'robots.txt.ts': robots } });
  t.after(() => fixture.cleanup());
  assert.equal((await fixture.build()).code, 0);
  await writeFile(new URL('src/pages/index.astro', fixture.root), '<html><head data-starter-page-v2="bad"></head><body>Invalid</body></html>');
  const result = await fixture.build();
  assert.notEqual(result.code, 0, result.log);
  assert.match(result.log, /marker/);
  await assert.rejects(readFile(new URL('.astro/starter-build.json', fixture.root)), { code: 'ENOENT' });
  await writeFile(new URL('src/pages/index.astro', fixture.root), page());
  assert.equal((await fixture.build()).code, 0);
  await readFile(new URL('.astro/starter-build.json', fixture.root));
  await writeFile(new URL('fixture.config.mjs', fixture.root), config("site: undefined,"));
  const missingSite = await fixture.build();
  assert.notEqual(missingSite.code, 0, missingSite.log);
  await assert.rejects(readFile(new URL('.astro/starter-build.json', fixture.root)), { code: 'ENOENT' });
});

test('missing official XML fails instead of leaving a success receipt', async t => {
  const fixture = await createBuildFixture({
    configSource: config().replace('indexing.finalize]', `{
name:'test:remove-xml', hooks:{'astro:build:done':async({dir})=>{
const {rm}=await import('node:fs/promises'); await rm(new URL('sitemap-0.xml',dir));
}}}, indexing.finalize]`),
    pages: { 'index.astro': page(), 'robots.txt.ts': robots },
  });
  t.after(() => fixture.cleanup());
  const result = await fixture.build();
  assert.notEqual(result.code, 0, result.log);
  assert.match(result.log, /sitemap|ENOENT/);
  await assert.rejects(readFile(new URL('.astro/starter-build.json', fixture.root)), { code: 'ENOENT' });
});

test('no HTML output produces no sitemap or dangling robots reference', async t => {
  const fixture = await createBuildFixture({ configSource: config(), pages: { 'robots.txt.ts': robots } });
  t.after(() => fixture.cleanup());
  const result = await fixture.build();
  assert.equal(result.code, 0, result.log);
  assert.deepEqual(await readdir(result.outDir), ['robots.txt']);
  assert.equal(await readFile(new URL('robots.txt', result.outDir), 'utf8'), 'User-agent: *\nAllow: /\n');
});

test('CLI origin, base and output overrides reach crawler output and the receipt', async t => {
  const fixture = await createBuildFixture({ configSource: config('site: undefined,'),
    pages: { 'index.astro': page(), 'robots.txt.ts': robots } });
  t.after(() => fixture.cleanup());
  const result = await fixture.build(['--site', 'https://cli.example.test', '--base', '/cli/', '--outDir', './cli-output/']);
  assert.equal(result.code, 0, result.log);
  assert.equal(result.outDir.href, new URL('cli-output/', fixture.root).href);
  const receipt = JSON.parse(await readFile(new URL('.astro/starter-build.json', fixture.root), 'utf8'));
  assert.equal(receipt.site, 'https://cli.example.test/');
  assert.equal(receipt.base, '/cli/');
  assert.equal(receipt.outDir, result.outDir.href);
  assert.deepEqual(receipt.sitemapUrls, ['https://cli.example.test/cli/']);
  assert.match(await readFile(new URL('robots.txt', result.outDir), 'utf8'), /Sitemap: https:\/\/cli\.example\.test\/cli\/sitemap-index\.xml/);
});

test('official empty serialization and stale XML fail without a receipt', async t => {
  for (const stale of [false, true]) {
    const fixture = await createBuildFixture({
      configSource: stale ? config() : config().replace('customPages: indexing.sitemapPages',
        'customPages: indexing.sitemapPages, serialize: () => undefined'),
      pages: { 'index.astro': page(stale ? '{noindex:true}' : '{}'), 'robots.txt.ts': robots },
      publicFiles: stale ? { 'sitemap-0.xml': '<stale/>' } : {},
    });
    t.after(() => fixture.cleanup());
    const result = await fixture.build();
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /sitemap|ENOENT/);
    await assert.rejects(readFile(new URL('.astro/starter-build.json', fixture.root)), { code: 'ENOENT' });
    if (stale) assert.equal(await readFile(new URL('public/sitemap-0.xml', fixture.root), 'utf8'), '<stale/>');
  }
});

test('a later build hook sees complete crawler files, removed markers and a success receipt', async t => {
  const observer = `{
name:'test:observe', hooks:{'astro:build:done':async({dir})=>{
const {readFile,writeFile}=await import('node:fs/promises');
const receipt=JSON.parse(await readFile(new URL('.astro/starter-build.json',import.meta.url),'utf8'));
const html=await readFile(new URL('index.html',dir),'utf8');
if(html.includes('data-starter-') || receipt.sitemapUrls.length!==1) throw Error('incomplete earlier output');
await readFile(new URL('sitemap-0.xml',dir));
await writeFile(new URL('observed.txt',dir),'complete');
}}}`;
  const fixture = await createBuildFixture({ configSource: config().replace('indexing.finalize]', `indexing.finalize, ${observer}]`),
    pages: { 'index.astro': page(), 'robots.txt.ts': robots } });
  t.after(() => fixture.cleanup());
  const result = await fixture.build();
  assert.equal(result.code, 0, result.log);
  assert.equal(await readFile(new URL('observed.txt', result.outDir), 'utf8'), 'complete');
});
