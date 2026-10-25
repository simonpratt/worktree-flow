// Bundles the CLI into dist/ so startup reads a few files instead of resolving ~165 modules.
// Dynamic imports (e.g. @clack/prompts) are split into chunks that only load when used.
import fs from 'node:fs';
import { build } from 'esbuild';

fs.rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/cli.ts'],
  outdir: 'dist',
  bundle: true,
  splitting: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Bundled CommonJS deps (commander) call require() for node builtins, which ESM lacks
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'warning',
});
