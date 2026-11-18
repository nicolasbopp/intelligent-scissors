import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'canvas/index': 'src/canvas/index.ts',
        'mask/index': 'src/mask/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    splitting: true,
    target: 'es2020',
});
