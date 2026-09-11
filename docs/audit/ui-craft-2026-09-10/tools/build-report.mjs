import path from 'node:path';
import os from 'node:os';
// Output root for screenshots/metrics. Override with AUDIT_OUT=/some/dir.
const OUTDIR = process.env.AUDIT_OUT ?? path.join(os.tmpdir(), 'dungeon-hub-ui-audit');
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = OUTDIR;
let html = readFileSync(path.join(import.meta.dirname, 'report.tpl.html'), 'utf8');
const missing = [];
html = html.replace(/\{\{img:([^}]+)\}\}/g, (_, f) => {
  try {
    const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${readFileSync(`${ROOT}/evidence/${f}`).toString('base64')}`;
  } catch { missing.push(f); return ''; }
});
writeFileSync(`${ROOT}/craft-audit.html`, html);
console.log('bytes:', html.length, 'missing:', missing);
