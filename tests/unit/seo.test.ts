import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTitle, getAuthorWarning, getStructuredData, resolveSeo, type LayoutProps, type SeoContext } from '../../src/lib/seo.ts';

const props: LayoutProps = { title: 'A page', description: 'A page description.' };
const context: SeoContext = {
  site: 'https://example.test', base: '/project/',
  url: new URL('http://localhost/project/about/?tracking=1#section'),
  mode: 'build', siteNoindex: false, socialImages: false,
};

test('required text stays complete and defaults produce no direction or social data', async () => {
  const title = '  A <page> & "quote" ' + 'long '.repeat(80);
  const description = ' Description with <tags> & "quotes". ';
  const seo = await resolveSeo({ title, description }, context);
  assert.equal(seo.title, title);
  assert.equal(seo.description, description);
  assert.equal(seo.lang, 'en');
  assert.equal(seo.dir, undefined);
  assert.equal(seo.robotsNoindex, false);
  assert.equal(seo.canonicalUrl, 'https://example.test/project/about/');
  assert.equal(seo.faviconHref, '/project/favicon.ico');
  assert.equal(seo.social, undefined);
  assert.equal(seo.generatedImageUrl, undefined);
  assert.deepEqual(seo.pagePolicy, { pathname: '/project/about/', noindex: false });
});

test('required text, language, direction and noindex reject invalid runtime props', async () => {
  const invalid: Record<string, unknown>[] = [
    { title: undefined }, { title: '' }, { title: ' \n' }, { title: 12 },
    { description: undefined }, { description: '' }, { description: ' ' },
    { lang: '' }, { lang: ' ' }, { lang: false }, { dir: 'sideways' },
    { dir: '' }, { noindex: 'true' }, { noindex: 'false' }, { noindex: 0 },
    { noindex: null }, { canonical: true }, { image: null }, { image: true },
    { image: { src: '' } }, { image: { src: ' ' } }, { image: { alt: true } },
    { home: 'true' }, { home: 1 },
  ];
  for (const overrides of invalid) {
    await assert.rejects(resolveSeo({ ...props, ...overrides } as LayoutProps, context));
  }
});

test('language does not infer direction and explicit directions are preserved', async () => {
  assert.equal((await resolveSeo({ ...props, lang: 'ar' }, context)).dir, undefined);
  for (const dir of ['ltr', 'rtl', 'auto'] as const) {
    const seo = await resolveSeo({ ...props, lang: 'ar', dir }, context);
    assert.equal(seo.lang, 'ar');
    assert.equal(seo.dir, dir);
  }
});

test('manual image and canonical use project-root resolution and explicit queries', async () => {
  const seo = await resolveSeo({
    ...props, canonical: 'original/?page=2',
    image: { src: 'images/share.png?v=3', alt: ' An illustration. ' },
  }, context);
  assert.equal(seo.canonicalUrl, 'https://example.test/project/original/?page=2');
  assert.deepEqual(seo.social, {
    url: 'https://example.test/project/original/?page=2',
    imageUrl: 'https://example.test/project/images/share.png?v=3',
    imageAlt: ' An illustration. ',
  });
  assert.equal(seo.generatedImageUrl, undefined);
});

test('page noindex and preview noindex retain canonical and explicit manual images', async () => {
  for (const [pageNoindex, siteNoindex] of [[true, false], [false, true], [true, true]] as const) {
    const seo = await resolveSeo({ ...props, noindex: pageNoindex, image: { src: '/share.png' } },
      { ...context, siteNoindex });
    assert.equal(seo.robotsNoindex, true);
    assert.equal(seo.canonicalUrl, 'https://example.test/project/about/');
    assert.equal(seo.social?.imageUrl, 'https://example.test/share.png');
    assert.equal(seo.pagePolicy?.noindex, pageNoindex);
  }
  assert.equal((await resolveSeo({ ...props, noindex: false }, context)).robotsNoindex, false);
});

test('canonical false omits only the link while social URL uses actual page identity', async () => {
  const seo = await resolveSeo({ ...props, canonical: false, image: { src: '/share.png' } }, context);
  assert.equal(seo.canonicalUrl, undefined);
  assert.equal(seo.social?.url, 'https://example.test/project/about/');
});

test('manual image alt is opt-in and blank alt is omitted without a text fallback', async () => {
  for (const image of [{ src: '/share.png' }, { src: '/share.png', alt: '' },
    { src: '/share.png', alt: ' \n' }]) {
    const seo = await resolveSeo({ ...props, image }, context);
    assert.equal(seo.social?.imageUrl, 'https://example.test/share.png');
    assert.equal(seo.social?.imageAlt, undefined);
  }
});

test('no image source means no social data when automatic images are disabled', async () => {
  for (const image of [undefined, {}, { alt: 'An illustration.' }, false] as const) {
    const input = image === undefined ? props : { ...props, image };
    const seo = await resolveSeo(input, context);
    assert.equal(seo.social, undefined);
    assert.equal(seo.generatedImageUrl, undefined);
  }
});

