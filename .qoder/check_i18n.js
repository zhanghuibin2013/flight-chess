const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../web/src/i18n.ts'), 'utf8');

function extractDict(name) {
  const re = new RegExp('const ' + name + ': Dict = \\{([\\s\\S]*?)^\\};', 'm');
  const m = src.match(re);
  if (!m) return new Set();
  const body = m[1];
  const keyRe = /['"]([\w][\w.]+)['"]\s*:/g;
  const keys = new Set();
  let k;
  while ((k = keyRe.exec(body))) keys.add(k[1]);
  return keys;
}

const zh = extractDict('ZH');
const en = extractDict('EN');
console.log('ZH count:', zh.size, 'EN count:', en.size);
const inZhNotEn = [...zh].filter(k => !en.has(k));
const inEnNotZh = [...en].filter(k => !zh.has(k));
console.log('In ZH but not EN:', inZhNotEn);
console.log('In EN but not ZH:', inEnNotZh);

const dir = path.join(__dirname, '../web/src');
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d)) {
    const p = path.join(d, e);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e)) files.push(p);
  }
}
walk(dir);

const usedKeys = new Set();
const dynamicPatterns = new Set();
for (const f of files) {
  if (f.endsWith('i18n.ts')) continue;
  const text = fs.readFileSync(f, 'utf8');
  const re1 = /\bt\(\s*['"`]([\w.]+)['"`]/g;
  let m;
  while ((m = re1.exec(text))) usedKeys.add(m[1]);
  const re2 = /\btranslate\(\s*\w+\s*,\s*['"`]([\w.]+)['"`]/g;
  while ((m = re2.exec(text))) usedKeys.add(m[1]);
  const re3 = /\bt\(\s*`([^`]+)`\s*\)/g;
  while ((m = re3.exec(text))) dynamicPatterns.add(m[1]);
}

console.log('\nUsed keys NOT in ZH:', [...usedKeys].filter(k => !zh.has(k)));
console.log('Used keys NOT in EN:', [...usedKeys].filter(k => !en.has(k)));
console.log('\nDynamic template patterns:', [...dynamicPatterns]);

// Also scan server/src for descriptionKey values used
const sDir = path.join(__dirname, '../server/src');
function walk2(d) { for (const e of fs.readdirSync(d)) { const p = path.join(d, e); const st = fs.statSync(p); if (st.isDirectory()) walk2(p); else if (/\.ts$/.test(e)) sFiles.push(p); } }
const sFiles = [];
walk2(sDir);
const serverKeys = new Set();
for (const f of sFiles) {
  const text = fs.readFileSync(f, 'utf8');
  const re = /(?:descriptionKey|logI18n)\s*[:(]\s*['"`]([\w.]+)['"`]/g;
  let m;
  while ((m = re.exec(text))) serverKeys.add(m[1]);
  const re2 = /['"`]([\w][\w.]+)['"`]\s*\)\s*;\s*\/\//g; // skip
  // Also look for pattern: descriptionKey: x ? 'a' : 'b'
  const reTern = /descriptionKey[^,;]*\?\s*['"`]([\w.]+)['"`]\s*:\s*['"`]([\w.]+)['"`]/g;
  while ((m = reTern.exec(text))) { serverKeys.add(m[1]); serverKeys.add(m[2]); }
}
console.log('\nServer keys:', [...serverKeys].sort());
console.log('\nServer keys NOT in ZH:', [...serverKeys].filter(k => !zh.has(k)));
console.log('Server keys NOT in EN:', [...serverKeys].filter(k => !en.has(k)));
