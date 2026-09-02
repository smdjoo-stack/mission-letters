#!/usr/bin/env node
// index.html 의 app.css?v=... 를 파일 내용 해시로 바꾼다.
// 내용이 바뀌었을 때만 값이 달라지므로, 손으로 번호를 올릴 일이 없다.
//
//   node scripts/bump-assets.mjs
//
// 커밋 전에 한 번 돌리면 된다. 바뀐 게 없으면 아무것도 하지 않는다.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const INDEX = path.join(ROOT, 'index.html');
const CSS = 'assets/css/app.css';

const css = await readFile(path.join(ROOT, CSS));
const hash = createHash('sha256').update(css).digest('hex').slice(0, 8);

const html = await readFile(INDEX, 'utf8');
const pattern = new RegExp(`(${CSS.replace(/[/.]/g, '\\$&')})\\?v=[^"']*`);

if (!pattern.test(html)) {
  console.error(`index.html 에서 ${CSS}?v=... 를 찾지 못했습니다.`);
  process.exit(1);
}

const next = html.replace(pattern, `$1?v=${hash}`);
if (next === html) {
  console.log(`이미 최신입니다 (v=${hash}).`);
  process.exit(0);
}

await writeFile(INDEX, next, 'utf8');
console.log(`app.css?v=${hash} 로 갱신했습니다.`);
