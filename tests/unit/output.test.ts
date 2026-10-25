import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import sharp from 'sharp';
import { readBuildReceipt, writeBuildReceipt, type BuildReceipt } from '../../src/integrations/receipt.ts';

const site = 'https://cli.example.test:8443';
const pathname = '/project/';
const hash = createHash('sha256').update(pathname).digest('hex');
const imageUrl = `${site}/project/_social/${hash}.png`;
const title = 'A complete page title';
const description = 'Original description.';
const head = `<title>${title}</title><meta name="description" content="${description}">`;
const social = `<meta property="og:type" content="website"><meta property="og:url" content="${site}${pathname}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="${imageUrl}"><meta name="twitter:card" content="summary_large_image">`;
const document = (metadata = head) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${metadata}</head><body>Content</body></html>`;
async function setup(t: { after(fn: () => Promise<void>): void }, metadata = head) {
  const root = pathToFileURL(`${await mkdtemp(join(tmpdir(), 'starter-output-'))}/`);
  t.after(() => rm(root, { recursive: true, force: true }));
  const outDir = new URL('custom output/', root);
  await mkdir(outDir);
  const file = new URL('index.html', outDir);
  await writeFile(file, document(metadata));
  await writeFile(new URL('robots.txt', outDir), `User-agent: *\nAllow: /\n\nSitemap: ${site}/project/sitemap-index.xml\n`);
  await writeFile(new URL('sitemap-index.xml', outDir), `<sitemapindex><sitemap><loc>${site}/project/sitemap-0.xml</loc></sitemap></sitemapindex>`);
  await writeFile(new URL('sitemap-0.xml', outDir), `<urlset><url><loc>${site}${pathname}</loc></url></urlset>`);
  const receipt: BuildReceipt = { version: 2, site: `${site}/`, base: '/project/', outDir: outDir.href, format: 'directory', pages: [{ file: file.href, url: `${site}${pathname}`, owned: true }], sitemapUrls: [`${site}${pathname}`] };
  await writeBuildReceipt(root, receipt);
  return { root, outDir, file, receipt };
}
async function runScript(name: string, root: URL) {
  const script = fileURLToPath(new URL(`../../scripts/${name}.ts`, import.meta.url));
  return new Promise<{ code: number | null; log: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; child.stdout.on('data', chunk => { log += chunk; }); child.stderr.on('data', chunk => { log += chunk; });
    child.once('error', reject); child.once('close', code => resolve({ code, log }));
  });
}

test('output verification uses the receipt origin and custom directory, allowing canonical/image absence and consumer assets', async t => {
  const { verifyOutput } = await import('../../scripts/verify-output.ts');
  const fixture = await setup(t, `${head}<link rel="stylesheet" href="/custom.css"><script type="module" src="/app.js"></script>`);
  await writeFile(new URL('unrelated.html', fixture.outDir), '<html><head data-starter-page-v99="bad"></head></html>');
  await verifyOutput(await readBuildReceipt(fixture.root));
});

for (const [name, metadata] of [
  ['duplicate title', `${head}<title>Duplicate</title>`],
  ['empty title', '<title> </title><meta name="description" content="Description">'],
  ['missing description', '<title>Page</title>'],
  ['duplicate description', `${head}<meta name="description" content="Duplicate">`],
  ['empty description', '<title>Page</title><meta name="description" content=" ">'],
  ['malformed canonical', `${head}<link rel="canonical" href="https://[bad">`],
  ['non-HTTP canonical', `${head}<link rel="canonical" href="javascript:bad">`],
  ['fragment canonical', `${head}<link rel="canonical" href="https://example.test/#fragment">`],
  ['partial social block', `${head}<meta property="og:title" content="Page">`],
  ['social title disagrees with HTML', `${head}${social.replace(title, 'Different')}`],
  ['duplicate social image', `${head}${social}<meta property="og:image" content="${imageUrl}">`],
  ['wrong social URL', `${head}${social.replace(`content="${site}${pathname}"`, 'content="https://example.test/wrong/"')}`],
] as const) {
  test(`output verification rejects ${name}`, async t => {
    const { verifyOutput } = await import('../../scripts/verify-output.ts');
    const { receipt } = await setup(t, metadata);
    await assert.rejects(() => verifyOutput(receipt));
  });
}

test('output verification rejects surviving head markers', async t => {
  const { verifyOutput } = await import('../../scripts/verify-output.ts');
  const { file, receipt } = await setup(t);
  await writeFile(file, document().replace('<head>', `<head data-starter-page-v1='{"pathname":"/project/","noindex":false}'>`));
  await assert.rejects(() => verifyOutput(receipt), /marker/i);
});

test('manual images are not fetched or dimension checked and noindex preserves canonical/social metadata', async t => {
  const { verifyOutput } = await import('../../scripts/verify-output.ts');
  const canonical = 'https://elsewhere.test/original/?edition=2';
  const metadata = `${head}<meta name="robots" content="noindex"><link rel="canonical" href="${canonical}">${social.replace(imageUrl, 'https://not-fetchable.invalid/manual.png').replace(`${site}${pathname}`, canonical)}`;
  const { receipt, outDir } = await setup(t, metadata);
  receipt.sitemapUrls = [];
  await rm(new URL('sitemap-index.xml', outDir)); await rm(new URL('sitemap-0.xml', outDir));
  await writeFile(new URL('robots.txt', outDir), 'User-agent: *\nAllow: /\n');
  await verifyOutput(receipt);
});

test('generated images must match route identity and decode as 1200x630 PNG', async t => {
  const { verifyOutput } = await import('../../scripts/verify-output.ts');
  const fixture = await setup(t, head + social);
  fixture.receipt.pages = fixture.receipt.pages.map(page => ({ ...page, generatedImageUrl: imageUrl }));
  await writeBuildReceipt(fixture.root, fixture.receipt);
  assert.equal((await readBuildReceipt(fixture.root)).pages[0]?.generatedImageUrl, imageUrl);
  await assert.rejects(() => verifyOutput(fixture.receipt), /PNG|ENOENT|image/i);
  await mkdir(new URL('_social/', fixture.outDir));
  const file = new URL(`_social/${hash}.png`, fixture.outDir);
  const png = await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#fafafa' } }).png().toBuffer();
  for (const bytes of [Buffer.from('not PNG'), await sharp(png).resize(10, 10).png().toBuffer(), png.subarray(0, 64), await sharp(png).jpeg().toBuffer()]) {
    await writeFile(file, bytes); await assert.rejects(() => verifyOutput(fixture.receipt));
  }
  await writeFile(file, png); await verifyOutput(fixture.receipt);
  await writeFile(fixture.file, document(head + social.replace(hash, 'a'.repeat(64))));
  await assert.rejects(() => verifyOutput(fixture.receipt), /identity|pathname|image/i);
});

test('bypassed pages retain their own metadata policy', async t => {
  const { verifyOutput } = await import('../../scripts/verify-output.ts');
  const { receipt } = await setup(t, '<title>Bypass</title><link rel="canonical" href="./">');
  receipt.pages = receipt.pages.map(page => ({ ...page, owned: false }));
  await verifyOutput(receipt);
});

for (const kind of ['missing chunk', 'wrong robots', 'wrong sitemap URL', 'duplicate sitemap URL', 'stale XML'] as const) {
  test(`output verification rejects ${kind}`, async t => {
    const { verifyOutput } = await import('../../scripts/verify-output.ts');
    const { receipt, outDir } = await setup(t);
    if (kind === 'missing chunk') await rm(new URL('sitemap-0.xml', outDir));
    if (kind === 'wrong robots') await writeFile(new URL('robots.txt', outDir), 'Sitemap: https://wrong.test/sitemap-index.xml');
    if (kind === 'wrong sitemap URL') await writeFile(new URL('sitemap-0.xml', outDir), '<urlset><url><loc>https://wrong.test/</loc></url></urlset>');
    if (kind === 'duplicate sitemap URL') await writeFile(new URL('sitemap-0.xml', outDir), `<urlset><url><loc>${site}${pathname}</loc></url><url><loc>${site}${pathname}</loc></url></urlset>`);
    if (kind === 'stale XML') await writeFile(new URL('sitemap-1.xml', outDir), '<urlset/>');
    await assert.rejects(() => verifyOutput(receipt));
  });
}

test('receipt reading rejects missing, malformed and unsafe metadata with build guidance', async t => {
  const fixture = await setup(t);
  const location = new URL('.astro/starter-build.json', fixture.root);
  const invalid: unknown[] = [null, [], {}, { ...fixture.receipt, version: 1 }, { ...fixture.receipt, site: 'file:///tmp/' }, { ...fixture.receipt, base: '../outside' }, { ...fixture.receipt, outDir: 'https://example.test/output/' }, { ...fixture.receipt, outDir: fixture.outDir.href.slice(0, -1) }, { ...fixture.receipt, format: 'unknown' }, { ...fixture.receipt, pages: [{ ...fixture.receipt.pages[0], file: new URL('../outside.html', fixture.outDir).href }] }, { ...fixture.receipt, pages: [{ ...fixture.receipt.pages[0], owned: 'false' }] }, { ...fixture.receipt, pages: [...fixture.receipt.pages, ...fixture.receipt.pages] }, { ...fixture.receipt, sitemapUrls: ['https://other.test/'] }];
  for (const value of invalid) {
    await writeFile(location, JSON.stringify(value));
    await assert.rejects(() => readBuildReceipt(fixture.root), /pnpm build|successful build/i);
  }
  await writeFile(location, '{invalid');
  await assert.rejects(() => readBuildReceipt(fixture.root), /pnpm build|successful build/i);
  await rm(location);
  await assert.rejects(() => readBuildReceipt(fixture.root), /pnpm build|successful build/i);
});

test('verification and lint CLIs require a receipt instead of guessing dist', async t => {
  const { root } = await setup(t);
  await rm(new URL('.astro/starter-build.json', root));
  for (const script of ['verify-output', 'lint-html']) {
    const result = await runScript(script, root);
    assert.notEqual(result.code, 0); assert.match(result.log, /pnpm build|successful build/i);
  }
});

test('HTML audit preserves published CLI finding and I/O exit statuses', async t => {
  const fixture = await setup(t, `${head}<meta name="keywords" content="useless">`);
  const finding = await runScript('lint-html', fixture.root);
  assert.equal(finding.code, 1, finding.log); assert.match(finding.log, /keywords/);
  assert.match(await readFile(fixture.file, 'utf8'), /name="keywords"/);
  await writeFile(fixture.file, document());
  const clean = await runScript('lint-html', fixture.root);
  assert.equal(clean.code, 0, clean.log);
  await rm(fixture.outDir, { recursive: true });
  const missing = await runScript('lint-html', fixture.root);
  assert.equal(missing.code, 2, missing.log);
});


test('generated image metadata must retain the recorded URL', async t => {
  const { verifyOutput } = await import('../../scripts/verify-output.ts');
  const { receipt } = await setup(t, head + social.replace(imageUrl, `${site}/project/_social`));
  receipt.pages = receipt.pages.map(page => ({ ...page, generatedImageUrl: imageUrl }));
  await assert.rejects(() => verifyOutput(receipt), /identity|image/i);
});

test('receipt paths reject empty query and fragment delimiters', async t => {
  const { root, receipt } = await setup(t);
  for (const delimiter of ['?', '#']) {
    for (const field of ['file', 'url'] as const) {
      const pages = receipt.pages.map(page => ({ ...page, [field]: page[field] + delimiter }));
      const value = { ...receipt, pages, sitemapUrls: field === 'url' ? receipt.sitemapUrls.map(url => url + delimiter) : receipt.sitemapUrls };
      await writeFile(new URL('.astro/starter-build.json', root), JSON.stringify(value));
      await assert.rejects(() => readBuildReceipt(root), /pnpm build|successful build/i);
    }
  }
});


test('manual images in the released generator namespace are not probed', async t => {
  const { verifyOutput } = await import('../../scripts/verify-output.ts');
  const { receipt } = await setup(t, head + social);
  await verifyOutput(receipt);
});

test('generated images cannot lose their entire social block', async t => {
  const { verifyOutput } = await import('../../scripts/verify-output.ts');
  const { receipt } = await setup(t);
  receipt.pages = receipt.pages.map(page => ({ ...page, generatedImageUrl: imageUrl }));
  await assert.rejects(() => verifyOutput(receipt), /generated image/i);
});

test('receipt rejects invalid generated image identities and ownership', async t => {
  const { root, receipt } = await setup(t);
  for (const change of [
    { generatedImageUrl: imageUrl.replace(hash, 'a'.repeat(64)) },
    { generatedImageUrl: imageUrl, owned: false },
    { generatedImageUrl: null },
  ]) {
    const pages = receipt.pages.map(page => ({ ...page, ...change }));
    await writeFile(new URL('.astro/starter-build.json', root), JSON.stringify({ ...receipt, pages }));
    await assert.rejects(() => readBuildReceipt(root), /pnpm build|successful build/i);
  }
});
