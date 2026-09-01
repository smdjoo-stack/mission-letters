#!/usr/bin/env node
// 브라우저 없이 편지를 암호화해서 letters/ 에 직접 발행하는 도구.
// assets/js/crypto.js 의 PBKDF2-SHA256(210,000회) + AES-256-GCM 방식을 그대로 재현한다.
//
// 사용법:
//   node scripts/publish-letter.mjs <편지-내용.json>
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
//     "closing": "..."
//   }
// }

import { randomBytes, pbkdf2Sync, createCipheriv } from 'node:crypto';
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

  console.log(`발행 완료: letters/${id}.json`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
