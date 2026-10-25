import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSeo, type LayoutProps, type SeoContext } from '../../src/lib/seo.ts';

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
