import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import sharp from 'sharp';
import { parseDocument } from '../../src/integrations/documents.ts';
import { createBuildFixture } from '../helpers/build-fixture.ts';

const page = (props = '{}', title = 'Fixture & full title') => `---
import Layout from '../layouts/Layout.astro';
---
<Layout title=${JSON.stringify(title)} description="Full description & detail" {...${props}}><main>Content</main></Layout>`;
const config = (fields = '', extra = '') => `
import sitemap from '@astrojs/sitemap';
import { siteValidation } from './src/integrations/site.ts';
import { createIndexing } from './src/integrations/indexing.ts';
import { socialImages } from './src/integrations/social-images.ts';
const indexing = createIndexing();
export default { site:'https://example.test', ${fields} integrations:[siteValidation(),indexing.collect,${extra}socialImages(),sitemap({filter:indexing.filter,customPages:indexing.sitemapPages}),indexing.finalize] };
`;
async function consumer(t: { after(fn: () => Promise<void>): void }, options: { fields?: string; pages?: Record<string,string>; publicFiles?: Record<string,string>; extra?: string } = {}) {
  const fixture = await createBuildFixture({ configSource: config(options.fields, options.extra), pages: {
    'index.astro': page(), 'robots.txt.ts': "export {GET} from '../pages-source/robots.txt.ts';", ...options.pages,
  }, ...(options.publicFiles ? { publicFiles: options.publicFiles } : {}) });
  t.after(() => fixture.cleanup());
  for (const path of ['lib', 'integrations', 'layouts', 'assets', 'config.ts']) {
    await cp(new URL(`../../src/${path}`, import.meta.url), new URL(`src/${path}`, fixture.root), { recursive: true });
  }
  await mkdir(new URL('src/pages-source/', fixture.root));
  await cp(new URL('../../src/pages/robots.txt.ts', import.meta.url), new URL('src/pages-source/robots.txt.ts', fixture.root));
  return fixture;
}
const digest = (pathname: string) => createHash('sha256').update(pathname).digest('hex');
async function verifyImage(outDir: URL, parsed: ReturnType<typeof parseDocument>, pathname: string, base = '/') {
  assert.equal(parsed.title, 'Fixture & full title');
  assert.equal(parsed.description, 'Full description & detail');
  assert.equal(parsed.imageUrl, `https://example.test${base}_social/${digest(pathname)}.png`);
  const bytes = await readFile(new URL(`_social/${digest(pathname)}.png`, outDir));
  const { info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1200); assert.equal(info.height, 630);
  assert.equal((await sharp(bytes).metadata()).format, 'png');
}

for (const base of ['/', '/project/']) for (const format of ['directory', 'file']) {
  test(`automatic cards follow actual output and preserve metadata (${base}, ${format})`, async t => {
    const fixture = await consumer(t, { fields:`base:${JSON.stringify(base)},outDir:'./output/',build:{format:'${format}'},`, pages: {
      'alt.astro': page('{image:{alt:"An intentional image description"}}'),
      'blank.astro': page('{image:{alt:"  "}}'),
      'manual.astro': page('{noindex:true,image:{src:"images/manual.png"}}'),
      'false.astro': page('{image:false}'), 'hidden.astro': page('{noindex:true}'),
      'alias.astro': page('{canonical:"/original/"}'), 'alias-two.astro': page('{canonical:"/original/"}'),
      'no-canonical.astro': page('{canonical:false}'),
      'manual-no-canonical.astro': page('{canonical:false,image:{src:"/manual.png"}}'),
      'redirect.astro': '---\nreturn Astro.redirect("/manual/");\n---',
      'plain.astro': '<html><head><title>Bypass</title></head><body>Unmarked</body></html>',
      '404.astro': page('{noindex:true,canonical:false,image:false}'),
      '[...slug].astro': page().replace('---\nimport', `---\nexport function getStaticPaths(){return ['café','a%2Fb','a%252Fb','Case','case'].map(slug=>({params:{slug}}));}\nimport`),
    }, publicFiles:{'unrelated.html':'<head data-starter-social-v99="ignore"></head>'} });
    for (const preview of ['false','true']) {
      const result = await fixture.build([], {SITE_NOINDEX:preview});
      assert.equal(result.code, 0, result.log);
      const receipt = JSON.parse(await readFile(new URL('.astro/starter-build.json',fixture.root),'utf8')) as {pages:{file:string;url:string}[]};
      const images = new Set<string>();
      for(const record of receipt.pages) {
        const html = await readFile(new URL(record.file),'utf8');
        assert.doesNotMatch(html,/data-starter-|<script\b|<style\b/);
        const parsed = parseDocument(html), pathname = new URL(record.url).pathname;
        const name=pathname.slice(base.length).replace(/(?:\/|\.html)$/,'');
        if(['manual','manual-no-canonical'].includes(name)) {
          assert.equal(parsed.imageUrl, name==='manual' ? `https://example.test${base}images/manual.png`:'https://example.test/manual.png');
        } else if(['false','hidden','404','redirect','plain'].includes(name)) {
          assert.equal(parsed.imageUrl,undefined);
        } else {
          await verifyImage(result.outDir,parsed,pathname,base); images.add(parsed.imageUrl!);
          assert.equal(parsed.imageAlt,name==='alt'?'An intentional image description':undefined);
          assert.equal(parsed.robotsNoindex,preview==='true');
          if(name==='no-canonical') {assert.equal(parsed.canonicalUrl,undefined);assert.ok(html.includes(`content="${record.url}"`));}
        }
      }
      assert.equal(images.size,11);
      assert.equal((await readdir(new URL('_social/',result.outDir))).length,11);
      assert.ok((await readFile(new URL('robots.txt',result.outDir),'utf8')).includes(`Sitemap: https://example.test${base}sitemap-index.xml`));
      assert.doesNotMatch(await readFile(new URL('sitemap-0.xml',result.outDir),'utf8'), /\/alias(?:-two)?(?:\/|\.html)</);
    }
  });
}

