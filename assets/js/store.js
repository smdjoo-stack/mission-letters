// 로컬 설정과 임시저장 — PRD v2 §3.4
// 모두 이 브라우저에만 저장되며 GitHub 저장소에 올라가지 않는다.

const KEY = 'missionletter.settings.v1';
const DRAFT = id => `missionletter.draft.${id || 'new'}`;
const READER_PW = id => `missionletter.readerpw.${id}`;
const READER_PW_SHARED = 'missionletter.readerpw.__shared';

const DEFAULTS = {
  missionaryName: '김태주 선교사',
  repoOwner: 'smdjoo-stack',
  repoName: 'mission-letters',
  repoBranch: 'main',
  githubToken: '',
  defaultPassword: ''
};

function safeParse(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

export function getSettings() {
  return { ...DEFAULTS, ...safeParse(localStorage.getItem(KEY), {}) };
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearToken() {
  saveSettings({ githubToken: '' });
}

/** 발행 기능을 쓸 수 있는 상태인가 (= 작성자 모드) */
export function isConfigured() {
  const s = getSettings();
  return Boolean(s.repoOwner && s.repoName && s.githubToken);
}

/** 저장소 위치만 알면 읽기는 가능하다 (토큰 없이 공개 파일 읽기) */
export function hasRepo() {
  const s = getSettings();
  return Boolean(s.repoOwner && s.repoName);
}

// ── 임시저장 (작성 중 내용 보호 — PRD §7.2) ──────────────────────────

export function saveDraft(id, draft) {
  try {
    localStorage.setItem(DRAFT(id), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch { /* 용량 초과 등은 조용히 무시 — 발행 자체는 막지 않는다 */ }
}

export function loadDraft(id) {
  return safeParse(localStorage.getItem(DRAFT(id)), null);
}

export function clearDraft(id) {
  localStorage.removeItem(DRAFT(id));
}

// ── 열람자 비밀번호 기억 (P1-15) ────────────────────────────────────

export function rememberReaderPassword(id, password) {
  for (const store of [sessionStorage, localStorage]) {
    try {
      store.setItem(READER_PW(id), password);
      store.setItem(READER_PW_SHARED, password);   // 지난 편지도 같은 비밀번호면 바로 열린다
    } catch { /* noop */ }
  }
}

/** 이 편지 전용 비밀번호 → 없으면 마지막으로 통한 비밀번호 */
export function recallReaderPassword(id) {
  return sessionStorage.getItem(READER_PW(id))
      || localStorage.getItem(READER_PW(id))
      || sessionStorage.getItem(READER_PW_SHARED)
      || localStorage.getItem(READER_PW_SHARED)
      || '';
}

export function forgetReaderPassword(id) {
  sessionStorage.removeItem(READER_PW(id));
  localStorage.removeItem(READER_PW(id));
}
