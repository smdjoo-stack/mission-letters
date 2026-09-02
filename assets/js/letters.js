// 편지 데이터 계층 — PRD v2 §3 데이터 모델 + §6.1 발행 절차

import { getFile, putFile, deleteFile, fetchPublicJSON } from './github.js';
import { encryptBody, decryptBody } from './crypto.js';
import { todayISODate } from './util.js';

export const SCHEMA_VERSION = 1;
const INDEX_PATH = 'letters/index.json';
const letterPath = id => `letters/${id}.json`;

export function emptyBody(missionaryName = '') {
  return {
    title: '',
    authorName: missionaryName,
    period: '',
    orgName: '',
    logo: '',
    portrait: '',
    hero: '',                                      // 머리글 사진 (드라이브 링크 또는 저장소 경로)
    heroSize: 'normal',                            // short | normal | tall
    greeting: '사랑하는 후원자님께',
    blocks: [{ type: 'text', value: '' }],
    closing: '',
    prayers: [],                                   // [{ title, text }]
    support: { note: '', bank: '', account: '', holder: '' }
  };
}

/** 목록 읽기 — 토큰을 쓰지 않으므로 배포된 파일을 그대로 읽는다(캐시 무효화 포함). */
export async function loadIndex() {
  const data = await fetchPublicJSON(INDEX_PATH);
  return { index: data ?? { schemaVersion: SCHEMA_VERSION, letters: [] }, sha: undefined };
}

/** 편지 파일(암호문 상태) 읽기 */
export async function loadLetterFile(id, { preferApi = false } = {}) {
  if (preferApi) {
    const file = await getFile(letterPath(id));
    return file ? { file: file.data, sha: file.sha } : null;
  }
  const data = await fetchPublicJSON(letterPath(id));
  return data ? { file: data, sha: undefined } : null;
}

/** 편지 열기 = 읽기 + 복호화 */
export async function openLetter(id, password, options) {
  const found = await loadLetterFile(id, options);
  if (!found) return null;
  const body = await decryptBody(found.file, password);
  return { meta: found.file, body, sha: found.sha };
}

/**
 * 발행 — PRD §6.1
 * 1) 본문 암호화 → 2) letters/{id}.json 커밋 → 3) index.json 갱신 커밋
 * 각 단계는 실패해도 작성 내용을 잃지 않도록 호출 측에서 임시저장을 유지한다.
 */
export async function publishLetter({ id, body, password, hint, publishedAt }) {
  const encrypted = await encryptBody(body, password);
  const now = new Date().toISOString();

  const existing = await loadLetterFile(id, { preferApi: true });
  const published = publishedAt || existing?.file?.publishedAt || todayISODate();

  const letterFile = {
    schemaVersion: SCHEMA_VERSION,
    id,
    publishedAt: published,
    updatedAt: now,
    crypto: encrypted.crypto,
    ...(hint ? { hint } : {}),
    ciphertext: encrypted.ciphertext
  };

  await putFile(letterPath(id), letterFile, {
    sha: existing?.sha,
    message: `${existing ? '편지 수정' : '편지 발행'}: ${id}`
  });

  await upsertIndexEntry({ id, publishedAt: published, updatedAt: now });
  return letterFile;
}

/** index.json 항목 추가/갱신 — 충돌(409/422) 시 최신본을 다시 읽어 1회 재시도한다. */
async function upsertIndexEntry(entry, attempt = 0) {
  const file = await getFile(INDEX_PATH);
  const index = file?.data ?? { schemaVersion: SCHEMA_VERSION, letters: [] };
  const letters = (index.letters || []).filter(item => item.id !== entry.id);
  letters.push(entry);
  letters.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)) || String(b.id).localeCompare(String(a.id)));

  try {
    await putFile(INDEX_PATH, { schemaVersion: SCHEMA_VERSION, letters }, {
      sha: file?.sha,
      message: `편지 목록 갱신: ${entry.id}`
    });
  } catch (err) {
    if (err.code === 'CONFLICT' && attempt < 1) return upsertIndexEntry(entry, attempt + 1);
    throw err;
  }
}

/** 삭제 (P1-11) — 편지 파일과 목록 항목을 함께 지운다. */
export async function removeLetter(id) {
  const found = await getFile(letterPath(id));
  if (found) await deleteFile(letterPath(id), { sha: found.sha, message: `편지 삭제: ${id}` });

  const file = await getFile(INDEX_PATH);
  if (file) {
    const letters = (file.data.letters || []).filter(item => item.id !== id);
    await putFile(INDEX_PATH, { schemaVersion: SCHEMA_VERSION, letters }, {
      sha: file.sha,
      message: `편지 목록 갱신(삭제): ${id}`
    });
  }
}

/** 본문에 들어 있는 사진 수 */
export function countPhotos(body) {
  const inBody = (body?.blocks || []).filter(b => b.type === 'image' && b.driveId).length;
  return inBody + (String(body?.hero || '').trim() ? 1 : 0);
}
