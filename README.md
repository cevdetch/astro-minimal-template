# Astro Minimal Template

A minimal Astro starter with strictest TypeScript and replaceable neutral assets.
Start with `src/pages/index.astro` and add pages as your project grows.

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
| `pnpm test` | Test URL resolution and configuration rules |
| `pnpm test:build` | Test production validation with real Astro builds |
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
  integrations: [siteValidation()],
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

`parseSiteNoindex` accepts an unset value as false, or the exact strings `true`
and `false`. It rejects empty values, whitespace, numeric values and other
spellings. This parser does not add robots metadata to the current page.

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