test('development without site omits canonical and social metadata even with an absolute image', async () => {
  const seo = await resolveSeo({ ...props, image: { src: 'https://cdn.example.test/share.png' } },
    { ...context, mode: 'dev', site: undefined, socialImages: true });
  assert.equal(seo.title, props.title);
  assert.equal(seo.canonicalUrl, undefined);
  assert.equal(seo.social, undefined);
  assert.equal(seo.generatedImageUrl, undefined);
  assert.equal(seo.pagePolicy, undefined);
  assert.equal(seo.faviconHref, '/project/favicon.ico');
});

test('development and on-demand contexts allow manual images but plan no automatic image', async () => {
  for (const mode of ['dev', 'server'] as const) {
    const setup = { ...context, mode, socialImages: true };
    const automatic = await resolveSeo(props, setup);
    assert.equal(automatic.social, undefined);
    assert.equal(automatic.pagePolicy, undefined);
    const manual = await resolveSeo({ ...props, image: { src: '/share.png' } }, setup);
    assert.equal(manual.social?.imageUrl, 'https://example.test/share.png');
    assert.equal(manual.generatedImageUrl, undefined);
  }
});

test('automatic image planning follows page eligibility, controls and opt-in alt', async () => {
  const setup = { ...context, socialImages: true };
  const automatic = await resolveSeo(props, setup);
  assert.match(automatic.generatedImageUrl!, /^https:\/\/example\.test\/project\/_social\/[a-f0-9]{64}\.png$/);
  assert.equal(automatic.social?.imageUrl, automatic.generatedImageUrl);
  assert.equal(automatic.social?.imageAlt, undefined);
  const withAlt = await resolveSeo({ ...props, image: { alt: 'A card.' } }, setup);
  assert.equal(withAlt.social?.imageAlt, 'A card.');
  assert.equal(withAlt.generatedImageUrl, automatic.generatedImageUrl);
  const preview = await resolveSeo(props, { ...setup, siteNoindex: true });
  assert.equal(preview.generatedImageUrl, automatic.generatedImageUrl);
  assert.equal(preview.pagePolicy?.noindex, false);
  const noCanonical = await resolveSeo({ ...props, canonical: false }, setup);
  assert.equal(noCanonical.generatedImageUrl, automatic.generatedImageUrl);
  const override = await resolveSeo({ ...props, canonical: 'https://example.test/another/' }, setup);
  assert.equal(override.generatedImageUrl, automatic.generatedImageUrl);
  assert.equal(override.social?.url, 'https://example.test/another/');
  for (const overrides of [{ noindex: true }, { image: false as const }]) {
    const seo = await resolveSeo({ ...props, ...overrides }, setup);
    assert.equal(seo.generatedImageUrl, undefined);
    assert.equal(seo.social, undefined);
  }
  const manual = await resolveSeo({ ...props, image: { src: '/manual.png' } }, setup);
  assert.equal(manual.generatedImageUrl, undefined);
  assert.equal(manual.social?.imageUrl, 'https://example.test/manual.png');
});

test('the site name follows inner page titles and leads the homepage title', async () => {
  assert.equal(formatTitle('About', 'Site', false), 'About - Site');
  assert.equal(formatTitle('what it does', 'Site', true), 'Site: what it does');
  assert.equal(formatTitle('About', undefined, true), 'About');
  const named = { ...context, siteName: 'Site' };
  assert.equal((await resolveSeo(props, named)).title, 'A page - Site');
  assert.equal((await resolveSeo({ ...props, home: false }, named)).title, 'A page - Site');
  const home = await resolveSeo({ ...props, home: true, image: { src: '/share.png' } }, named);
  assert.equal(home.title, 'Site: A page');
  assert.equal(home.siteName, 'Site');
  assert.equal((await resolveSeo(props, context)).siteName, undefined);
  for (const siteName of ['', ' \n']) {
    await assert.rejects(resolveSeo(props, { ...context, siteName }), /siteConfig\.name/);
  }
});

const author = { name: 'Author', url: 'https://author.example.test' };
const credit = { '@type': 'Person', '@id': 'https://author.example.test/#person', name: 'Author', url: 'https://author.example.test/' };
const website = (url: string) => ({
  '@type': 'WebSite', '@id': `${url}#website`, url, name: 'Site', inLanguage: 'en', publisher: credit,
});
const graph = (json: string | undefined) => JSON.parse(json!) as { '@context': string; '@graph': Record<string, unknown>[] };

test('the homepage carries WebSite data whose publisher credits the author', async () => {
  const setup = { ...context, siteName: 'Site', author, repository: 'https://git.example.test/site' };
  const home = await resolveSeo({ ...props, home: true }, setup);
  assert.deepEqual(graph(home.jsonLd), {
    '@context': 'https://schema.org', '@graph': [website('https://example.test/project/about/')],
  });
  assert.deepEqual(home.author, { name: 'Author', url: 'https://author.example.test/' });
  assert.equal(home.repository, 'https://git.example.test/site');
  const canonical = await resolveSeo({ ...props, home: true, canonical: '/' }, setup);
  assert.deepEqual(graph(canonical.jsonLd)['@graph'], [website('https://example.test/')]);
  const french = await resolveSeo({ ...props, home: true, lang: 'fr' }, setup);
  assert.equal(graph(french.jsonLd)['@graph'][0]!['inLanguage'], 'fr');
  assert.equal((await resolveSeo(props, setup)).jsonLd, undefined);
  assert.equal((await resolveSeo({ ...props, home: true }, { ...setup, mode: 'dev', site: undefined })).jsonLd, undefined);
  assert.equal((await resolveSeo({ ...props, home: true }, { ...setup, siteName: undefined })).jsonLd, undefined);
});

