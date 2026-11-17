import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

// Dev server and static build of the demo page (deployed to GitHub Pages).
export default defineConfig({
    root: 'demo',
    base: './',
    resolve: {
        alias: [
            { find: /^intelligent-scissors\/canvas$/, replacement: src('canvas/index.ts') },
            { find: /^intelligent-scissors$/, replacement: src('index.ts') },
        ],
    },
    build: {
        outDir: '../demo-dist',
        emptyOutDir: true,
    },
});
