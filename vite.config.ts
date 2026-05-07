import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: 'dist',
  },
});
