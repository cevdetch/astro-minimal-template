# Astro Minimal Template

A minimal Astro starter with strictest TypeScript, shared page metadata and
replaceable neutral assets. Start with `src/pages/index.astro` and add pages as
your project grows. The default page uses browser-native styling and fonts.

## Requirements

- Node.js 24.8.0 or newer
- pnpm 12.3.4, pinned in `package.json`

## Setup

Run these commands from the project root:

```sh
pnpm install --frozen-lockfile
pnpm dev --background
```

Open the local URL from the server output. Use `pnpm dev status`,
`pnpm dev logs`, and `pnpm dev stop` to manage the background server.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm check` | Check Astro and TypeScript files for errors |
| `pnpm test` | Test URL resolution and metadata policy |
| `pnpm test:build` | Check configuration and rendered metadata with real builds |
| `pnpm build` | Build the static site into `dist/` |
| `pnpm preview` | Preview the production build |
| `pnpm astro --help` | Read Astro CLI help |

Run `pnpm check`, `pnpm test`, `pnpm test:build`, and `pnpm build` before committing
changes. Astro's build command does not run the type checker.

## Production URL

Set `site` in `astro.config.mjs` to your production origin before building. For
this project, the origin is `https://astro-minimal-template.cevdet.ch`:

```js
export default defineConfig({
  site: 'https://astro-minimal-template.cevdet.ch',
  integrations: [
    siteValidation(),
    indexing.collect,
    sitemap({ filter: indexing.filter, customPages: indexing.sitemapPages }),
    indexing.finalize,
  ],
});
```

Use your own domain when copying the template. A build fails if `site` is missing
or includes credentials, a path, a query, or a fragment. HTTP and HTTPS origins
may include a port and a root slash. Development works without `site`.

