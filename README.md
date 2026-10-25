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
| `pnpm build` | Build the static site into `dist/` |
| `pnpm preview` | Preview the production build |
| `pnpm astro --help` | Read Astro CLI help |

Run `pnpm check` and `pnpm build` before committing changes. Astro's build command
does not run the type checker.

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
