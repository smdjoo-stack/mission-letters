// 편지 작성/수정 — PRD v2 §7.2
import { $, $$, esc, toast, dialog, currentMonthId, periodLabel, copyText } from '../util.js';
import { getSettings, saveDraft, loadDraft, clearDraft } from '../store.js';
import { emptyBody, openLetter, countPhotos } from '../letters.js';
import { checkPassword } from '../crypto.js';
import { extractDriveId, verifyDriveImage, loadDriveImage, SHARE_HELP, SHARE_CONFIRM, PHOTO_LIMIT_HINT } from '../drive.js';
import { letterHTML, loadLetterImages, bindPrayers } from '../render.js';
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

  // 옛 임시저장에는 없던 항목 — 없으면 만들어 둔다.
  if (!Array.isArray(state.body.prayers)) state.body.prayers = [];
  if (!state.body.support) state.body.support = { note: '', bank: '', account: '', holder: '' };
  // 예전에는 본문 첫 사진이 머리글 사진이었다 — 전용 칸으로 옮겨 준다.
  if (!String(state.body.hero || '').trim()) {
    const first = state.body.blocks?.[0];
    if (first && first.type === 'image' && first.driveId) {
      state.body.hero = first.driveId;
      state.body.heroSize = first.size || 'normal';
      state.body.blocks.shift();
      if (!state.body.blocks.length) state.body.blocks.push({ type: 'text', value: '' });
      // 옮긴 결과를 바로 저장한다 — 여기서 미루면 본문에서만 빠진 채로 남는다.
      saveDraft(state.id, { body: state.body, password: state.password, hint: state.hint });
    }
  }
  if (!state.body.heroSize) state.body.heroSize = 'normal';

  if (!state.isEdit) {
    if (!state.body.orgName) state.body.orgName = settings.orgName || '';
    if (!state.body.logo) state.body.logo = settings.logo || '';
    if (!state.body.portrait) state.body.portrait = settings.portrait || '';
  }
  // 새 편지는 설정에 적어 둔 후원 안내로 시작한다.
  const sup = state.body.support;
  if (!state.isEdit && !sup.note && !sup.bank && !sup.account && !sup.holder) {
    state.body.support = {
      note: settings.supportNote || '',
      bank: settings.supportBank || '',
      account: settings.supportAccount || '',
      holder: settings.supportHolder || ''
    };
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
        <div class="field-row">
          <label class="field">
            <span class="field__label">발행처 (선택)</span>
            <input id="orgName" type="text" value="${esc(state.body.orgName || '')}" placeholder="한샘교회 선교부">
            <span class="field__hint">로고 옆에 함께 나옵니다.</span>
          </label>
          <label class="field">
            <span class="field__label">로고 (선택)</span>
            <input id="logoLink" type="text" value="${esc(state.body.logo || '')}" placeholder="assets/img/logo.png" autocapitalize="none" spellcheck="false">
            <span class="field__hint" id="logo-hint"></span>
          </label>
        </div>
        <div class="field">
          <span class="field__label">머리글 사진 (선택)</span>
          <input id="heroLink" type="text" value="${esc(state.body.hero || '')}" placeholder="구글 드라이브 공유 링크" autocapitalize="none" spellcheck="false">
          <span class="field__hint" id="hero-hint">편지 맨 위에 크게 깔리고 그 위에 제목이 얹힙니다.</span>
          <div class="hero-pick" id="hero-pick"${state.body.hero ? '' : ' hidden'}>
            <div class="hero-pick__photo">
              <img id="hero-photo" alt="" referrerpolicy="no-referrer">
              <div class="hero-pick__fail" id="hero-fail" hidden>${SHARE_HELP}</div>
            </div>
            <div class="block__sizes">
              <span class="block__sizes-label">높이</span>
              ${[['short', '낮게'], ['normal', '보통'], ['tall', '높게']].map(([value, label]) => `
                <button type="button" class="block__size${(state.body.heroSize || 'normal') === value ? ' is-on' : ''}"
                        data-hero-size="${value}">${label}</button>`).join('')}
            </div>
          </div>
        </div>

        <label class="field">
          <span class="field__label">맺음 사진 (선택)</span>
          <input id="portraitLink" type="text" value="${esc(state.body.portrait || '')}" placeholder="assets/img/portrait.png" autocapitalize="none" spellcheck="false">
          <span class="field__hint">편지 맨 끝에 보내는 이 이름과 함께 작은 원형으로 나옵니다.</span>
        </label>
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
        <div class="card__head">
          <h2 class="card__title">기도제목</h2>
          <span class="card__meta">후원자 화면에 번호가 붙은 목록으로 나옵니다</span>
        </div>
        <div id="prayers" class="blocks"></div>
        <div class="blocks__add">
          <button type="button" class="btn btn--ghost" id="add-prayer">＋ 기도제목 추가</button>
        </div>
      </section>

      <section class="card">
        <h2 class="card__title">후원 안내</h2>
        <p class="card__lead">편지 맨 아래에 붙습니다. 비워 두면 이 편지에는 나오지 않습니다.</p>
        <label class="field">
          <span class="field__label">안내 문구</span>
          <textarea id="supportNote" rows="2" placeholder="기도와 후원으로 함께해 주셔서 감사합니다.">${esc(state.body.support.note || '')}</textarea>
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field__label">은행</span>
            <input id="supportBank" type="text" value="${esc(state.body.support.bank || '')}" placeholder="국민은행">
          </label>
          <label class="field">
            <span class="field__label">계좌번호</span>
            <input id="supportAccount" type="text" value="${esc(state.body.support.account || '')}" placeholder="000-00-000000" autocapitalize="none" spellcheck="false">
          </label>
        </div>
        <label class="field field--short">
          <span class="field__label">예금주</span>
          <input id="supportHolder" type="text" value="${esc(state.body.support.holder || '')}" placeholder="홍길동">
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
        <button type="button" class="btn btn--primary" id="deploy-btn">${state.isEdit ? '수정본 파일 내려받기' : '발행 파일 내려받기'}</button>
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
  paintPrayers(root);
  $('#add-prayer', root).onclick = () => {
    state.body.prayers.push({ title: '', text: '' });
    paintPrayers(root);
    persist(root);
    const last = root.querySelectorAll('#prayers input')[state.body.prayers.length - 1];
    last?.focus();
  };
  $('#preview-btn', root).onclick = () => preview();
  $('#deploy-btn', root).onclick = () => deploy(root);
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
  for (const [id, key] of Object.entries({
    supportNote: 'note', supportBank: 'bank', supportAccount: 'account', supportHolder: 'holder'
  })) {
    const input = $('#' + id, root);
    input.oninput = () => { state.body.support[key] = input.value; persist(root); };
  }
  const org = $('#orgName', root);
  org.oninput = () => { state.body.orgName = org.value; persist(root); };

  const logo = $('#logoLink', root);
  const logoHint = $('#logo-hint', root);
  const readLogo = () => {
    const raw = logo.value.trim();
    if (!raw) { state.body.logo = ''; logoHint.textContent = '비워 두면 로고 없이 나옵니다.'; return; }
    const driveId = extractDriveId(raw);
    if (driveId) {
      state.body.logo = driveId;
      logoHint.textContent = '드라이브 파일입니다. “링크가 있는 모든 사용자”로 공유해 주세요.';
      return;
    }
    state.body.logo = raw;                       // 저장소 안의 경로나 주소는 그대로 쓴다
    logoHint.textContent = /[/.]/.test(raw)
      ? '저장소에 넣어 둔 그림을 씁니다.'
      : '경로나 드라이브 링크로 적어 주세요.';
  };
  logo.oninput = () => { readLogo(); persist(root); };
  readLogo();

  const heroInput = $('#heroLink', root);
  const heroPick = $('#hero-pick', root);
  const heroPhoto = $('#hero-photo', root);
  const heroFail = $('#hero-fail', root);
  const heroHint = $('#hero-hint', root);

  const paintHero = async () => {
    const value = String(state.body.hero || '').trim();
    heroPick.hidden = !value;
    if (!value) { heroHint.textContent = '비우면 제목만 있는 머리말로 나옵니다.'; return; }
    heroFail.hidden = true;
    if (/[/.]/.test(value) && !extractDriveId(value)) {
      heroPhoto.src = value;                      // 저장소 안의 그림
      heroHint.textContent = '저장소에 넣어 둔 그림을 씁니다.';
      return;
    }
    heroHint.textContent = '구글 드라이브 사진입니다.';
    const result = await loadDriveImage(heroPhoto, value, 800);
    if (!result.ok) heroFail.hidden = false;
  };

  heroInput.oninput = () => {
    const raw = heroInput.value.trim();
    state.body.hero = extractDriveId(raw) || raw;
    persist(root);
    paintHero();
  };
  paintHero();

  $$('[data-hero-size]', root).forEach(button => {
    button.onclick = () => {
      state.body.heroSize = button.dataset.heroSize;
      button.parentElement.querySelectorAll('.block__size')
        .forEach(other => other.classList.toggle('is-on', other === button));
      persist(root);
    };
  });

  const portrait = $('#portraitLink', root);
  portrait.oninput = () => {
    const raw = portrait.value.trim();
    state.body.portrait = extractDriveId(raw) || raw;
    persist(root);
  };

  $('#password', root).oninput = e => { state.password = e.target.value; persist(root); };
  $('#hint', root).oninput = e => { state.hint = e.target.value; persist(root); };
}

