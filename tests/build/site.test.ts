import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createBuildFixture } from '../helpers/build-fixture.ts';

const integration = new URL('../../src/integrations/site.ts', import.meta.url).href;
const page = '<!doctype html><html lang="en"><head><title>Fixture</title></head><body><h1>Fixture</h1></body></html>';
const config = (fields = '') => `
import { siteValidation } from ${JSON.stringify(integration)};
export default { integrations: [siteValidation()], ${fields} };
`;

test('a missing production site fails before rendering with configuration guidance', async t => {
  const fixture = await createBuildFixture({ configSource: config(), pages: {
    'index.astro': '---\nthrow new Error("PAGE_RENDERED_WITHOUT_SITE");\n---\n<p>Fixture</p>',
  } });
  t.after(() => fixture.cleanup());
  const result = await fixture.build();
  assert.notEqual(result.code, 0, result.log);
  assert.match(result.log, /site.*astro\.config\.mjs/);
  assert.doesNotMatch(result.log, /PAGE_RENDERED_WITHOUT_SITE/);
});

test('a non-HTTP site or a site with a subpath fails before building', async t => {
  for (const site of ['ftp://example.test', 'https://example.test/project/']) {
    const fixture = await createBuildFixture({
      configSource: config(`site: ${JSON.stringify(site)},`), pages: { 'index.astro': page },
    });
    t.after(() => fixture.cleanup());
    const result = await fixture.build();
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /site/);
    assert.match(result.log, /HTTP|base/);
  }
});

test('CLI site works without a configured site or a source rewrite', async t => {
  const fixture = await createBuildFixture({ configSource: config(), pages: { 'index.astro': page } });
  t.after(() => fixture.cleanup());
  const result = await fixture.build(['--site', 'https://example.test']);
  assert.equal(result.code, 0, result.log);
  assert.match(await readFile(new URL('index.html', result.outDir), 'utf8'), /<h1>Fixture<\/h1>/);
  assert.equal(await readFile(new URL('fixture.config.mjs', fixture.root), 'utf8'), config());
});

test('a configured origin works with a subpath and a custom output directory', async t => {
  const fixture = await createBuildFixture({
    configSource: config("site: 'https://example.test', base: '/project/', outDir: './output/',"),
    pages: { 'index.astro': page },
  });
  t.after(() => fixture.cleanup());
  const result = await fixture.build();
  assert.equal(result.code, 0, result.log);
  assert.equal(result.outDir.href, new URL('output/', fixture.root).href);
  assert.match(await readFile(new URL('index.html', result.outDir), 'utf8'), /Fixture/);
});

test('site validation sees updates from later integration setup hooks', async t => {
  const fixture = await createBuildFixture({
    configSource: `
import { siteValidation } from ${JSON.stringify(integration)};
export default {
  site: 'https://example.test',
  integrations: [siteValidation(), {
    name: 'test:change-site',
    hooks: { 'astro:config:setup': ({ updateConfig }) => {
      updateConfig({ site: 'https://example.test/wrong-path/' });
    } },
  }],
};`,
    pages: { 'index.astro': page },
  });
  t.after(() => fixture.cleanup());
  const result = await fixture.build();
  assert.notEqual(result.code, 0, result.log);
  assert.match(result.log, /site.*astro\.config\.mjs/);
});
