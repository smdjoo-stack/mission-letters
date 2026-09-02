// 설정 화면 — PRD v2 §7.4
import { $, esc, toast } from '../util.js';
import { getSettings, saveSettings } from '../store.js';
import { extractDriveId } from '../drive.js';
import { navigate } from '../router.js';

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
          <div class="field-row">
            <label class="field">
              <span class="field__label">발행처 (선택)</span>
              <input name="orgName" type="text" value="${esc(s.orgName || '')}" placeholder="한샘교회 선교부">
            </label>
            <label class="field">
              <span class="field__label">로고 (선택)</span>
              <input name="logo" type="text" value="${esc(s.logo || '')}" placeholder="assets/img/logo.png" autocapitalize="none" spellcheck="false">
              <span class="field__hint">새 편지에 자동으로 채워집니다.</span>
            </label>
          </div>
          <label class="field">
            <span class="field__label">맺음 사진 (선택)</span>
            <input name="portrait" type="text" value="${esc(s.portrait || '')}" placeholder="assets/img/portrait.png" autocapitalize="none" spellcheck="false">
            <span class="field__hint">편지 맨 끝에 이름과 함께 작은 원형으로 나옵니다.</span>
          </label>
        </section>

        <section class="card">
          <h2 class="card__title">2. GitHub 저장소</h2>
          <p class="card__lead">편지가 저장되고 후원자에게 공유될 곳입니다.</p>
          <div class="callout">
            <strong>발행은 저장소에서 합니다.</strong>
            이 앱은 GitHub 토큰을 쓰지 않습니다. 편지 발행은
            <code>scripts/publish-letter.mjs</code> 로 처리합니다.
          </div>
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
          <h2 class="card__title">3. 기본 비밀번호</h2>
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

        <section class="card">
          <h2 class="card__title">4. 후원 안내 기본값</h2>
          <p class="card__lead">새 편지를 쓸 때 자동으로 채워집니다. 편지마다 따로 고칠 수 있습니다.</p>
          <label class="field">
            <span class="field__label">안내 문구</span>
            <textarea name="supportNote" rows="2" placeholder="기도와 후원으로 함께해 주셔서 감사합니다.">${esc(s.supportNote || '')}</textarea>
          </label>
          <div class="field-row">
            <label class="field">
              <span class="field__label">은행</span>
              <input name="supportBank" type="text" value="${esc(s.supportBank || '')}" placeholder="국민은행">
            </label>
            <label class="field">
              <span class="field__label">계좌번호</span>
              <input name="supportAccount" type="text" value="${esc(s.supportAccount || '')}" placeholder="000-00-000000" autocapitalize="none" spellcheck="false">
            </label>
          </div>
          <label class="field field--short">
            <span class="field__label">예금주</span>
            <input name="supportHolder" type="text" value="${esc(s.supportHolder || '')}" placeholder="홍길동">
          </label>
          <div class="callout">
            계좌 정보는 <strong>편지 본문과 함께 암호화</strong>되어 저장됩니다. 비밀번호를 아는 후원자만 봅니다.
          </div>
        </section>

        <div class="form__actions">
          <button type="submit" class="btn btn--primary btn--lg">저장</button>
        </div>
      </form>
    </div>`;

  const form = $('#settings-form', root);

  form.onsubmit = e => {
    e.preventDefault();
    const data = readForm(form);
    saveSettings(data);
    toast('설정을 저장했습니다.', 'good');
    if (data.repoOwner && data.repoName) navigate('/list');
  };
}

function readForm(form) {
  return {
    missionaryName: form.missionaryName.value.trim(),
    orgName: form.orgName.value.trim(),
    logo: (extractDriveId(form.logo.value) || form.logo.value.trim()),
    portrait: (extractDriveId(form.portrait.value) || form.portrait.value.trim()),
    repoOwner: form.repoOwner.value.trim().replace(/^@/, ''),
    repoName: form.repoName.value.trim(),
    repoBranch: form.repoBranch.value.trim() || 'main',
    defaultPassword: form.defaultPassword.value,
    supportNote: form.supportNote.value.trim(),
    supportBank: form.supportBank.value.trim(),
    supportAccount: form.supportAccount.value.trim(),
    supportHolder: form.supportHolder.value.trim()
  };
}
