// 편지 작성/수정 — PRD v2 §7.2
import { $, $$, esc, toast, dialog, currentMonthId, periodLabel, copyText } from '../util.js';
import { getSettings, saveDraft, loadDraft, clearDraft } from '../store.js';
import { emptyBody, openLetter, publishLetter, countPhotos } from '../letters.js';
import { checkPassword } from '../crypto.js';
import { extractDriveId, verifyDriveImage, loadDriveImage, SHARE_HELP, SHARE_CONFIRM, PHOTO_LIMIT_HINT } from '../drive.js';
import { letterHTML, loadLetterImages } from '../render.js';
import { shareLink } from '../github.js';
import { navigate } from '../router.js';

let state = null;

export async function renderWrite(root, editId) {
  const settings = getSettings();
  state = {
    id: editId || currentMonthId(),
    isEdit: Boolean(editId),
    password: settings.defaultPassword || '',
    hint: '',
    publishedAt: null,
    body: emptyBody(settings.missionaryName)
  };

  root.innerHTML = `<div class="page"><div class="skeleton"><div class="skeleton__line"></div><div class="skeleton__line"></div></div></div>`;

  if (editId) {
    try {
      const opened = await openLetter(editId, settings.defaultPassword, { preferApi: true });
      if (!opened) {
        toast('편지를 찾을 수 없습니다.', 'bad');
        navigate('/list');
        return;
      }
      state.body = { ...emptyBody(settings.missionaryName), ...opened.body };
      state.hint = opened.meta.hint || '';
      state.publishedAt = opened.meta.publishedAt;
    } catch (err) {
      if (err.code === 'WRONG_PASSWORD') {
        const password = await askPassword(editId);
        if (!password) { navigate('/list'); return; }
        const opened = await openLetter(editId, password, { preferApi: true });
        state.password = password;
        state.body = { ...emptyBody(settings.missionaryName), ...opened.body };
        state.hint = opened.meta.hint || '';
        state.publishedAt = opened.meta.publishedAt;
      } else {
        toast(err.message, 'bad');
        navigate('/list');
        return;
      }
    }
  } else {
    // 임시저장 복구 — 새로고침·브라우저 종료 후에도 내용을 잃지 않는다.
    const draft = loadDraft(state.id);
    if (draft?.body) {
      state.body = draft.body;
      state.password = draft.password || state.password;
      state.hint = draft.hint || '';
      toast('작성 중이던 내용을 복구했습니다.', 'info');
    }
    if (!state.body.period) state.body.period = periodLabel(state.id);
  }

  paint(root);
}

