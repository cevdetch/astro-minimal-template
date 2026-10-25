# Astro Minimal Template

A minimal Astro starter with strictest TypeScript, shared page metadata and
replaceable neutral assets. Start with `src/pages/index.astro` and add pages as
your project grows. The default page uses browser-native styling and fonts,
with no application JavaScript, author CSS or downloaded webfont.

## Requirements

- Node.js 24.8.0 or newer
- pnpm 12.3.4, pinned in `package.json`

## Setup

Create a repository with [Use this template](https://github.com/cevdetch/astro-minimal-template/generate),
then clone your copy.

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
| `pnpm test` | Test metadata, URL resolution and title-card generation |
| `pnpm test:build` | Check configuration and rendered metadata with real builds |
| `pnpm build` | Build the static site into `dist/` |
| `pnpm verify:output` | Validate the last recorded successful build output |
| `pnpm lint:html` | Audit the recorded output directory with deadhead |
| `pnpm verify` | Run type checks, both test suites, a fresh build, output checks and HTML audit |
| `pnpm preview` | Preview the production build |
| `pnpm astro --help` | Read Astro CLI help |

Use `pnpm preview status`, `pnpm preview logs` and `pnpm preview stop` to manage
the preview server.

With `site` configured, run `pnpm verify` before committing changes. Astro's
build command alone does not run the type checker or tests.

## Production URL

Uncomment `site` in `astro.config.mjs` and replace `https://example.com` with your
production origin before building, or supply it with `--site`. The starter keeps
this value unset so copied projects do not inherit another site's canonical URLs.
Preserve the existing imports and integration order:

```js
export default defineConfig({
  site: 'https://example.com',
  integrations: [
    siteValidation(),
    indexing.collect,
    socialImages(),
    sitemap({ filter: indexing.filter, customPages: indexing.sitemapPages }),
    indexing.finalize,
  ],
});
```

`https://example.com` is a documentation example; replace it with your domain.
A build fails if `site` is missing or includes credentials, a path, a query, or
a fragment. HTTP and HTTPS origins
may include a port and a root slash. Development works without `site`.

For a subpath deployment, set `base: '/project/'` alongside the origin. Leave
`base` out for a site at the domain root. See Astro's
[site and base configuration](https://docs.astro.build/en/reference/configuration-reference/#site).

You can override the origin for one build without editing configuration:

```sh
pnpm build --site https://example.com
```

The typed helpers in `src/lib/seo.ts` resolve relative metadata URLs against the
project root, including `base`. A leading `/` uses the domain root; an absolute
URL keeps its own origin. Explicit queries remain intact. Canonical URLs reject
fragments; page URLs discard request queries and fragments. The helpers validate
URL syntax without fetching the target.

### Cloudflare Pages

For this static starter, connect your repository through the
[Cloudflare Pages dashboard](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/#deploy-via-the-cloudflare-dashboard).
Use these build settings, replacing the example origin:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `pnpm build --site https://example.com && pnpm verify:output && pnpm lint:html` |
| Build output directory | `dist` |
| `NODE_VERSION` | `24.8.0` |
| `PNPM_VERSION` | `12.3.4`, matching `packageManager` |

Cloudflare documents these toolchain overrides in its
[build image settings](https://developers.cloudflare.com/pages/configuration/build-image/#override-default-versions).
If you set the real `site` in `astro.config.mjs`, the build command can start with
`pnpm build` instead. Keep the production origin for preview builds too; set
`SITE_NOINDEX=true` in Cloudflare's preview environment to add noindex metadata.
Leave it unset for production. Add your domain in the project's custom-domain
settings; the `site` value controls generated URLs and does not configure DNS.

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
| `image` | `{ src?: string; alt?: string } \| false` | Omit `src` for an automatic title card; supply `src` for a manual image, or use `false` for no social block |

Language and direction are separate. For a right-to-left page, use a suitable
language tag and set `dir="rtl"`. Use a manual image or disable the social block
because the bundled card renderer does not support RTL text:

```astro
<Layout title="حول المشروع" description="معلومات عن المشروع." lang="ar" dir="rtl" image={false}>
  <main><h1>حول المشروع</h1><p>معلومات عن المشروع.</p></main>
</Layout>
```

Override `canonical` when another URL represents the same content, such as a
print view pointing to its main article. `noindex` preserves the canonical link
and any manual image. Use `canonical={false}` or `image={false}` to omit them.
For a print view that should stay out of search results:

```astro
<Layout
  title="Print: Project guide"
  description="A printable project guide."
  canonical="guide/"
  noindex={true}
  image={false}
>
  <main><h1>Project guide</h1><p>Your printable content.</p></main>
</Layout>
```

`canonical="guide/"` resolves under the configured project root. Use
`noindex={false}` for the ordinary default. These props do not change a page's
HTTP status.

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
or description. An alt-only object supplies alt for an eligible automatic card;
it does not make an otherwise excluded page eligible.
Manual image URLs receive syntax validation without a download or dimension check.

When neither a manual nor an automatic image applies, the page keeps its HTML
title and description and emits no Open Graph or Twitter tags. Preview cards
then depend on the sharing service's fallback behavior. In development without
`site`, the layout omits canonical and social metadata, including absolute manual
images.

## Automatic title cards

Static pages using Layout get a local 1200×630 PNG during the production build
when you omit `image.src`. The card shows the title in Noto Sans on a neutral
background. Long titles wrap to five lines and end with an ellipsis; HTML and
Open Graph metadata retain the full title and description. `image.alt` stays
optional; the layout emits `og:image:alt` only for nonblank supplied text.

Use `image={false}` to disable a page's social block. A manual `image.src` bypasses
generation. Page-level `noindex={true}`, the supplied 404, redirects and pages
that bypass Layout do not generate cards. Development and on-demand pages do not
generate them either; manual social metadata still works when `site` is set.
Preview-wide `SITE_NOINDEX=true` keeps otherwise eligible automatic cards.

To disable automatic cards project-wide, set `socialImages: false` in
`src/config.ts`. Manual images, page metadata and crawlers keep working. The
build loads the renderer and font only when an eligible page needs a card.
Generation adds build work, build dependencies and a bundled font; visitors
receive PNGs without application JavaScript, CSS or a webfont. A generation
failure stops the build. Deploy output from successful builds.

Edit `src/lib/social-card.ts` to change the artwork. The bundled static Noto Sans
Regular 400 comes from the official NotoSans-v2.015 release. Its original
[SIL Open Font License](src/assets/social-fonts/OFL.txt) and provenance sit beside
the font in `src/assets/social-fonts/`. Keep the relevant license when replacing
it. Latin, Greek and Cyrillic samples are covered; the font does not cover all
Unicode. Unsupported glyphs fail with the page URL; use a tested font, a manual
image or `image={false}`. Automatic RTL card shaping is unverified and fails
generation. Use a manual image or `image={false}` for RTL pages; ordinary RTL
HTML remains available.

The registered integration reserves `base/_social/`, including when generation
is disabled. Keep consumer assets, routes and same-origin manual image URLs out
of that namespace. A collision fails the build and preserves consumer files.
Generated names hash the request pathname, so canonical aliases keep distinct
images. A title change keeps the image URL: configure host revalidation and
refresh sharing-service caches when needed. Avoid immutable caching for these
route-stable files. Full rebuilds remove old cards after route deletion,
disablement or a switch to a manual image.

### Remove automatic generation

1. Set `socialImages: false` in `src/config.ts` and keep that lightweight setting.
2. Remove the `socialImages` import and integration call from `astro.config.mjs`.
3. Delete `src/integrations/social-images.ts`, `src/lib/social-card.ts`,
   `src/lib/social-renderer.ts` and `src/assets/social-fonts/`.
4. Remove `tests/unit/social-images.test.ts` and `tests/build/social-images.test.ts`,
   which test the feature you removed.
5. Run `pnpm remove -D satori`. Keep `parse5` for indexing and Sharp for the
   output checks, which also use it to decode generated PNGs.
6. Run `pnpm verify` with your `site` configured. Manual images, sitemap and
   robots remain available. Removing the integration releases its reserved
   namespace.

## Preview noindex

Set `SITE_NOINDEX=true` when building a preview that search engines should not index:

```sh
SITE_NOINDEX=true pnpm build --site https://example.com
```

An unset value defaults to false. When set, use the exact string `true` or `false`;
empty values, whitespace, numeric values and other spellings fail validation.
Page props accept booleans: use `noindex={true}` or `noindex={false}`. A page cannot
override preview-wide noindex. Production canonical and manual-image URLs stay
the same. Eligible automatic cards remain enabled. A robots meta tag asks
crawlers not to index a page; it does not restrict access to its content.

## Sitemap and robots

The starter uses [Astro's official sitemap integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/).
Keep the integration order in `astro.config.mjs`: collect page policy, generate
automatic cards, generate the official sitemap, then verify crawler output.
The collected `sitemapPages` array supplies actual emitted URLs through
`customPages`, including `.html` URLs in file output mode. You do not maintain a
separate route list.

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

Add project styles and scripts with Astro's ordinary
[CSS](https://docs.astro.build/en/guides/styling/) and
[client-side script](https://docs.astro.build/en/guides/client-side-scripts/)
support; the output checks allow both. See the
[Astro documentation](https://docs.astro.build) for routing, components and
configuration.

## Starter assets

The starter includes a replaceable neutral C mark. The page declares only
`public/favicon.ico`, which contains one 48×48 PNG image. Replace this file to
change the browser icon.

The asset set also includes `logo.svg` with reduced-motion-aware animation, a
static `icon.svg`, `apple-touch-icon.png` at 180×180, and opaque, padded
`icon-192.png` and `icon-512.png`. These extra assets have no declarations in the
starter page; use them when adding your project's logo or installation metadata.

To replace the set, use [favcon](https://favcon.cevdet.ch), the favicon utility
by cevdetch. Generate the files from your own SVG and copy them into `public/`,
replacing the existing files with the same names:

```text
logo.svg
icon.svg
favicon.ico
apple-touch-icon.png
icon-192.png
icon-512.png
```

The filenames match favcon's output. Keep the existing ICO declaration for the
default page; add Apple and manifest links only if your project needs them, using
the optional installation recipe below. Generating the assets requires no
favcon dependency or integration in this starter.

The checked-in assets need no image-generation package or external checkout to
build. After replacing an icon, check browser and host caches. These unversioned
asset URLs need revalidation; avoid immutable caching for them.

## Verification and updates

`pnpm verify` runs `check`, `test`, `test:build`, `build`, `verify:output` and
`lint:html` in order, stopping on a failure. Configure `site` before running it.
For a one-off build origin or output override, run the build and output checks
as separate commands, alongside the type and test checks:

```sh
pnpm build --site https://example.com --base /project/ --outDir ./site-output/
pnpm verify:output
pnpm lint:html
```

The build records its actual origin, base, output directory and emitted pages in
`.astro/starter-build.json`. Both output commands read that receipt, so CLI
changes to `site`, `base` or `outDir` carry through without editing a script.
A missing or invalid receipt asks you to build first. These standalone commands
inspect the recorded output; they do not rebuild after source changes. Use
`pnpm verify` to validate a fresh build of your current source.

The output verifier checks Layout pages for complete required metadata,
canonical/social consistency and leaked internal markers. It decodes generated
PNGs and checks their route identity and dimensions, without downloading or
probing manual images. It also checks sitemap chunks and robots references
against the recorded selection. Pages that bypass Layout keep their own
metadata policy. Consumer CSS, JavaScript and fonts are allowed.

[deadhead](https://deadhead.cevdet.ch/install) audits HTML across the recorded
output directory, including copied public HTML. The wrapper uses the published
CLI's default rules and failure threshold, preserves its nonzero exit status,
and leaves files unchanged. It supplies no fixes, rule overrides or baseline.

[CI](.github/workflows/ci.yml) runs these checks on Node 24.8.0 and the latest
LTS using frozen pnpm installs and pinned Actions. Its build uses an explicit
`https://example.test` origin; the template's `site` remains yours to configure.
The workflow has read-only repository permissions and performs verification.

Update direct dependencies in reviewable changes and keep `packageManager` and
`pnpm-lock.yaml` consistent. Run `pnpm verify` after upgrades. Review pinned
Action updates and keep the Node engine requirement and CI matrix aligned.
For renderer or font changes, inspect short, long and multilingual cards;
recheck glyph coverage, PNG dimensions, output size and build cost. Preserve the
font's applicable license and update its provenance when replacing it.

## Optional installation metadata

To add a project name and icons for browsers that support installation, create
`src/pages/manifest.webmanifest.ts` in your project. Replace the example names:

```ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/`;
  const manifest = {
    name: 'Your project',
    short_name: 'Project',
    id: base,
    start_url: base,
    scope: base,
    display: 'standalone',
    icons: [
      { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
};
```

Astro [builds this endpoint into a static file](https://docs.astro.build/en/guides/endpoints/#static-file-endpoints).
`BASE_URL` keeps the start URL, scope and icon paths under `/` or your configured
subpath, such as `/project/`. Normalizing the final slash also handles
`trailingSlash: 'never'`. The `id` identifies the installed app; keep it stable
after deployment, even if you later change `start_url`. Use your own branding;
the supplied PNGs are 192×192 and 512×512 general-purpose icons.

Add this link beside the favicon in `src/layouts/Layout.astro`:

```astro
<link
  rel="manifest"
  href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/manifest.webmanifest`}
/>
```

For an Apple Home Screen icon, add the existing 180×180 PNG:

```astro
<link
  rel="apple-touch-icon"
  sizes="180x180"
  href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/apple-touch-icon.png`}
/>
```

If your project needs branded browser or launch-screen colors, choose its own
`theme_color` and `background_color` manifest values and an optional
`theme-color` meta tag in Layout. Keep those colors consistent with your UI.

Build and preview with your configured `site` and `base`. Check that the manifest
link and icons resolve, the start URL stays within scope, and your host serves
`.webmanifest` as `application/manifest+json`. Production installation requires
HTTPS; localhost and loopback addresses support local checks. Installation UI and
support vary by browser and platform; see the
[manifest installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
Offline behavior requires a separate implementation; this recipe adds metadata.

## Maintainer

Created and maintained by [Cevdet](https://cevdet.ch/)
([@cevdetch](https://github.com/cevdetch)).

## License

[MIT](LICENSE). Replace the starter assets with your own branding when needed.