For a subpath deployment, set `base: '/project/'` alongside the origin. Leave
`base` out for a site at the domain root. See Astro's
[site and base configuration](https://docs.astro.build/en/reference/configuration-reference/#site).

You can override the origin for one build without editing configuration:

```sh
pnpm build --site https://astro-minimal-template.cevdet.ch
```

The typed helpers in `src/lib/seo.ts` resolve relative metadata URLs against the
project root, including `base`. A leading `/` uses the domain root; an absolute
URL keeps its own origin. Explicit queries remain intact. Canonical URLs reject
fragments; page URLs discard request queries and fragments. The helpers validate
URL syntax without fetching the target.

## Page metadata

Use `src/layouts/Layout.astro` for each full page. Supply a nonblank `title` and
`description`; the layout preserves their complete text and escapes it as HTML.
For example, in `src/pages/about.astro`:

```astro
---
import Layout from '../layouts/Layout.astro';
---

<Layout title="About" description="Learn about this project.">
  <main>
    <h1>About</h1>
    <p>Write your page content here.</p>
  </main>
</Layout>
```

| Prop | Type | Behavior |
| --- | --- | --- |
| `title` | `string`, required | Full HTML title and, when an image exists, Open Graph title |
| `description` | `string`, required | HTML description and, when an image exists, Open Graph description |
| `lang` | `string` | Defaults to `en`; supply a nonblank language tag |
| `dir` | `'ltr' \| 'rtl' \| 'auto'` | Omitted by default; set direction when needed |
| `canonical` | `string \| false` | Defaults to the production page URL; override it or pass `false` to omit the link |
| `noindex` | `boolean` | Defaults to `false`; `true` adds `<meta name="robots" content="noindex">` |
| `image` | `{ src?: string; alt?: string } \| false` | Supply `src` for social metadata; omit it or use `false` for no social block |

Language and direction are separate. For a right-to-left page, use a suitable
language tag and set `dir="rtl"`, for example `lang="ar" dir="rtl"`.

Override `canonical` when another URL represents the same content, such as a
print view pointing to its main article. `noindex` preserves the canonical link
and any manual image. Use `canonical={false}` or `image={false}` to omit them.
These props do not change the HTTP status of a page.

### Manual social images

Add your image to `public/`, or use an absolute image URL. Pass its path in
`image.src`:

```astro
<Layout
  title="About"
  description="Learn about this project."
  image={{ src: 'images/about.png', alt: 'The project team at work.' }}
>
  <main>
    <h1>About</h1>
    <p>Write your page content here.</p>
  </main>
</Layout>
```

With an image, the layout adds Open Graph type, URL, title, description and image,
plus `twitter:card="summary_large_image"`. `og:url` follows the canonical override;
with `canonical={false}`, it uses the production page URL.

`image.alt` is optional. Supply it when you want an image description; missing
or blank alt adds no `og:image:alt`. The layout does not invent alt from the title
or description. An alt-only object adds no social block without an image source.
Manual image URLs receive syntax validation without a download or dimension check.

Without an image source, the page keeps its HTML title and description and emits
no Open Graph or Twitter tags. Preview cards then depend on the sharing service's
fallback behavior. In development without `site`, the layout omits canonical and
social metadata, including absolute manual images.

## Preview noindex

Set `SITE_NOINDEX=true` when building a preview that search engines should not index:

```sh
SITE_NOINDEX=true pnpm build --site https://astro-minimal-template.cevdet.ch
```

An unset value defaults to false. When set, use the exact string `true` or `false`;
empty values, whitespace, numeric values and other spellings fail validation.
Page props accept booleans: use `noindex={true}` or `noindex={false}`. A page cannot
override preview-wide noindex. Production canonical and manual-image URLs stay
the same. A robots meta tag asks crawlers not to index a page; it does not restrict
access to its content.

## Sitemap and robots

The starter uses [Astro's official sitemap integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/).
Keep the integration order in `astro.config.mjs`: collect page policy, generate
the official sitemap, then verify crawler output. The collected `sitemapPages`
array supplies actual emitted URLs through `customPages`, including `.html` URLs
in file output mode. You do not maintain a separate route list.

The sitemap includes ordinary indexable pages. It excludes page-level noindex,
404/500 pages, redirects, and pages whose canonical points to a different URL.
`canonical={false}` alone keeps a page eligible. Preview-wide `SITE_NOINDEX=true`
preserves the production sitemap selection.

Pages that bypass Layout use their own robots and canonical metadata for this
selection. Copied `public/` HTML does not enter page discovery. The build preserves
request-path encoding for metadata; Astro still normalizes paths when matching
routes, so avoid routes that differ only by repeated percent encoding.

`src/pages/robots.txt.ts` generates crawler rules from `site` and `base`. It allows
crawling so crawlers can read noindex metadata, and advertises the absolute
`sitemap-index.xml` URL. The index points to the integration's standard sitemap
chunks. If no pages qualify, the integration creates no XML and the finalizer
omits the `Sitemap:` line. Development without `site` also omits that line.

For subpath hosting, crawlers need rules at the domain root: `/robots.txt`.
Ask the host owner to publish or merge the generated rules there and preserve the
absolute sitemap URL. A file served only at `/project/robots.txt` is insufficient.

A build fails on ambiguous page output, malformed internal page markers, missing
sitemap chunks, stale sitemap XML or inconsistent crawler references. Successful
output contains no internal markers. The ignored `.astro/starter-build.json`
records the actual origin, base, output directory and emitted pages for local checks;
deploy only the contents of your configured output directory.

## Not-found page

`src/pages/404.astro` provides a semantic not-found page with a base-aware home
link. It sets `noindex={true}`, `canonical={false}` and `image={false}`.
Configure your static host to serve `404.html` with an HTTP 404 status for missing
URLs. The page metadata does not configure the host's response status.

## Project files

Add routes in `src/pages/`, place static assets in `public/`, and configure Astro
in `astro.config.mjs`. TypeScript uses `astro/tsconfigs/strictest`.

See the [Astro documentation](https://docs.astro.build) for routing, components,
and configuration.

## Starter assets

The starter includes a replaceable neutral C mark. The page declares only
`public/favicon.ico`, which contains one 48×48 PNG image. Replace this file to
change the browser icon.

The asset set also includes `logo.svg` with reduced-motion-aware animation, a
static `icon.svg`, `apple-touch-icon.png` at 180×180, and opaque, padded
`icon-192.png` and `icon-512.png`. These extra assets have no declarations in the
starter page; use them when adding your project's logo or installation metadata.

The checked-in assets need no image-generation package or external checkout to
build.

## License

[MIT](LICENSE). Replace the starter assets with your own branding when needed.