function paint(root) {
  const photoCount = countPhotos(state.body);
  root.innerHTML = `
    <div class="page page--write">
      <h1 class="page__title">${state.isEdit ? '편지 수정' : '새 편지 쓰기'}</h1>

      <section class="card">
        <div class="field-row">
          <label class="field">
            <span class="field__label">편지 월</span>
            <input id="month" type="month" value="${esc(state.id)}" ${state.isEdit ? 'disabled' : ''}>
            ${state.isEdit ? '<span class="field__hint">발행한 편지의 월은 바꿀 수 없습니다.</span>' : ''}
          </label>
          <label class="field">
            <span class="field__label">기간 표시</span>
            <input id="period" type="text" value="${esc(state.body.period)}" placeholder="2026년 9월">
          </label>
        </div>
        <label class="field">
          <span class="field__label">제목</span>
          <input id="title" type="text" value="${esc(state.body.title)}" placeholder="2026년 9월 선교편지">
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field__label">보내는 이</span>
            <input id="authorName" type="text" value="${esc(state.body.authorName)}" placeholder="홍길동 선교사">
          </label>
          <label class="field">
            <span class="field__label">인사말</span>
            <input id="greeting" type="text" value="${esc(state.body.greeting)}" placeholder="사랑하는 후원자님께">
          </label>
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <h2 class="card__title">본문</h2>
          <span class="card__meta">사진 ${photoCount}장${photoCount > PHOTO_LIMIT_HINT ? ' · 너무 많으면 로딩이 느려집니다' : ''}</span>
        </div>
        <div id="blocks" class="blocks"></div>
        <div class="blocks__add">
          <button type="button" class="btn btn--ghost" id="add-text">＋ 문단 추가</button>
          <button type="button" class="btn btn--ghost" id="add-photo">＋ 사진 추가</button>
        </div>
      </section>

      <section class="card">
        <label class="field">
          <span class="field__label">맺음말</span>
          <textarea id="closing" rows="3" placeholder="기도와 후원에 감사드립니다.">${esc(state.body.closing)}</textarea>
        </label>
      </section>

      <section class="card">
        <h2 class="card__title">비밀번호</h2>
        <div class="field-row">
          <label class="field">
            <span class="field__label">이 편지의 비밀번호 (8자 이상)</span>
            <input id="password" type="text" value="${esc(state.password)}" autocapitalize="none" spellcheck="false">
          </label>
          <label class="field">
            <span class="field__label">힌트 (선택)</span>
            <input id="hint" type="text" value="${esc(state.hint)}" placeholder="교회 이름 + 연도">
            <span class="field__hint">힌트는 암호화되지 않습니다. 비밀번호 자체를 적지 마세요.</span>
          </label>
        </div>
      </section>

      <div class="sticky-bar no-print">
        <span class="sticky-bar__status" id="save-status"></span>
        <button type="button" class="btn btn--ghost" id="preview-btn">미리보기</button>
        <button type="button" class="btn btn--primary" id="publish-btn">${state.isEdit ? '수정 발행' : '발행'}</button>
      </div>
    </div>`;

  bindFields(root);
  paintBlocks(root);

  $('#add-text', root).onclick = () => {
    state.body.blocks.push({ type: 'text', value: '' });
    persist(root);
    paintBlocks(root);
    const last = $$('.block textarea', root).pop();
    last?.focus();
  };
  $('#add-photo', root).onclick = () => addPhoto(root);
  $('#preview-btn', root).onclick = () => preview();
  $('#publish-btn', root).onclick = () => publish(root);
}

function bindFields(root) {
  const map = {
    period: 'period', title: 'title', authorName: 'authorName', greeting: 'greeting', closing: 'closing'
  };
  for (const [id, key] of Object.entries(map)) {
    const input = $('#' + id, root);
    input.oninput = () => { state.body[key] = input.value; persist(root); };
  }
  const month = $('#month', root);
  if (!month.disabled) {
    month.onchange = () => {
      const previous = state.id;
      state.id = month.value || currentMonthId();
      const periodInput = $('#period', root);
      if (!periodInput.value || periodInput.value === periodLabel(previous)) {
        periodInput.value = periodLabel(state.id);
        state.body.period = periodInput.value;
      }
      clearDraft(previous);
      persist(root);
    };
  }
  $('#password', root).oninput = e => { state.password = e.target.value; persist(root); };
  $('#hint', root).oninput = e => { state.hint = e.target.value; persist(root); };
}

