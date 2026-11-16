#!/usr/bin/env node
/**
 * Bundle WebDesk into ONE self-contained index.html (CSS + locales + i18n + app inlined).
 * The single file can be opened via file://, uploaded to the Library as a Page, or
 * deployed to any static host. Source of truth stays in the multi-file tree.
 * Usage: node tools/build-single.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const r = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = r('index.html');
const css = r('assets/css/style.css');
const locales = r('assets/js/locales.generated.js');
const i18n = r('assets/js/i18n.js');
const app = r('assets/js/app.js');

html = html.replace('<link rel="stylesheet" href="assets/css/style.css">', '<style>\n' + css + '\n</style>');
html = html.replace(
  /<script src="assets\/js\/locales\.generated\.js"><\/script>\s*<script src="assets\/js\/i18n\.js"><\/script>\s*<script src="assets\/js\/app\.js"><\/script>/,
  '<script>\n' + locales + '\n' + i18n + '\n' + app + '\n</script>'
);
if (html.includes('assets/js/') || html.includes('assets/css/')) {
  console.error('Bundling failed: external asset reference remains');
  process.exit(1);
}
const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'index.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Bundled -> dist/index.html', (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB');
