import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { readBuildReceipt } from '../../src/integrations/receipt.ts';
import { verifyOutput } from '../../scripts/verify-output.ts';
import { createBuildFixture } from '../helpers/build-fixture.ts';

const project = new URL('../../', import.meta.url);
const lintScript = fileURLToPath(new URL('scripts/lint-html.ts', project));

async function lintHtml(cwd: URL): Promise<{ code: number | null; log: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [lintScript], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', chunk => { log += chunk; });
    child.stderr.on('data', chunk => { log += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, log }));
  });
}

// Every same-origin link must reach an emitted page or a file in the output.
async function checkOutput(root: URL): Promise<string[]> {
  const receipt = await readBuildReceipt(root);
  await verifyOutput(receipt);
  const site = new URL(receipt.site);
  const pages = new Set(receipt.pages.map(page => page.url));
  for (const page of receipt.pages) {
    const html = await readFile(new URL(page.file), 'utf8');
    for (const [, href] of html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)) {
      const target = new URL(href!.replaceAll('&amp;', '&'), page.url);
      if (target.origin !== site.origin) continue;
      target.hash = '';
      if (pages.has(target.href)) continue;
      await readFile(new URL(`.${target.pathname}`, receipt.outDir)).catch(() => {
        assert.fail(`${page.url} links to ${target.href}, which the build did not emit.`);
      });
    }
  }
  const lint = await lintHtml(root);
  assert.equal(lint.code, 0, lint.log);
  return receipt.sitemapUrls.map(url => new URL(url).pathname);
}

test('the shipped site links only to emitted pages and still passes its checks without the guides', async t => {
  const fixture = await createBuildFixture({
    configSource: await readFile(new URL('astro.config.mjs', project), 'utf8'),
    pages: {},
  });
  t.after(() => fixture.cleanup());
  for (const path of ['src/', 'public/']) await cp(new URL(path, project), new URL(path, fixture.root), { recursive: true });

  let result = await fixture.build(['--site', 'https://example.test']);
  assert.equal(result.code, 0, result.log);
  const shipped = await checkOutput(fixture.root);
  assert.ok(shipped.includes('/docs/'), 'The guides are part of the shipped sitemap.');

  await rm(new URL('src/pages/docs/', fixture.root), { recursive: true });
  const home = new URL('src/pages/index.astro', fixture.root);
  const source = await readFile(home, 'utf8');
  const trimmed = source.replace(/\n *\{\/\* Remove this section together with src\/pages\/docs\/\. \*\/\}\n *<section aria-labelledby="docs">[\s\S]*?<\/section>\n/, '\n');
  assert.notEqual(trimmed, source, 'The homepage marks its documentation section.');
  assert.doesNotMatch(trimmed, /docs\//);
  await writeFile(home, trimmed);

  result = await fixture.build(['--site', 'https://example.test']);
  assert.equal(result.code, 0, result.log);
  assert.deepEqual(await checkOutput(fixture.root), ['/']);
});
