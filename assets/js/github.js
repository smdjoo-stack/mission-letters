// GitHub Contents API — PRD v2 §6.1 (앱 내 발행)
// 선교사가 git 명령을 쓰지 않도록, 앱이 직접 저장소에 커밋한다.

import { getSettings } from './store.js';
import { utf8ToBase64, base64ToUtf8 } from './crypto.js';
import { siteUrl } from './util.js';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function repoConfig() {
  const s = getSettings();
  if (!s.repoOwner || !s.repoName) {
    throw new GitHubError('저장소가 설정되지 않았습니다. 설정 화면에서 먼저 연결해 주세요.', 0, 'NO_REPO');
  }
  return s;
}

async function request(path, { method = 'GET', body, raw } = {}) {
  // 토큰을 쓰지 않는다 — 공개 저장소 읽기만 가능하고, 쓰기는 writeBlocked() 에서 막힌다.
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new GitHubError(describeError(res.status, detail.message), res.status, statusCode(res.status));
  }
  return raw ? res : res.json();
}

/** 브라우저에서의 쓰기는 지원하지 않는다 — scripts/publish-letter.mjs 로 발행한다. */
export function writeBlocked() {
  return new GitHubError(
    '브라우저에서 바로 발행하는 기능은 꺼져 있습니다. ' +
    '저장소에서 scripts/publish-letter.mjs 로 발행해 주세요.',
    0, 'WRITE_DISABLED');
}

function statusCode(status) {
  if (status === 401) return 'BAD_TOKEN';
  if (status === 403) return 'FORBIDDEN';
  if (status === 409 || status === 422) return 'CONFLICT';
  return 'HTTP_' + status;
}

function describeError(status, message) {
  switch (status) {
    case 401:
    case 403: return '저장소에 접근할 권한이 없습니다. 저장소가 공개인지 확인해 주세요.';
    case 409:
    case 422: return '다른 곳에서 먼저 변경되었습니다. 다시 시도해 주세요.';
    default:  return `GitHub 오류 (${status})${message ? ': ' + message : ''}`;
  }
}

/** 파일 읽기 → { data, sha } | null(없음) */
export async function getFile(path) {
  const s = repoConfig();
  const result = await request(
    `/repos/${s.repoOwner}/${s.repoName}/contents/${path}?ref=${encodeURIComponent(s.repoBranch || 'main')}`
  );
  if (!result) return null;
  return { data: JSON.parse(base64ToUtf8(result.content)), sha: result.sha };
}

/** 파일 쓰기(생성 또는 수정). sha 를 주면 수정, 없으면 생성. */
export async function putFile(path, data, { sha, message }) {
  throw writeBlocked();
  /* eslint-disable no-unreachable */
  const s = repoConfig();
  const result = await request(`/repos/${s.repoOwner}/${s.repoName}/contents/${path}`, {
    method: 'PUT',
    body: {
      message: message || `편지 업데이트: ${path}`,
      content: utf8ToBase64(JSON.stringify(data, null, 2)),
      branch: s.repoBranch || 'main',
      ...(sha ? { sha } : {})
    }
  });
  return result.content.sha;
}

export async function deleteFile(path, { sha, message }) {
  throw writeBlocked();
  /* eslint-disable no-unreachable */
  const s = repoConfig();
  await request(`/repos/${s.repoOwner}/${s.repoName}/contents/${path}`, {
    method: 'DELETE',
    body: { message: message || `편지 삭제: ${path}`, sha, branch: s.repoBranch || 'main' }
  });
}

// ── 공개 읽기 (토큰 없이) ────────────────────────────────────────────
// 후원자는 토큰이 없다. Pages 로 배포된 정적 파일을 그대로 읽는다.

export async function fetchPublicJSON(path) {
  const res = await fetch(siteUrl(path) + `?t=${Date.now()}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`파일을 불러오지 못했습니다 (${res.status})`);
  return res.json();
}

/** 후원자에게 보낼 공유 링크 */
export function shareLink(id) {
  return siteUrl(`#/letter/${id}`);
}
