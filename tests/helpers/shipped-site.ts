import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readBuildReceipt } from '../../src/integrations/receipt.ts';
import { verifyOutput } from '../../scripts/verify-output.ts';
import { createBuildFixture } from './build-fixture.ts';

export const project = new URL('../../', import.meta.url);
const lintScript = fileURLToPath(new URL('scripts/lint-html.ts', project));

/** A fixture holding a copy of the project's own config, src/ and public/. */
export async function createShippedSiteFixture() {
  const fixture = await createBuildFixture({
    configSource: await readFile(new URL('astro.config.mjs', project), 'utf8'),
    pages: {},
  });
  try {
    for (const path of ['src/', 'public/']) await cp(new URL(path, project), new URL(path, fixture.root), { recursive: true });
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
  return fixture;
}

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

/**
 * Runs the output checks and the HTML audit on the fixture's last build, and
 * checks that every same-origin link reaches an emitted page or a file in the
 * output. Returns the sitemap's paths.
 */
export async function checkOutput(root: URL): Promise<string[]> {
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
