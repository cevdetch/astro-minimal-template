import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createBuildFixture } from '../helpers/build-fixture.ts';

const layout = new URL('../../src/layouts/Layout.astro', import.meta.url).href;
const integration = new URL('../../src/integrations/site.ts', import.meta.url).href;
const indexing = new URL('../../src/integrations/indexing.ts', import.meta.url).href;
const collector = `import { createIndexing } from ${JSON.stringify(indexing)};\nconst indexing = createIndexing();`;
const text = { title: 'A <page> & "quote"', description: 'Details & <ideas> with "quotes".' };
const page = (props: Record<string, unknown>) => `---
import Layout from ${JSON.stringify(layout)};
const props = ${JSON.stringify({ ...text, image: false, ...props })};
---
<Layout {...props}><main><h1>{props.title}</h1><p>Page content.</p></main></Layout>`;

// Read only the controlled quoted attributes emitted by these fixtures.
function decode(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos));/gi,
    (_entity, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (decimal) return String.fromCodePoint(Number(decimal));
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[name!]!;
    });
}
function tags(html: string, name: string): Record<string, string>[] {
  const tokens = [...html.matchAll(/<([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)];
  return tokens.filter(([, tagName]) => tagName === name).map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)]
      .map(([, key, value]) => [key!, decode(value!)])));
}
function meta(html: string, name: string): (string | undefined)[] {
  return tags(html, 'meta').filter(tag => tag['name'] === name || tag['property'] === name)
    .map(tag => tag['content']);
}
function canonical(html: string): (string | undefined)[] {
  return tags(html, 'link').filter(tag => tag['rel'] === 'canonical').map(tag => tag['href']);
}
function noSocial(html: string) {
  assert.deepEqual(tags(html, 'meta').filter(tag =>
    tag['property']?.startsWith('og:') || tag['name']?.startsWith('twitter:')), []);
}

