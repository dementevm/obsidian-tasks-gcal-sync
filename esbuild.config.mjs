import { builtinModules } from 'node:module';
import process from 'node:process';
import esbuild from 'esbuild';

const production = process.argv[2] === 'production';

const context = await esbuild.context({
    entryPoints: ['src/core/main.ts'],
    bundle: true,
    format: 'cjs',
    target: 'es2021',
    platform: 'browser',
    outfile: 'main.js',
    sourcemap: production ? false : 'inline',
    minify: production,
    treeShaking: true,
    logLevel: 'info',
    banner: {
        js: '/* Bundled with esbuild. Source: https://github.com/dementevm/obsidian-tasks-gcal-sync */',
    },
    external: [
        'obsidian',
        'electron',
        '@codemirror/autocomplete',
        '@codemirror/collab',
        '@codemirror/commands',
        '@codemirror/language',
        '@codemirror/lint',
        '@codemirror/search',
        '@codemirror/state',
        '@codemirror/view',
        '@lezer/common',
        '@lezer/highlight',
        '@lezer/lr',
        ...builtinModules,
    ],
});

if (production) {
    await context.rebuild();
    await context.dispose();
} else {
    await context.watch();
}