// ── 기도제목 편집기 ────────────────────────────────────────────────
function paintPrayers(root) {
  const wrap = $('#prayers', root);
  if (!wrap) return;

  wrap.innerHTML = state.body.prayers.map((prayer, index) => `
    <div class="block" data-i="${index}">
      <div class="block__tools">
        <button type="button" data-pact="up"     data-i="${index}" title="위로"   ${index === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-pact="down"   data-i="${index}" title="아래로" ${index === state.body.prayers.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" data-pact="remove" data-i="${index}" title="삭제">✕</button>
      </div>
      <label class="field">
        <span class="field__label">제목 ${index + 1}</span>
        <input type="text" data-pfield="title" data-i="${index}" value="${esc(prayer.title || '')}" placeholder="다시 열린 마을 길">
      </label>
      <label class="field">
        <span class="field__label">내용</span>
        <textarea rows="2" data-pfield="text" data-i="${index}" placeholder="무엇을 위해 기도해 주시면 좋을지 적어 주세요.">${esc(prayer.text || '')}</textarea>
      </label>
    </div>`).join('');

  if (!state.body.prayers.length) {
    wrap.innerHTML = '<p class="field__hint">아직 기도제목이 없습니다. 없으면 편지에 이 부분이 나오지 않습니다.</p>';
  }

  $$('[data-pfield]', wrap).forEach(input => {
    input.oninput = () => {
      state.body.prayers[Number(input.dataset.i)][input.dataset.pfield] = input.value;
      persist(root);
    };
  });

  $$('[data-pact]', wrap).forEach(button => {
    button.onclick = () => {
      const i = Number(button.dataset.i);
      const list = state.body.prayers;
      if (button.dataset.pact === 'remove') list.splice(i, 1);
      if (button.dataset.pact === 'up' && i > 0) list.splice(i - 1, 0, list.splice(i, 1)[0]);
      if (button.dataset.pact === 'down' && i < list.length - 1) list.splice(i + 1, 0, list.splice(i, 1)[0]);
      paintPrayers(root);
      persist(root);
    };
  });
}

