#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function findCssFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.css')).map(f => path.join(dir, f));
}

function main() {
  const cssDir = path.join(process.cwd(), '.next', 'static', 'css');
  const targetDir = path.join(cssDir, 'app');
  ensureDir(cssDir);

  const cssFiles = findCssFiles(cssDir).filter(p => !p.includes(path.join('css', 'app')));
  if (cssFiles.length === 0) {
    console.warn('[fix-next-css-path] No CSS files found under .next/static/css — skipping');
    return;
  }

  // Choose the largest CSS file as the likely 'app' css bundle
  cssFiles.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  const chosen = cssFiles[0];
  ensureDir(targetDir);

  const dest = path.join(targetDir, 'layout.css');
  try {
    fs.copyFileSync(chosen, dest);
    console.log(`[fix-next-css-path] Copied ${path.basename(chosen)} → .next/static/css/app/layout.css`);
  } catch (e) {
    console.error('[fix-next-css-path] Error copying css file:', e);
  }
}

main();
