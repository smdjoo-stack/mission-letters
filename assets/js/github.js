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

async function request(path, { method = 'GET', body, token, raw } = {}) {
  const s = getSettings();
  const auth = token ?? s.githubToken;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
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

function statusCode(status) {
  if (status === 401) return 'BAD_TOKEN';
  if (status === 403) return 'FORBIDDEN';
  if (status === 409 || status === 422) return 'CONFLICT';
  return 'HTTP_' + status;
}

function describeError(status, message) {
  switch (status) {
    case 401: return '토큰이 유효하지 않습니다. 설정에서 토큰을 다시 발급해 입력해 주세요.';
    case 403: return '권한이 없습니다. 토큰에 이 저장소의 Contents 쓰기 권한이 있는지 확인해 주세요.';
    case 409:
    case 422: return '다른 곳에서 먼저 변경되었습니다. 다시 시도해 주세요.';
    default:  return `GitHub 오류 (${status})${message ? ': ' + message : ''}`;
  }
}

/** 연결 테스트 — 저장소 접근과 쓰기 권한을 확인한다. */
export async function testConnection({ repoOwner, repoName, githubToken }) {
  const res = await fetch(`${API}/repos/${repoOwner}/${repoName}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${githubToken}`
    }
  });
  if (res.status === 404) {
    throw new GitHubError('저장소를 찾을 수 없습니다. 소유자와 저장소 이름, 그리고 토큰 권한 범위를 확인해 주세요.', 404, 'NO_REPO');
  }
  if (res.status === 401) {
    throw new GitHubError('토큰이 유효하지 않습니다.', 401, 'BAD_TOKEN');
  }
  if (!res.ok) {
    throw new GitHubError(describeError(res.status), res.status, statusCode(res.status));
  }
  const repo = await res.json();
  if (!repo.permissions?.push) {
    throw new GitHubError('이 토큰에는 쓰기 권한이 없습니다. Contents: Read and write 로 발급해 주세요.', 403, 'NO_WRITE');
  }
  return { private: repo.private, defaultBranch: repo.default_branch, fullName: repo.full_name };
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
