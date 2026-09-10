// Contact-sheet builder: tiles screenshots into one PNG via a throwaway HTML page.
// usage: node sheet.mjs <mode> <out.png> <tileWidthCss> <perRow> <file1> <file2> ...
import path from 'node:path';
import os from 'node:os';
// Output root for screenshots/metrics. Override with AUDIT_OUT=/some/dir.
const OUTDIR = process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'dungeon-hub-ui-audit');
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(path.resolve(import.meta.dirname, '../../../../apps/web/package.json'));
const { chromium } = require('@playwright/test');
const [, , mode, out, tw, perRow, ...files] = process.argv;
const dir = `${OUTDIR}/shots/${mode}`;
const tile = (f) => {
  const b64 = readFileSync(`${dir}/${f}`).toString('base64');
  return `<figure style="margin:0"><figcaption style="padding:2px 4px;background:#000">${f}</figcaption><img src="data:image/png;base64,${b64}" style="width:${tw}px;display:block"></figure>`;
};
const html = `<body style="margin:0;background:#444;display:grid;grid-template-columns:repeat(${perRow},${tw}px);gap:12px;padding:12px;width:max-content;font:12px sans-serif;color:#fff">${files.map(tile).join('')}</body>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 100, height: 100 }, deviceScaleFactor: 1 });
await p.setContent(html);
await p.waitForTimeout(500);
await p.locator('body').screenshot({ path: out });
await b.close();
console.log('sheet →', out);
