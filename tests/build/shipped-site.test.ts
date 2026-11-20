import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkOutput, createShippedSiteFixture } from '../helpers/shipped-site.ts';

test('the shipped site links only to emitted pages and passes its output checks', async t => {
  const fixture = await createShippedSiteFixture();
  t.after(() => fixture.cleanup());
  const result = await fixture.build(['--site', 'https://example.test']);
  assert.equal(result.code, 0, result.log);
  assert.ok((await checkOutput(fixture.root)).includes('/'), 'The homepage is in the sitemap.');
});
