// Regenerates the offline BASELINE_RISKS literal in public/index.html from seed.mjs,
// so the baseline data has exactly one source of truth. Run after editing seed.mjs:
//   node db-app/tools/sync-baseline.mjs
import { SEED_RISKS } from '../seed.mjs';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const file = join(dirname(fileURLToPath(import.meta.url)), '../public/index.html');
const html = fs.readFileSync(file, 'utf8');
const re = /\/\* BASELINE:BEGIN[\s\S]*?\/\* BASELINE:END \*\//;
if(!re.test(html)){ console.error('BASELINE markers not found'); process.exit(1); }
const block = '/* BASELINE:BEGIN generated from seed.mjs; regenerate with: node db-app/tools/sync-baseline.mjs */\n'
  + 'const BASELINE_RISKS = ' + JSON.stringify(SEED_RISKS) + ';\n/* BASELINE:END */';
fs.writeFileSync(file, html.replace(re, block));
console.log('baseline synced:', SEED_RISKS.length, 'risks');
