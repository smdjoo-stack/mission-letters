// 설정 화면 — PRD v2 §7.4
import { $, esc, toast } from '../util.js';
import { getSettings, saveSettings } from '../store.js';
import { testConnection } from '../github.js';
import { navigate } from '../router.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export function renderSettings(root) {
  const s = getSettings();
  root.innerHTML = `
    <div class="page page--narrow">
      <h1 class="page__title">설정</h1>
      <p class="page__lead">아래 정보는 <strong>이 브라우저에만</strong> 저장됩니다. GitHub 저장소에는 올라가지 않습니다.</p>

      <form id="settings-form" class="form">
        <section class="card">
          <h2 class="card__title">1. 선교사 정보</h2>
          <label class="field">
            <span class="field__label">이름</span>
            <input name="missionaryName" type="text" value="${esc(s.missionaryName)}" placeholder="홍길동 선교사" autocomplete="name">
            <span class="field__hint">편지 머리말에 표시됩니다.</span>
          </label>
        </section>

        <section class="card">
          <h2 class="card__title">2. GitHub 저장소</h2>
          <p class="card__lead">편지가 저장되고 후원자에게 공유될 곳입니다.</p>
          <div class="field-row">
            <label class="field">
              <span class="field__label">소유자(계정명)</span>
              <input name="repoOwner" type="text" value="${esc(s.repoOwner)}" placeholder="myaccount" autocapitalize="none" autocorrect="off" spellcheck="false">
            </label>
            <label class="field">
              <span class="field__label">저장소 이름</span>
              <input name="repoName" type="text" value="${esc(s.repoName)}" placeholder="letters" autocapitalize="none" autocorrect="off" spellcheck="false">
            </label>
          </div>
          <label class="field field--short">
            <span class="field__label">브랜치</span>
            <input name="repoBranch" type="text" value="${esc(s.repoBranch || 'main')}" placeholder="main" autocapitalize="none" spellcheck="false">
          </label>
        </section>

        <section class="card">
          <h2 class="card__title">3. GitHub 토큰</h2>
          <p class="card__lead">
            앱이 편지를 대신 저장하려면 토큰이 필요합니다.
            <a href="${TOKEN_URL}" target="_blank" rel="noopener noreferrer">토큰 발급 화면 열기 ↗</a>
          </p>
          <ol class="steps">
            <li>Token name — 아무 이름 (예: <code>선교편지</code>)</li>
            <li>Repository access — <strong>Only select repositories</strong> → 위에서 적은 저장소 하나만 선택</li>
            <li>Permissions → Repository permissions → <strong>Contents</strong> 를 <strong>Read and write</strong> 로</li>
            <li>Generate token 후 나온 <code>github_pat_…</code> 값을 아래에 붙여넣기</li>
          </ol>
          <label class="field">
            <span class="field__label">토큰</span>
            <input name="githubToken" type="password" value="${esc(s.githubToken)}" placeholder="github_pat_..." autocomplete="off" autocapitalize="none" spellcheck="false">
            <span class="field__hint">
              <label class="inline-check"><input type="checkbox" id="show-token"> 입력한 토큰 보기</label>
            </span>
          </label>
          <div class="callout callout--warn">
            <strong>공용 컴퓨터에서는 사용하지 마세요.</strong>
            토큰은 이 브라우저에 저장됩니다. 유출된 것 같으면
            <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">GitHub 토큰 목록</a>에서
            즉시 삭제(Revoke)할 수 있습니다.
          </div>
          <div class="row">
            <button type="button" class="btn btn--ghost" id="test-btn">연결 테스트</button>
            <span id="test-result" class="test-result"></span>
          </div>
        </section>

        <section class="card">
          <h2 class="card__title">4. 기본 비밀번호</h2>
          <p class="card__lead">새 편지를 쓸 때 자동으로 채워집니다. 목록에서 편지 제목을 보여줄 때도 사용합니다.</p>
          <label class="field">
            <span class="field__label">비밀번호 (8자 이상)</span>
            <input name="defaultPassword" type="text" value="${esc(s.defaultPassword)}" placeholder="후원자에게 알려줄 비밀번호" autocapitalize="none" spellcheck="false">
            <span class="field__hint">후원자에게 링크와 함께 알려주는 값입니다. 숨길 필요가 없어 그대로 보입니다.</span>
          </label>
          <div class="callout">
            <strong>비밀번호를 잊으면 편지를 열 수 없습니다.</strong>
            편지는 이 비밀번호로 암호화되어 저장되며, 복구 수단이 없습니다. 안전한 곳에 적어 두세요.
          </div>
        </section>

        <div class="form__actions">
          <button type="submit" class="btn btn--primary btn--lg">저장</button>
        </div>
      </form>
    </div>`;

  const form = $('#settings-form', root);

  $('#show-token', root).onchange = e => {
    form.githubToken.type = e.target.checked ? 'text' : 'password';
  };

  $('#test-btn', root).onclick = async () => {
    const result = $('#test-result', root);
    const data = readForm(form);
    if (!data.repoOwner || !data.repoName || !data.githubToken) {
      result.className = 'test-result is-bad';
      result.textContent = '소유자 · 저장소 이름 · 토큰을 모두 입력해 주세요.';
      return;
    }
    result.className = 'test-result is-busy';
    result.textContent = '확인 중…';
    try {
      const info = await testConnection(data);
      result.className = 'test-result is-good';
      result.textContent = `연결됨 — ${info.fullName}${info.private ? ' (비공개 저장소)' : ''}`;
      if (!info.private) {
        toast('공개 저장소입니다. 편지 본문은 암호화되어 저장되므로 내용은 보호됩니다.', 'info');
      }
    } catch (err) {
      result.className = 'test-result is-bad';
      result.textContent = err.message;
    }
  };

  form.onsubmit = e => {
    e.preventDefault();
    const data = readForm(form);
    saveSettings(data);
    toast('설정을 저장했습니다.', 'good');
    if (data.repoOwner && data.repoName && data.githubToken) navigate('/list');
  };
}

function readForm(form) {
  return {
    missionaryName: form.missionaryName.value.trim(),
    repoOwner: form.repoOwner.value.trim().replace(/^@/, ''),
    repoName: form.repoName.value.trim(),
    repoBranch: form.repoBranch.value.trim() || 'main',
    githubToken: form.githubToken.value.trim(),
    defaultPassword: form.defaultPassword.value
  };
}