test('preserve format and trailingSlash controls keep request identities',async t=>{
  for(const [fields,paths] of [
    ["build:{format:'preserve'},",['/','/about.html','/nested/']],
    ["trailingSlash:'never',",['/','/about','/nested']],
    ["base:'/project/',trailingSlash:'never',",['/project','/project/about','/project/nested']],
    ["trailingSlash:'always',",['/','/about/','/nested/']],
  ] as const){
    const fixture=await consumer(t,{fields,pages:{'about.astro':page(),'nested/index.astro':page().replace("../layouts/","../../layouts/")}});
    const result=await fixture.build();assert.equal(result.code,0,result.log);
    const receipt=JSON.parse(await readFile(new URL('.astro/starter-build.json',fixture.root),'utf8')) as {pages:{file:string;url:string}[]};
    assert.deepEqual(receipt.pages.map(p=>new URL(p.url).pathname).sort(),[...paths].sort());
    for(const record of receipt.pages) await verifyImage(result.outDir,parseDocument(await readFile(new URL(record.file),'utf8')),new URL(record.url).pathname,fields.includes('project')?'/project/':'/');
  }
});

test('root/index file collision fails without a successful receipt',async t=>{
  const fixture=await consumer(t,{fields:"build:{format:'file'},",pages:{'index/index.astro':page().replace("../layouts/","../../layouts/")}});
  const result=await fixture.build();assert.notEqual(result.code,0);assert.match(result.log,/duplicate|ambiguous|collision/i);
  await assert.rejects(readFile(new URL('.astro/starter-build.json',fixture.root)),{code:'ENOENT'});
});

test('route deletion, manual override, global disable and zero eligible leave no stale cards',async t=>{
  const fixture=await consumer(t,{pages:{'about.astro':page()}});
  let result=await fixture.build();assert.equal(result.code,0,result.log);
  assert.equal((await readdir(new URL('_social/',result.outDir))).length,2);
  await rm(new URL('src/pages/about.astro',fixture.root));
  await writeFile(new URL('src/pages/index.astro',fixture.root),page('{image:{src:"/manual.png"}}'));
  result=await fixture.build();assert.equal(result.code,0,result.log);
  await assert.rejects(readdir(new URL('_social/',result.outDir)),{code:'ENOENT'});
  await rm(new URL('src/assets/social-fonts/',fixture.root),{recursive:true});
  await writeFile(new URL('src/config.ts',fixture.root),'export const siteConfig={socialImages:false};');
  await writeFile(new URL('src/pages/index.astro',fixture.root),page());
  result=await fixture.build();assert.equal(result.code,0,result.log);
  assert.equal(parseDocument(await readFile(new URL('index.html',result.outDir),'utf8')).imageUrl,undefined);
  await writeFile(new URL('src/config.ts',fixture.root),'export const siteConfig={socialImages:true};');
  await writeFile(new URL('src/pages/index.astro',fixture.root),page('{image:false}'));
  result=await fixture.build();assert.equal(result.code,0,result.log);
});

