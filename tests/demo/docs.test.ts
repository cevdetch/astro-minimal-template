// Checks for the starter's own demo content. Each test skips itself once a
// copy has replaced that content, so these never fail on your own pages.
import assert from 'node:assert/strict';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { checkOutput, createShippedSiteFixture, project } from '../helpers/shipped-site.ts';

const marker = /\n *\{\/\* Remove this section together with src\/pages\/docs\/\. \*\/\}\n *<section aria-labelledby="docs">[\s\S]*?<\/section>\n/;
const homepage = await readFile(new URL('src/pages/index.astro', project), 'utf8');
const hasGuides = await access(new URL('src/pages/docs/', project)).then(() => true, () => false);

test('removing the guides as the README describes leaves a site that passes its checks', {
  skip: !hasGuides || !marker.test(homepage) ? 'the demo guides or their homepage section are gone' : false,
}, async t => {
  const fixture = await createShippedSiteFixture();
  t.after(() => fixture.cleanup());

  let result = await fixture.build(['--site', 'https://example.test']);
  assert.equal(result.code, 0, result.log);
  assert.ok((await checkOutput(fixture.root)).includes('/docs/'), 'The guides are part of the shipped sitemap.');

  await rm(new URL('src/pages/docs/', fixture.root), { recursive: true });
  const trimmed = homepage.replace(marker, '\n');
  assert.doesNotMatch(trimmed, /docs\//);
  await writeFile(new URL('src/pages/index.astro', fixture.root), trimmed);

  result = await fixture.build(['--site', 'https://example.test']);
  assert.equal(result.code, 0, result.log);
  assert.deepEqual(await checkOutput(fixture.root), ['/']);
});
