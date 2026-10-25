import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

export interface BuildReceipt {
  version: 1;
  site: string;
  base: string;
  outDir: string;
  format: 'directory' | 'file' | 'preserve';
  pages: readonly { file: string; url: string; owned: boolean }[];
  sitemapUrls: readonly string[];
}

const location = (root: URL) => new URL('.astro/starter-build.json', root);

export async function clearBuildReceipt(root: URL): Promise<void> {
  await rm(location(root), { force: true });
}

export async function writeBuildReceipt(root: URL, receipt: BuildReceipt): Promise<void> {
  await mkdir(new URL('.astro/', root), { recursive: true });
  await writeFile(location(root), `${JSON.stringify(receipt, null, 2)}\n`);
}

export async function readBuildReceipt(root: URL): Promise<BuildReceipt> {
  return JSON.parse(await readFile(location(root), 'utf8')) as BuildReceipt;
}
