import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getFaviconHref,
  getGeneratedImageUrl,
  getPageUrl,
  getSitemapUrl,
  parseSiteNoindex,
  resolveProjectUrl,
  validateSiteOrigin,
} from '../../src/lib/seo.ts';

const origin = new URL('https://example.test');

test('preview noindex defaults to false and accepts only exact boolean strings', () => {
  assert.equal(parseSiteNoindex(undefined), false);
  assert.equal(parseSiteNoindex('false'), false);
  assert.equal(parseSiteNoindex('true'), true);
  for (const value of ['', ' ', 'TRUE', 'False', '1', '0', ' true', 'false ']) {
    assert.throws(() => parseSiteNoindex(value), /SITE_NOINDEX/);
  }
});

test('site is optional in development and required for production builds', () => {
  assert.equal(validateSiteOrigin(undefined, false), undefined);
  assert.throws(() => validateSiteOrigin(undefined, true), /site/);
});

test('site accepts HTTP origins, ports and a root slash', () => {
  for (const [value, expected] of [
    ['https://example.test', 'https://example.test/'],
    ['http://example.test:8080/', 'http://example.test:8080/'],
    ['https://EXAMPLE.test/', 'https://example.test/'],
    ['http://[::1]:4321', 'http://[::1]:4321/'],
  ]) {
    assert.equal(validateSiteOrigin(value, true)?.href, expected);
  }
});

test('site rejects credentials, subpaths, queries, fragments and malformed origins', () => {
  for (const value of [
    '', ' ', 'example.test', 'https:', 'https://', 'https://exa mple.test',
    'ftp://example.test', 'https://user:pass@example.test',
    'https://example.test/project/', 'https://example.test/project/..',
    'https://example.test/?q=1', 'https://example.test/?',
    'https://example.test/#section', 'https://example.test/#',
  ]) {
    assert.throws(() => validateSiteOrigin(value, true), /site/, value);
    assert.throws(() => validateSiteOrigin(value, false), /site/, value);
  }
});

test('explicit URLs resolve against the project root rather than the current page', () => {
  for (const [value, expected] of [
    ['images/a.png', 'https://example.test/project/images/a.png'],
    ['/shared/a.png', 'https://example.test/shared/a.png'],
    ['/project/a.png', 'https://example.test/project/a.png'],
    ['https://cdn.example.test/a.png?v=2', 'https://cdn.example.test/a.png?v=2'],
    ['//cdn.example.test/a.png', 'https://cdn.example.test/a.png'],
  ]) {
    assert.equal(resolveProjectUrl(value!, origin, '/project/', 'image'), expected);
  }
  assert.equal(resolveProjectUrl('about/?page=2', origin, '/project/', 'canonical'),
    'https://example.test/project/about/?page=2');
  assert.equal(resolveProjectUrl('about/', origin, '/', 'canonical'),
    'https://example.test/about/');
});

test('explicit metadata URLs reject blank or non-HTTP values and canonical fragments', () => {
  for (const value of ['', ' ', 'ftp://example.test/a', 'data:image/png;base64,abc',
    'javascript:alert(1)', 'https://', 'http://exa mple.test/a']) {
    for (const kind of ['canonical', 'image'] as const) {
      assert.throws(() => resolveProjectUrl(value, origin, '/', kind), /URL/);
    }
  }
  for (const value of ['about/#team', 'about/#']) {
    assert.throws(() => resolveProjectUrl(value, origin, '/', 'canonical'), /fragment/);
  }
  assert.equal(resolveProjectUrl('a.svg#mark', origin, '/', 'image'),
    'https://example.test/a.svg#mark');
});

test('page identity keeps the actual pathname and removes request query and fragment', () => {
  assert.equal(getPageUrl(new URL('http://localhost/project/about/?utm=x#team'), origin),
    'https://example.test/project/about/');
  for (const pathname of ['/Caf%C3%A9/', '/Case/', '/%2F/', '/%252F/', '//other.test/']) {
    const request = new URL('http://localhost');
    request.pathname = pathname;
    assert.equal(getPageUrl(request, origin), `https://example.test${pathname}`);
  }
});

test('favicon and sitemap paths apply the deployment base once', () => {
  for (const [base, favicon, sitemap] of [
    ['/', '/favicon.ico', 'https://example.test/sitemap-index.xml'],
    ['/project/', '/project/favicon.ico', 'https://example.test/project/sitemap-index.xml'],
    ['/project', '/project/favicon.ico', 'https://example.test/project/sitemap-index.xml'],
  ]) {
    assert.equal(getFaviconHref(base!), favicon);
    assert.equal(getSitemapUrl(origin, base!), sitemap);
  }
});

test('generated images hash the serialized pathname without merging route identities', async () => {
  // SHA-256 of the single slash, independently checked with sha256sum.
  assert.equal(await getGeneratedImageUrl('/', origin, '/project/'),
    'https://example.test/project/_social/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1.png');
  const paths = ['/Caf%C3%A9/', '/café/', '/Case/', '/case/', '/%2F/', '/%2f/', '/%252F/'];
  const urls = await Promise.all(paths.map(path => getGeneratedImageUrl(path, origin, '/')));
  assert.equal(new Set(urls).size, paths.length);
  for (const url of urls) {
    assert.match(url, /^https:\/\/example\.test\/_social\/[a-f0-9]{64}\.png$/);
  }
});