test('reserved public, route and manual-image collisions preserve consumer files even when disabled',async t=>{
  for(const kind of ['public','route','manual','file','symlink']) {
    const fixture=await consumer(t,{pages:kind==='route'?{'[...slug].astro':'---\nexport function getStaticPaths(){return [{params:{slug:"_social/mine"}}];}\n---\n<html><head><title>Mine</title></head><body>Mine</body></html>'}:kind==='manual'?{'index.astro':page('{image:{src:"_social/mine.png"}}')}:{},publicFiles:kind==='public'?{'_social/mine.txt':'consumer'}:kind==='file'?{'_social':'consumer'}:kind==='symlink'?{'owned/keep.txt':'consumer'}:{}});
    if(kind==='symlink') await symlink('owned',new URL('public/_social',fixture.root),'dir');
    await writeFile(new URL('src/config.ts',fixture.root),'export const siteConfig={socialImages:false};');
    const result=await fixture.build();assert.notEqual(result.code,0,result.log);assert.match(result.log,/namespace|occupied/);
    if(kind==='symlink') assert.equal(await readFile(new URL('public/owned/keep.txt',fixture.root),'utf8'),'consumer');
    if(kind==='public'||kind==='file') assert.equal(await readFile(new URL(kind==='public'?'public/_social/mine.txt':'public/_social',fixture.root),'utf8'),'consumer');
    await assert.rejects(readFile(new URL('.astro/starter-build.json',fixture.root)),{code:'ENOENT'});
  }
});

test('unsupported glyph and unknown marker failures clear receipt; recovery succeeds',async t=>{
  const fixture=await consumer(t);
  assert.equal((await fixture.build()).code,0);
  for(const content of [page('{}','bad 😀'),'<html><head data-starter-social-v2="bad"><title>Bad</title></head></html>']){
    await writeFile(new URL('src/pages/index.astro',fixture.root),content);
    const result=await fixture.build();assert.notEqual(result.code,0);assert.match(result.log,/manual image|marker/);
    await assert.rejects(readFile(new URL('.astro/starter-build.json',fixture.root)),{code:'ENOENT'});
  }
  await writeFile(new URL('src/pages/index.astro',fixture.root),page());
  const result=await fixture.build();assert.equal(result.code,0,result.log);
});


test('physical removal builds manual metadata and crawlers with normal remaining dependencies', async t => {
  const fixture = await consumer(t);
  await writeFile(new URL('src/config.ts', fixture.root), 'export const siteConfig={socialImages:false};');
  const original = config();
  await writeFile(new URL('fixture.config.mjs', fixture.root), original
    .replace("import { socialImages } from './src/integrations/social-images.ts';", '')
    .replace('socialImages(),', ''));
  for (const path of ['integrations/social-images.ts', 'lib/social-card.ts', 'lib/social-renderer.ts', 'assets/social-fonts/']) {
    await rm(new URL(`src/${path}`, fixture.root), { recursive: true });
  }
  await writeFile(new URL('src/pages/index.astro', fixture.root), page('{image:{src:"/manual.png"}}'));
  for (const path of ['package.json', 'pnpm-lock.yaml', 'tsconfig.json']) {
    await cp(new URL(`../../${path}`, import.meta.url), new URL(path, fixture.root));
  }
  await promisify(execFile)('pnpm', ['remove', '-D', 'satori', 'sharp', '--offline'], { cwd: fixture.root, maxBuffer: 1024 * 1024 });
  const manifest = JSON.parse(await readFile(new URL('package.json', fixture.root), 'utf8')) as {devDependencies: Record<string,string>};
  assert.equal(manifest.devDependencies['satori'], undefined);
  assert.equal(manifest.devDependencies['sharp'], undefined);
  assert.equal(manifest.devDependencies['parse5'], '8.0.1');
  await promisify(execFile)('pnpm', ['check'], { cwd: fixture.root, maxBuffer: 1024 * 1024 });
  const result = await fixture.build(); assert.equal(result.code, 0, result.log);
  const html = await readFile(new URL('index.html', result.outDir), 'utf8');
  assert.equal(parseDocument(html).imageUrl, 'https://example.test/manual.png');
  assert.doesNotMatch(html, /data-starter-|_social/);
  await readFile(new URL('sitemap-0.xml', result.outDir));
  assert.match(await readFile(new URL('robots.txt', result.outDir), 'utf8'), /Sitemap:/);
  await assert.rejects(readdir(new URL('_social/', result.outDir)), {code:'ENOENT'});
});

test('card extraction uses HTML title and description when OG text is absent', async t => {
  const fixture = await consumer(t, { extra: `{
    name:'test:remove-og-text',hooks:{'astro:build:done':async({dir})=>{
      const {readFile,writeFile}=await import('node:fs/promises');
      const file=new URL('index.html',dir);
      const html=await readFile(file,'utf8');
      await writeFile(file,html.replace(/<meta property="og:(?:title|description)"[^>]*>/g,''));
    }}},` });
  const result = await fixture.build(); assert.equal(result.code, 0, result.log);
  const html = await readFile(new URL('index.html', result.outDir), 'utf8');
  assert.doesNotMatch(html, /property="og:(?:title|description)"/);
  await verifyImage(result.outDir, parseDocument(html), '/');
});
