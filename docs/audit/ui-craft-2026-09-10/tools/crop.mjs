// Crop/scale screenshots into JPEG evidence tiles via a canvas in headless Chromium.
// spec lines: mode|file|x|y|w|h|out|scale   (x,y,w,h in source image px; scale = output multiplier)
import path from 'node:path';
import os from 'node:os';
// Output root for screenshots/metrics. Override with AUDIT_OUT=/some/dir.
const OUTDIR = process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'dungeon-hub-ui-audit');
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(path.resolve(import.meta.dirname, '../../../../apps/web/package.json'));
const { chromium } = require('@playwright/test');
const ROOT = OUTDIR;
mkdirSync(`${ROOT}/evidence`, { recursive: true });
const specs = readFileSync(path.join(import.meta.dirname, 'crops.txt'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
const b = await chromium.launch();
const p = await b.newPage();
for (const line of specs) {
  const [mode, file, x, y, w, h, out, scale = '1'] = line.split('|').map((s) => s.trim());
  const b64 = readFileSync(`${ROOT}/shots/${mode}/${file}`).toString('base64');
  const data = await p.evaluate(async ({ b64, x, y, w, h, scale }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const W = w === 'full' ? img.width : +w, H = h === 'full' ? img.height : +h;
    const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, +x, +y, W, H, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  }, { b64, x, y, w, h, scale: +scale });
  writeFileSync(`${ROOT}/evidence/${out}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('crop →', out);
}
await b.close();
