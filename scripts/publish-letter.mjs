#!/usr/bin/env node
// 브라우저 없이 편지를 암호화해서 letters/ 에 직접 발행하는 도구.
// assets/js/crypto.js 의 PBKDF2-SHA256(210,000회) + AES-256-GCM 방식을 그대로 재현한다.
//
// 암호화해서 letters/ 에 쓰고, 이어서 커밋·푸시까지 한다 — 명령 한 줄로 발행이 끝난다.
//
// 사용법:
//   node scripts/publish-letter.mjs <편지-내용.json>
//   node scripts/publish-letter.mjs <편지-내용.json> --no-push    # 파일만 쓰고 멈춘다
//
// 입력 JSON 형식:
// {
//   "id": "2026-11",
//   "password": "########",
//   "hint": "선택",
//   "publishedAt": "2026-11-01",   // 생략하면 오늘 날짜(또는 기존 값 유지)
//   "body": {
//     "title": "...",
//     "authorName": "김태주 선교사",
//     "period": "2026년 11월",
//     "greeting": "사랑하는 후원자님께",
//     "blocks": [
//       { "type": "text", "value": "..." },
//       { "type": "image", "driveId": "구글드라이브파일ID", "caption": "선택" }
//     ],
//     "closing": "...",
//     "prayers": [ { "title": "기도제목", "text": "내용" } ],
//     "support": { "note": "안내 문구", "bank": "국민은행", "account": "000-00-000000", "holder": "홍길동" }
//   }
// }

import { randomBytes, pbkdf2Sync, createCipheriv } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LETTERS_DIR = path.join(ROOT, 'letters');
const INDEX_PATH = path.join(LETTERS_DIR, 'index.json');
const SCHEMA_VERSION = 1;
const KDF_ITERATIONS = 210000;

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

async function readJSON(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function encryptBody(body, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, KDF_ITERATIONS, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(body), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // WebCrypto의 AES-GCM 출력은 암호문 뒤에 인증 태그(16바이트)가 붙은 형태다 — 그대로 맞춘다.
  const ciphertext = Buffer.concat([encrypted, authTag]);

  return {
    crypto: {
      alg: 'AES-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: KDF_ITERATIONS,
      salt: salt.toString('base64'),
      iv: iv.toString('base64')
    },
    ciphertext: ciphertext.toString('base64')
  };
}

function upsertIndexEntry(index, entry) {
  const letters = (index.letters || []).filter(item => item.id !== entry.id);
  letters.push(entry);
  letters.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)) || String(b.id).localeCompare(String(a.id)));
  return { schemaVersion: SCHEMA_VERSION, letters };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('사용법: node scripts/publish-letter.mjs <편지-내용.json>');
    process.exit(1);
  }

  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const { id, password, hint, publishedAt, body } = input;

  if (!id || !password || !body) {
    console.error('id, password, body 는 필수입니다.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('비밀번호는 8자 이상이어야 합니다.');
    process.exit(1);
  }

  const letterPath = path.join(LETTERS_DIR, `${id}.json`);
  const existing = await readJSON(letterPath, null);
  const published = publishedAt || existing?.publishedAt || todayISODate();
  const now = new Date().toISOString();

  const encrypted = encryptBody(body, password);
  const letterFile = {
    schemaVersion: SCHEMA_VERSION,
    id,
    publishedAt: published,
    updatedAt: now,
    crypto: encrypted.crypto,
    ...(hint ? { hint } : {}),
    ciphertext: encrypted.ciphertext
  };

  await writeFile(letterPath, JSON.stringify(letterFile, null, 2) + '\n', 'utf8');

  const index = await readJSON(INDEX_PATH, { schemaVersion: SCHEMA_VERSION, letters: [] });
  const nextIndex = upsertIndexEntry(index, { id, publishedAt: published, updatedAt: now });
  await writeFile(INDEX_PATH, JSON.stringify(nextIndex, null, 2) + '\n', 'utf8');

  console.log(`암호화 완료: letters/${id}.json`);

  if (process.argv.includes('--no-push')) {
    console.log('--no-push 라서 여기서 멈춥니다. 직접 커밋·푸시해 주세요.');
    return;
  }

  publish(id, Boolean(existing));
}

/** letters/ 만 커밋해서 푸시한다 — 작업 중이던 다른 파일은 건드리지 않는다. */
function publish(id, isUpdate) {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

  try {
    git('rev-parse', '--is-inside-work-tree');
  } catch {
    console.error('git 저장소가 아닙니다. 파일만 써 두었으니 직접 올려 주세요.');
    return;
  }

  // 방금 쓴 두 파일만 담는다. letters/ 를 통째로 담으면 그 안에 실수로 둔
  // 배포 파일(비밀번호가 평문으로 들어 있다) 까지 공개 저장소로 올라간다.
  git('add', '--', `letters/${id}.json`, 'letters/index.json');
  const staged = git('diff', '--cached', '--name-only').trim();
  if (!staged) {
    console.log('바뀐 내용이 없습니다. 이미 같은 내용으로 발행돼 있습니다.');
    return;
  }

  git('commit', '-m', `${isUpdate ? '편지 수정' : '편지 발행'}: ${id}`);
  console.log(`커밋: ${staged.split('\n').join(', ')}`);

  try {
    git('push');
  } catch (err) {
    console.error('푸시하지 못했습니다. 커밋은 남아 있으니 `git push` 만 다시 해 주세요.');
    console.error(String(err.stderr || err.message).trim());
    process.exit(1);
  }

  console.log('푸시 완료 — GitHub Pages 반영에 최대 1분이 걸릴 수 있습니다.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