// ── 사진 크기 ──────────────────────────────────────────────────────
const PHOTO_SIZES = [['small', '작게'], ['normal', '보통'], ['wide', '크게']];

const PER_ROW = [[1, '1장'], [2, '2장'], [3, '3장']];

function sizePickerHTML(index, block) {
  const options = PHOTO_SIZES;
  const current = options.some(([v]) => v === block.size) ? block.size : 'normal';
  const per = PER_ROW.some(([v]) => v === Number(block.perRow)) ? Number(block.perRow) : 1;

  const sizeRow = `
    <div class="block__sizes"${per === 1 ? '' : ' hidden'} data-role="size-row">
      <span class="block__sizes-label">사진 크기</span>
      ${options.map(([value, label]) => `
        <button type="button" class="block__size${value === current ? ' is-on' : ''}"
                data-size="${value}" data-i="${index}">${label}</button>`).join('')}
    </div>`;

  return `
    <div class="block__sizes">
      <span class="block__sizes-label">한 줄에</span>
      ${PER_ROW.map(([value, label]) => `
        <button type="button" class="block__size${value === per ? ' is-on' : ''}"
                data-per="${value}" data-i="${index}">${label}</button>`).join('')}
    </div>
    ${sizeRow}`;
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
          ${sizePickerHTML(index, block)}
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

  $$('.block__size', wrap).forEach(button => {
    button.onclick = () => {
      const i = Number(button.dataset.i);
      const block = state.body.blocks[i];
      const holder = button.parentElement;

      if (button.dataset.per) {
        block.perRow = Number(button.dataset.per);
        // 한 줄에 여러 장이면 폭은 칸이 정하므로 크기 고르기를 감춘다.
        const sizeRow = holder.parentElement.querySelector('[data-role=size-row]');
        if (sizeRow) sizeRow.hidden = block.perRow !== 1;
      } else {
        block.size = button.dataset.size;
      }

      holder.querySelectorAll('.block__size')
        .forEach(other => other.classList.toggle('is-on', other === button));
      persist(root);
    };
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
let lastPerRow = 1;   // 지난번에 고른 장수를 다음에도 기본값으로 쓴다

/**
 * 사진 추가 — 고른 장수만큼 링크·설명 칸을 만들어 한 줄을 한 번에 넣는다.
 * 1장이면 한 쌍, 2장이면 두 쌍, 3장이면 세 쌍.
 */
async function addPhoto(root) {
  let perRow = lastPerRow;
  const picked = [];                      // 확인을 마친 { id, caption }

  const slotHTML = (i, count) => `
    <div class="photo-slot" data-slot="${i}">
      ${count > 1 ? `<span class="photo-slot__no">${i + 1}번째 사진</span>` : ''}
      <label class="field">
        <span class="field__label">공유 링크</span>
        <input class="slot-link" data-i="${i}" type="text"
               placeholder="https://drive.google.com/file/d/..." autocapitalize="none" spellcheck="false">
      </label>
      <div class="photo-check slot-check" data-i="${i}"></div>
      <label class="field">
        <span class="field__label">사진 설명 (선택)</span>
        <input class="slot-caption" data-i="${i}" type="text" placeholder="주일학교 아이들">
      </label>
    </div>`;

  const ok = await dialog({
    title: '사진 추가',
    confirmLabel: '이 사진 넣기',
    content: `
      <p class="dialog__lead">구글 드라이브에서 사진의 <strong>공유 링크</strong>를 복사해 붙여넣어 주세요.</p>
      <div class="field">
        <span class="field__label">한 줄에 몇 장</span>
        <div class="block__sizes" id="add-per-row">
          ${[[1, '1장'], [2, '2장'], [3, '3장']].map(([value, label]) => `
            <button type="button" class="block__size${value === perRow ? ' is-on' : ''}" data-add-per="${value}">${label}</button>`).join('')}
        </div>
      </div>
      <div id="photo-slots"></div>
      <div class="callout callout--warn">
        드라이브에서 <strong>공유 → ‘링크가 있는 모든 사용자’</strong> 로 설정해야 후원자에게 보입니다.
        선교사님은 로그인 상태라 설정이 잘못돼도 화면에는 보일 수 있습니다.
      </div>`,
    onMount: {
      mount(box) {
        const slots = box.querySelector('#photo-slots');
        const slotState = [];             // 칸마다 { id, url, caption }

        const verify = async index => {
          const input = slots.querySelector(`.slot-link[data-i="${index}"]`);
          const check = slots.querySelector(`.slot-check[data-i="${index}"]`);
          const value = input.value.trim();
          slotState[index] = { ...(slotState[index] || {}), url: value, id: null };

          if (!value) { check.className = 'photo-check slot-check'; check.dataset.i = index; check.innerHTML = ''; return; }

          const driveId = extractDriveId(value);
          if (!driveId) {
            check.className = 'photo-check slot-check is-bad';
            check.innerHTML = '구글 드라이브 링크가 아닙니다. 드라이브에서 <strong>공유 → 링크 복사</strong>로 받은 주소를 넣어 주세요.';
            return;
          }
          check.className = 'photo-check slot-check is-busy';
          check.textContent = '사진을 확인하는 중…';
          const result = await verifyDriveImage(driveId);
          if (result.ok) {
            slotState[index].id = driveId;
            check.className = 'photo-check slot-check is-good';
            check.innerHTML = `<img src="${esc(result.url)}" alt="미리보기"><span>사진을 확인했습니다.</span>`;
          } else {
            check.className = 'photo-check slot-check is-bad';
            check.innerHTML = SHARE_HELP;
          }
        };

        const bind = () => {
          slots.querySelectorAll('.slot-link').forEach(input => {
            const index = Number(input.dataset.i);
            let timer = null;
            input.oninput = () => { clearTimeout(timer); timer = setTimeout(() => verify(index), 400); };
            input.onpaste = () => setTimeout(() => verify(index), 0);
          });
          slots.querySelectorAll('.slot-caption').forEach(input => {
            const index = Number(input.dataset.i);
            input.oninput = () => { slotState[index] = { ...(slotState[index] || {}), caption: input.value }; };
          });
        };

        const render = () => {
          slots.innerHTML = Array.from({ length: perRow }, (_, i) => slotHTML(i, perRow)).join('');
          // 장수를 바꿔도 이미 적은 값은 남긴다.
          slotState.slice(0, perRow).forEach((slot, i) => {
            if (!slot) return;
            const link = slots.querySelector(`.slot-link[data-i="${i}"]`);
            const caption = slots.querySelector(`.slot-caption[data-i="${i}"]`);
            if (link && slot.url) link.value = slot.url;
            if (caption && slot.caption) caption.value = slot.caption;
          });
          bind();
          slotState.slice(0, perRow).forEach((slot, i) => { if (slot?.url) verify(i); });
          slots.querySelector('.slot-link')?.focus();
        };

        box.querySelectorAll('[data-add-per]').forEach(button => {
          button.onclick = () => {
            perRow = Number(button.dataset.addPer);
            box.querySelectorAll('[data-add-per]')
              .forEach(other => other.classList.toggle('is-on', other === button));
            render();
          };
        });

        render();
        box._slotState = slotState;
      },
      validate(box) {
        const slotState = box._slotState || [];
        picked.length = 0;
        for (let i = 0; i < perRow; i++) {
          const slot = slotState[i];
          if (!slot || !slot.url) continue;            // 비워 둔 칸은 건너뛴다
          if (!slot.id) {                              // 적었는데 확인이 안 된 칸
            const check = box.querySelector(`.slot-check[data-i="${i}"]`);
            if (check) {
              check.className = 'photo-check slot-check is-bad';
              check.innerHTML = check.innerHTML || '이 사진의 링크를 확인해 주세요.';
            }
            return false;
          }
          picked.push({ id: slot.id, caption: slot.caption || '' });
        }
        if (picked.length) return true;
        const first = box.querySelector('.slot-check[data-i="0"]');
        if (first) {
          first.className = 'photo-check slot-check is-bad';
          first.innerHTML = '먼저 사진 링크를 넣어 주세요.';
        }
        return false;
      }
    }
  });

  if (!ok || !picked.length) return;
  lastPerRow = perRow;

  const blocks = state.body.blocks;
  // 여러 장을 한 줄로 묶으려면 앞 사진과 붙어 있어야 한다 — 사이의 빈 글 칸을 걷어낸다.
  if (perRow > 1) {
    const last = blocks[blocks.length - 1];
    if (last && last.type === 'text' && !String(last.value || '').trim()) blocks.pop();
  }
  picked.forEach(photo => blocks.push({ type: 'image', driveId: photo.id, caption: photo.caption, perRow }));
  if (perRow === 1) blocks.push({ type: 'text', value: '' });

  persist(root);
  paintBlocks(root);
  updatePhotoCount(root);
  toast(picked.length === 1 && perRow === 1
    ? '사진을 넣었습니다.'
    : `사진 ${picked.length}장을 넣었습니다. 한 줄에 ${perRow}장으로 놓입니다.`, 'good');
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
  bindPrayers(back);
  const close = () => back.remove();
  back.querySelector('[data-act=close]').onclick = close;
  back.onclick = e => { if (e.target === back) close(); };
}

// ── 배포 — 브라우저는 저장소에 직접 쓰지 않는다(github.js writeBlocked).
// 여기서는 scripts/publish-letter.mjs 가 그대로 먹는 내용 파일을 내려주고, 발행은 저장소에서 한다.
function deployFileName() {
  return `letter-${state.id}.json`;
}

function deployPayload() {
  const hint = state.hint.trim();
  return {
    id: state.id,
    password: state.password,
    ...(hint ? { hint } : {}),
    publishedAt: state.publishedAt || `${state.id}-01`,
    body: state.body
  };
}

function downloadJSON(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function deploy(root) {
  const check = checkPassword(state.password);
  if (!check.ok) { toast(check.message, 'bad'); $('#password', root).focus(); return; }
  if (!state.body.title.trim()) { toast('제목을 입력해 주세요.', 'bad'); $('#title', root).focus(); return; }
  if (!state.body.blocks.some(b => (b.type === 'text' && b.value.trim()) || b.type === 'image')) {
    toast('본문을 입력해 주세요.', 'bad'); return;
  }

  const photos = countPhotos(state.body);
  let sharingChecked = photos === 0;

  const confirmed = await dialog({
    title: state.isEdit ? '수정한 편지를 내려받습니다' : '편지 내용을 내려받습니다',
    confirmLabel: '발행 파일 내려받기',
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
      <div class="callout">
        <strong>이 버튼은 아직 공개하지 않습니다.</strong>
        내용 파일을 내려받기만 합니다. 저장소에서 <code>scripts/publish-letter.mjs</code> 로 발행해야 후원자가 볼 수 있습니다.
      </div>
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

  const button = $('#deploy-btn', root);
  const status = $('#save-status', root);
  const restore = () => {
    button.disabled = false;
    button.textContent = state.isEdit ? '수정본 파일 내려받기' : '발행 파일 내려받기';
  };
  button.disabled = true;
  button.textContent = '내려받는 중…';
  status.textContent = '';

  const name = deployFileName();
  try {
    downloadJSON(name, deployPayload());
    // 임시저장은 지우지 않는다 — 아직 발행 전이라 이 화면이 유일한 원본이다.
    status.textContent = '발행 파일을 내려받았습니다.';
    restore();
    await showDeployed(name);
  } catch (err) {
    status.textContent = '파일을 내려받지 못했습니다. 작성 내용은 그대로 남아 있습니다.';
    toast(err.message, 'bad');
  } finally {
    restore();
  }
}

async function showDeployed(fileName) {
  const link = shareLink(state.id);
  const command = `node scripts/publish-letter.mjs ~/Downloads/${fileName}`;
  await dialog({
    title: '발행 파일을 내려받았습니다',
    confirmLabel: '명령 복사하고 닫기',
    cancelLabel: '닫기',
    content: `
      <p class="dialog__lead">아직 후원자에게 공개되지 않았습니다. 저장소에서 아래 명령 한 줄을 실행하면 암호화·커밋·푸시까지 끝납니다.</p>
      <div class="share">
        <div class="share__row"><span>파일</span><code>${esc(fileName)}</code></div>
        <div class="share__row"><span>명령</span><code>${esc(command)}</code></div>
      </div>
      <div class="share">
        <div class="share__row"><span>링크</span><code>${esc(link)}</code></div>
        <div class="share__row"><span>비밀번호</span><code>${esc(state.password)}</code></div>
      </div>
      <div class="callout">
        발행 뒤 GitHub Pages 반영에 <strong>최대 1분</strong>이 걸릴 수 있습니다.
      </div>`,
    onMount: { validate() { copyText(command); toast('명령을 복사했습니다.', 'good'); return true; } }
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
