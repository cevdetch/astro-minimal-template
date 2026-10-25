import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readBuildReceipt } from '../src/integrations/receipt.ts';

if (import.meta.main) {
  try {
    const receipt = await readBuildReceipt(pathToFileURL(`${process.cwd()}/`));
    const manifestUrl = new URL(import.meta.resolve('deadhead/package.json'));
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8')) as { bin: { deadhead: string } };
    const bin = fileURLToPath(new URL(manifest.bin.deadhead, manifestUrl));
    process.exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, [bin, fileURLToPath(receipt.outDir)], { stdio: 'inherit' });
      child.once('error', reject);
      child.once('close', (code, signal) => {
        if (signal) { console.error(`Deadhead terminated with ${signal}.`); resolve(1); }
        else resolve(code ?? 1);
      });
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