// ── 블록 편집기 ────────────────────────────────────────────────────
// 구조 변경(추가·삭제·이동) 때만 다시 그린다. 타이핑 중에는 다시 그리지 않아 포커스가 유지된다.
function paintBlocks(root) {
  const wrap = $('#blocks', root);
  wrap.innerHTML = state.body.blocks.map((block, index) => {
    const controls = `
      <div class="block__tools">
        <button type="button" data-act="up"     data-i="${index}" title="위로"   ${index === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-act="down"   data-i="${index}" title="아래로" ${index === state.body.blocks.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" data-act="remove" data-i="${index}" title="삭제">✕</button>
      </div>`;

    if (block.type === 'image') {
      return `
        <div class="block block--image" data-i="${index}">
          ${controls}
          <div class="block__photo">
            <img data-drive-id="${esc(block.driveId || '')}" alt="" referrerpolicy="no-referrer">
            <div class="block__photo-fail" hidden>${SHARE_HELP}</div>
          </div>
          <input class="block__caption" data-i="${index}" type="text"
                 value="${esc(block.caption || '')}" placeholder="사진 설명 (선택)">
        </div>`;
    }
    return `
      <div class="block block--text" data-i="${index}">
        ${controls}
        <textarea data-i="${index}" rows="5" placeholder="이곳에 사역 소식을 적어 주세요.&#10;&#10;빈 줄로 나누면 문단이 나뉩니다.">${esc(block.value || '')}</textarea>
      </div>`;
  }).join('');

  $$('textarea[data-i]', wrap).forEach(area => {
    area.oninput = () => {
      state.body.blocks[Number(area.dataset.i)].value = area.value;
      autoGrow(area);
      persist(root);
    };
    // 드라이브 링크를 본문에 붙여넣으면 사진 블록으로 자동 전환한다.
    area.onpaste = event => {
      const text = event.clipboardData?.getData('text') || '';
      const driveId = extractDriveId(text);
      if (driveId && !area.value.trim()) {
        event.preventDefault();
        insertPhotoBlock(root, driveId, Number(area.dataset.i));
      }
    };
    autoGrow(area);
  });

  $$('.block__caption', wrap).forEach(input => {
    input.oninput = () => {
      state.body.blocks[Number(input.dataset.i)].caption = input.value;
      persist(root);
    };
  });

  $$('.block__tools button', wrap).forEach(button => {
    button.onclick = () => {
      const i = Number(button.dataset.i);
      const blocks = state.body.blocks;
      if (button.dataset.act === 'up' && i > 0) [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
      if (button.dataset.act === 'down' && i < blocks.length - 1) [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]];
      if (button.dataset.act === 'remove') blocks.splice(i, 1);
      if (!blocks.length) blocks.push({ type: 'text', value: '' });
      persist(root);
      paintBlocks(root);
      updatePhotoCount(root);
    };
  });

  // 사진 미리보기 로드
  $$('.block__photo img', wrap).forEach(async img => {
    if (!img.dataset.driveId) return;
    const result = await loadDriveImage(img, img.dataset.driveId, 800);
    if (!result.ok) {
      img.closest('.block__photo').querySelector('.block__photo-fail').hidden = false;
    }
  });
}

function autoGrow(area) {
  area.style.height = 'auto';
  area.style.height = Math.max(120, area.scrollHeight) + 'px';
}

function insertPhotoBlock(root, driveId, atIndex) {
  const at = Number.isInteger(atIndex) ? atIndex + 1 : state.body.blocks.length;
  state.body.blocks.splice(at, 0, { type: 'image', driveId, caption: '' });
  if (!state.body.blocks.some((b, i) => i > at && b.type === 'text')) {
    state.body.blocks.splice(at + 1, 0, { type: 'text', value: '' });
  }
  persist(root);
  paintBlocks(root);
  updatePhotoCount(root);
}

function updatePhotoCount(root) {
  const count = countPhotos(state.body);
  const meta = $('.card__meta', root);
  if (meta) meta.textContent = `사진 ${count}장${count > PHOTO_LIMIT_HINT ? ' · 너무 많으면 로딩이 느려집니다' : ''}`;
}