test('sourceCode adds SoftwareSourceCode data for the configured repository', async () => {
  const setup = { ...context, siteName: 'Site', author, repository: 'https://git.example.test/site', license: 'MIT' };
  const home = await resolveSeo({ ...props, home: true, canonical: '/', sourceCode: true }, setup);
  assert.deepEqual(graph(home.jsonLd)['@graph'], [website('https://example.test/'), {
    '@type': 'SoftwareSourceCode', '@id': 'https://example.test/#code', url: 'https://example.test/',
    mainEntityOfPage: 'https://example.test/', name: 'Site', codeRepository: 'https://git.example.test/site',
    programmingLanguage: ['TypeScript', 'Astro'], license: 'https://spdx.org/licenses/MIT.html', author: credit,
  }]);
  const unlicensed = await resolveSeo({ ...props, home: true, sourceCode: true }, { ...setup, license: undefined });
  assert.equal(graph(unlicensed.jsonLd)['@graph'][1]!['license'], undefined);
  const repositoryless = await resolveSeo({ ...props, home: true, sourceCode: true }, { ...setup, repository: undefined });
  assert.deepEqual(graph(repositoryless.jsonLd)['@graph'].map(node => node['@type']), ['WebSite']);
  const inner = await resolveSeo({ ...props, sourceCode: true }, setup);
  assert.deepEqual(graph(inner.jsonLd)['@graph'].map(node => node['@type']), ['SoftwareSourceCode']);
  for (const sourceCode of ['true', 1]) {
    await assert.rejects(resolveSeo({ ...props, sourceCode } as unknown as LayoutProps, setup), /sourceCode/);
  }
  for (const license of ['', 'MIT OR Apache-2.0', '../MIT']) {
    await assert.rejects(resolveSeo(props, { ...setup, license }), /siteConfig\.license/);
  }
});

test('an unset author or repository is omitted and invalid identity fails', async () => {
  const anonymous = await resolveSeo({ ...props, home: true }, { ...context, siteName: 'Site' });
  assert.equal(anonymous.author, undefined);
  assert.equal(anonymous.repository, undefined);
  assert.equal(graph(anonymous.jsonLd)['@graph'][0]!['publisher'], undefined);
  const uncredited = await resolveSeo({ ...props, home: true, sourceCode: true },
    { ...context, siteName: 'Site', repository: 'https://git.example.test/site' });
  assert.deepEqual(graph(uncredited.jsonLd)['@graph'].map(node => 'author' in node || 'publisher' in node), [false, false]);
  const invalid: Partial<SeoContext>[] = [
    { author: { name: ' ', url: 'https://author.example.test/' } },
    { author: { name: 'Author', url: '/relative/' } },
    { author: { name: 'Author', url: 'mailto:author@example.test' } },
    { author: null as unknown as undefined }, { repository: '' }, { repository: 'git@example.test:site.git' },
  ];
  for (const overrides of invalid) {
    await assert.rejects(resolveSeo(props, { ...context, ...overrides }), /siteConfig\.(author|repository)/);
  }
});

test('structured data cannot close its script element', () => {
  const name = '</script><script>alert(1)</script>';
  const json = getStructuredData({ url: 'https://example.test/', siteName: name, lang: 'en', home: true, sourceCode: false });
  assert.doesNotMatch(json!, /</);
  assert.equal(graph(json)['@graph'][0]!['name'], name);
});

test('the build warns while a site outside cevdet.ch credits the starter author', () => {
  const starterAuthor = { name: 'Cevdet Haran', url: 'https://cevdet.ch' };
  const warning = getAuthorWarning(new URL('https://fork.example.test'), starterAuthor);
  assert.match(warning!, /siteConfig\.author still credits Cevdet Haran \(https:\/\/cevdet\.ch\/\) on https:\/\/fork\.example\.test/);
  assert.match(warning!, /src\/config\.ts/);
  for (const site of ['https://cevdet.ch', 'https://astro-minimal-template.cevdet.ch']) {
    assert.equal(getAuthorWarning(new URL(site), starterAuthor), undefined);
  }
  assert.equal(getAuthorWarning(new URL('https://fork.example.test'), author), undefined);
  assert.equal(getAuthorWarning(new URL('https://fork.example.test'), undefined), undefined);
  assert.throws(() => getAuthorWarning(new URL('https://fork.example.test'), { name: 'Cevdet Haran', url: '/' }), /siteConfig\.author\.url/);
});