for (const base of ['/', '/project/']) {
  for (const format of ['directory', 'file']) {
    test(`Layout renders escaped manual and no-image metadata (${base}, ${format})`, async t => {
      const fixture = await createBuildFixture({
        configSource: `import { siteValidation } from ${JSON.stringify(integration)};
${collector}
export default { site: 'https://example.test', base: ${JSON.stringify(base)},
  outDir: './output/', build: { format: ${JSON.stringify(format)} }, integrations: [siteValidation(), indexing.collect] };`,
        pages: {
          'index.astro': page({}),
          'nested/manual.astro': page({ canonical: 'original/?edition=2&lang=en', noindex: true,
            image: { src: 'images/share.png?v=1&crop=wide', alt: ' A landscape & "sky". ' } }),
          'nested/no-canonical.astro': page({ canonical: false, image: { src: '/shared.png' } }),
          'nested/no-alt.astro': page({ image: { src: 'https://cdn.example.invalid/share.png' } }),
          'nested/blank-alt.astro': page({ image: { src: '/share.png', alt: ' \n' } }),
          'nested/off.astro': page({ canonical: false, noindex: true, image: false }),
          'rtl.astro': page({ lang: 'ar', dir: 'rtl' }),
        },
      });
      t.after(() => fixture.cleanup());
      const result = await fixture.build();
      assert.equal(result.code, 0, result.log);
      const read = (path: string) => readFile(new URL(path, result.outDir), 'utf8');
      const routeFile = (route: string) => format === 'directory' ? `${route}/index.html` : `${route}.html`;
      const home = await read('index.html');
      assert.equal(decode(/<title>([\s\S]*?)<\/title>/.exec(home)?.[1] ?? ''), text.title);
      assert.deepEqual(meta(home, 'description'), [text.description]);
      assert.deepEqual(meta(home, 'viewport'), ['width=device-width']);
      assert.deepEqual(meta(home, 'color-scheme'), ['light dark']);
      assert.deepEqual(canonical(home), [`https://example.test${base}${format === 'file' ? 'index.html' : ''}`]);
      assert.deepEqual(meta(home, 'robots'), []);
      assert.deepEqual(tags(home, 'html'), [{ lang: 'en' }]);
      assert.deepEqual(tags(home, 'link').filter(tag => tag['rel'] === 'icon'),
        [{ rel: 'icon', href: `${base}favicon.ico` }]);
      const charset = home.indexOf('<meta charset="utf-8"');
      assert.ok(charset >= 0 && charset < 1024);
      assert.ok(home.indexOf('charset=') < home.indexOf('name="viewport"'));
      assert.ok(home.indexOf('name="viewport"') < home.indexOf('<title>'));
      assert.doesNotMatch(home, /<style\b|<script\b|data-starter-|_social\/|name="generator"|rel="manifest"|apple-touch-icon|name="theme-color"/);
      noSocial(home);

      const manual = await read(routeFile('nested/manual'));
      assert.deepEqual(canonical(manual), [`https://example.test${base}original/?edition=2&lang=en`]);
      assert.deepEqual(meta(manual, 'robots'), ['noindex']);
      assert.deepEqual(meta(manual, 'og:title'), [text.title]);
      assert.deepEqual(meta(manual, 'og:description'), [text.description]);
      assert.deepEqual(meta(manual, 'og:type'), ['website']);
      assert.deepEqual(meta(manual, 'og:url'), [`https://example.test${base}original/?edition=2&lang=en`]);
      assert.deepEqual(meta(manual, 'og:image'), [`https://example.test${base}images/share.png?v=1&crop=wide`]);
      assert.deepEqual(meta(manual, 'og:image:alt'), [' A landscape & "sky". ']);
      assert.deepEqual(meta(manual, 'twitter:card'), ['summary_large_image']);
      const socialKeys = tags(manual, 'meta').flatMap(tag => {
        const key = tag['property'] ?? tag['name'] ?? '';
        return /^(og:|twitter:)/.test(key) ? [key] : [];
      });
      assert.deepEqual(socialKeys, ['og:type', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:alt', 'twitter:card']);

      const noCanonical = await read(routeFile('nested/no-canonical'));
      assert.deepEqual(canonical(noCanonical), []);
      const pathname = `${base}nested/no-canonical${format === 'directory' ? '/' : '.html'}`;
      assert.deepEqual(meta(noCanonical, 'og:url'), [`https://example.test${pathname}`]);
      for (const route of ['nested/no-canonical', 'nested/no-alt', 'nested/blank-alt']) {
        const html = await read(routeFile(route));
        assert.equal(meta(html, 'og:image').length, 1);
        assert.deepEqual(meta(html, 'og:image:alt'), []);
      }
      const off = await read(routeFile('nested/off'));
      noSocial(off);
      assert.deepEqual(canonical(off), []);
      assert.deepEqual(meta(off, 'robots'), ['noindex']);
      assert.deepEqual(tags(await read(routeFile('rtl')), 'html'), [{ lang: 'ar', dir: 'rtl' }]);
    });
  }
}

test('preview noindex keeps production canonical and manual social metadata', async t => {
  const fixture = await createBuildFixture({
    configSource: `import { siteValidation } from ${JSON.stringify(integration)};
${collector}
export default { site: 'https://example.test', integrations: [siteValidation(), indexing.collect] };`,
    pages: { 'index.astro': page({ noindex: false, image: { src: '/share.png' } }) },
  });
  t.after(() => fixture.cleanup());
  for (const value of ['true', 'false']) {
    const result = await fixture.build([], { SITE_NOINDEX: value });
    assert.equal(result.code, 0, result.log);
    const html = await readFile(new URL('index.html', result.outDir), 'utf8');
    assert.deepEqual(meta(html, 'robots'), value === 'true' ? ['noindex'] : []);
    assert.deepEqual(canonical(html), ['https://example.test/']);
    assert.deepEqual(meta(html, 'og:image'), ['https://example.test/share.png']);
  }
  for (const value of ['', 'TRUE', '1']) {
    const result = await fixture.build([], { SITE_NOINDEX: value });
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /SITE_NOINDEX/);
  }
});

test('metadata values cannot inject tags or attributes into the head', async t => {
  const injected = { title: '</title><script>alert("x")</script>',
    description: '" /><meta name="injected" content="yes"> & more' };
  const fixture = await createBuildFixture({
    configSource: `${collector}\nexport default { site: 'https://example.test', integrations: [indexing.collect] };`,
    pages: { 'index.astro': page({ ...injected, image: { src: '/share.png', alt: injected.description } }) },
  });
  t.after(() => fixture.cleanup());
  const result = await fixture.build();
  assert.equal(result.code, 0, result.log);
  const html = await readFile(new URL('index.html', result.outDir), 'utf8');
  assert.equal(decode(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? ''), injected.title);
  assert.deepEqual(meta(html, 'description'), [injected.description]);
  assert.deepEqual(meta(html, 'og:title'), [injected.title]);
  assert.deepEqual(meta(html, 'og:image:alt'), [injected.description]);
  assert.deepEqual(meta(html, 'injected'), []);
  assert.deepEqual(tags(html, 'script'), []);
});