// ── 사진 추가 대화상자 — 붙여넣는 즉시 검증 (PRD §6.2 3단계) ─────────
async function addPhoto(root) {
  let verifiedId = null;

  const ok = await dialog({
    title: '사진 추가',
    confirmLabel: '이 사진 넣기',
    content: `
      <p class="dialog__lead">구글 드라이브에서 사진의 <strong>공유 링크</strong>를 복사해 붙여넣어 주세요.</p>
      <label class="field">
        <span class="field__label">공유 링크</span>
        <input id="drive-input" type="text" placeholder="https://drive.google.com/file/d/..." autocapitalize="none" spellcheck="false">
      </label>
      <div class="photo-check" id="photo-check"></div>
      <label class="field">
        <span class="field__label">사진 설명 (선택)</span>
        <input id="drive-caption" type="text" placeholder="주일학교 아이들">
      </label>
      <div class="callout callout--warn">
        드라이브에서 <strong>공유 → ‘링크가 있는 모든 사용자’</strong> 로 설정해야 후원자에게 보입니다.
        선교사님은 로그인 상태라 설정이 잘못돼도 화면에는 보일 수 있습니다.
      </div>`,
    onMount: {
      mount(box) {
        const input = box.querySelector('#drive-input');
        const check = box.querySelector('#photo-check');
        input.focus();

        const run = async () => {
          const driveId = extractDriveId(input.value);
          verifiedId = null;
          if (!input.value.trim()) { check.className = 'photo-check'; check.innerHTML = ''; return; }
          if (!driveId) {
            check.className = 'photo-check is-bad';
            check.innerHTML = '구글 드라이브 링크가 아닙니다. 드라이브에서 <strong>공유 → 링크 복사</strong>로 받은 주소를 넣어 주세요.';
            return;
          }
          check.className = 'photo-check is-busy';
          check.textContent = '사진을 확인하는 중…';
          const result = await verifyDriveImage(driveId);
          if (result.ok) {
            verifiedId = driveId;
            check.className = 'photo-check is-good';
            check.innerHTML = `<img src="${esc(result.url)}" alt="미리보기"><span>사진을 확인했습니다.</span>`;
          } else {
            check.className = 'photo-check is-bad';
            check.innerHTML = SHARE_HELP;
          }
        };

        let timer = null;
        input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 400); };
        input.onpaste = () => setTimeout(run, 0);
      },
      validate(box) {
        if (verifiedId) return true;
        const check = box.querySelector('#photo-check');
        check.className = 'photo-check is-bad';
        check.innerHTML = check.innerHTML || '먼저 사진 링크를 확인해 주세요.';
        return false;
      }
    }
  });

  if (!ok || !verifiedId) return;
  const caption = document.querySelector('#drive-caption')?.value || '';
  state.body.blocks.push({ type: 'image', driveId: verifiedId, caption });
  state.body.blocks.push({ type: 'text', value: '' });
  persist(root);
  paintBlocks(root);
  updatePhotoCount(root);
  toast('사진을 넣었습니다.', 'good');
}

// ── 미리보기 ────────────────────────────────────────────────────────
function preview() {
  const back = document.createElement('div');
  back.className = 'dialog-back dialog-back--wide';
  back.innerHTML = `
    <div class="dialog dialog--preview">
      <div class="dialog__toolbar">
        <span>미리보기 — 후원자에게 보이는 모습</span>
        <button class="btn btn--ghost btn--sm" data-act="close">닫기</button>
      </div>
      <div class="dialog__preview">${letterHTML(state.body, { id: state.id })}</div>
    </div>`;
  document.body.appendChild(back);
  loadLetterImages(back);
  const close = () => back.remove();
  back.querySelector('[data-act=close]').onclick = close;
  back.onclick = e => { if (e.target === back) close(); };
}

// ── 발행 — PRD §6.1 ────────────────────────────────────────────────
async function publish(root) {
  const check = checkPassword(state.password);
  if (!check.ok) { toast(check.message, 'bad'); $('#password', root).focus(); return; }
  if (!state.body.title.trim()) { toast('제목을 입력해 주세요.', 'bad'); $('#title', root).focus(); return; }
  if (!state.body.blocks.some(b => (b.type === 'text' && b.value.trim()) || b.type === 'image')) {
    toast('본문을 입력해 주세요.', 'bad'); return;
  }

  const photos = countPhotos(state.body);
  let sharingChecked = photos === 0;

  const confirmed = await dialog({
    title: state.isEdit ? '편지를 수정 발행합니다' : '편지를 발행합니다',
    confirmLabel: '발행하기',
    content: `
      <ul class="summary">
        <li><span>편지</span><strong>${esc(state.body.title)}</strong></li>
        <li><span>기간</span><strong>${esc(state.body.period || periodLabel(state.id))}</strong></li>
        <li><span>사진</span><strong>${photos}장</strong></li>
        <li><span>비밀번호</span><strong>${esc(state.password)}</strong></li>
      </ul>
      ${check.warn ? `<div class="callout callout--warn">${esc(check.message)}</div>` : ''}
      ${photos ? `<label class="inline-check confirm-check"><input type="checkbox" id="share-ok"> ${esc(SHARE_CONFIRM)}</label>` : ''}
      ${state.isEdit ? '<div class="callout">기존에 발행한 편지를 덮어씁니다. 후원자 링크는 그대로입니다.</div>' : ''}
      <div class="callout callout--warn">
        <strong>비밀번호를 잊으면 이 편지를 다시 열 수 없습니다.</strong> 편지는 이 비밀번호로 암호화됩니다.
      </div>`,
    onMount: {
      mount(box) {
        const input = box.querySelector('#share-ok');
        if (input) input.onchange = () => { sharingChecked = input.checked; };
      },
      validate() {
        if (!sharingChecked) { toast('사진 공유 설정 확인란에 체크해 주세요.', 'bad'); return false; }
        return true;
      }
    }
  });
  if (!confirmed) return;

  const button = $('#publish-btn', root);
  const status = $('#save-status', root);
  button.disabled = true;
  button.textContent = '발행 중…';
  status.textContent = '';

  try {
    await publishLetter({
      id: state.id,
      body: state.body,
      password: state.password,
      hint: state.hint.trim(),
      publishedAt: state.publishedAt
    });
    clearDraft(state.id);
    await showPublished();
    navigate('/list');
  } catch (err) {
    // 실패해도 작성 내용은 임시저장에 남아 있다 — 입력을 잃지 않는다.
    status.textContent = '발행하지 못했습니다. 작성 내용은 그대로 남아 있습니다.';
    toast(err.message, 'bad');
    if (err.code === 'BAD_TOKEN' || err.code === 'NO_REPO') {
      setTimeout(() => navigate('/settings'), 1500);
    }
  } finally {
    button.disabled = false;
    button.textContent = state.isEdit ? '수정 발행' : '발행';
  }
}

async function showPublished() {
  const link = shareLink(state.id);
  await dialog({
    title: '발행했습니다',
    confirmLabel: '링크 복사하고 닫기',
    cancelLabel: '닫기',
    content: `
      <p class="dialog__lead">아래 링크와 비밀번호를 후원자에게 함께 알려 주세요.</p>
      <div class="share">
        <div class="share__row"><span>링크</span><code id="share-url">${esc(link)}</code></div>
        <div class="share__row"><span>비밀번호</span><code>${esc(state.password)}</code></div>
      </div>
      <div class="callout">
        GitHub Pages 반영에 <strong>최대 1분</strong>이 걸릴 수 있습니다. 링크가 바로 열리지 않으면 잠시 뒤 다시 시도해 주세요.
      </div>`,
    onMount: { validate() { copyText(`${link}\n비밀번호: ${state.password}`); toast('링크를 복사했습니다.', 'good'); return true; } }
  });
}

async function askPassword(id) {
  let value = '';
  const ok = await dialog({
    title: '편지 비밀번호',
    confirmLabel: '열기',
    content: `
      <p class="dialog__lead">${esc(periodLabel(id))} 편지는 설정의 기본 비밀번호로 열리지 않습니다. 이 편지의 비밀번호를 입력해 주세요.</p>
      <label class="field"><input id="ask-pw" type="text" autocapitalize="none" spellcheck="false"></label>`,
    onMount: {
      mount(box) { box.querySelector('#ask-pw').focus(); },
      validate(box) { value = box.querySelector('#ask-pw').value; return Boolean(value); }
    }
  });
  return ok ? value : null;
}

// ── 임시저장 — 입력할 때마다 (PRD §7.2) ─────────────────────────────
let persistTimer = null;
function persist(root) {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    saveDraft(state.id, { body: state.body, password: state.password, hint: state.hint });
    const status = $('#save-status', root);
    if (status) {
      status.textContent = '임시저장됨';
      setTimeout(() => { if (status.textContent === '임시저장됨') status.textContent = ''; }, 2000);
    }
  }, 400);
}
