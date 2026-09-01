// 편지 보기 (후원자용) — PRD v2 §7.3
import { $, esc, periodLabel, toast } from '../util.js';
import { getSettings, rememberReaderPassword, recallReaderPassword, forgetReaderPassword } from '../store.js';
import { loadLetterFile } from '../letters.js';
import { decryptBody } from '../crypto.js';
import { letterHTML, loadLetterImages, printLetter, bindPrayers } from '../render.js';
import { findNeighbors } from './archive.js';

export async function renderLetter(root, id) {
  document.body.classList.add('mode-reader');

  // 상태 1 준비 — 먼저 편지 파일(암호문)을 가져온다.
  root.innerHTML = `
    <div class="page page--reader">
      <div class="skeleton">
        <div class="skeleton__line skeleton__line--sm"></div>
        <div class="skeleton__line skeleton__line--lg"></div>
        <div class="skeleton__line"></div>
        <div class="skeleton__line"></div>
      </div>
    </div>`;

  let found;
  try {
    found = await loadLetterFile(id, { preferApi: false });
  } catch (err) {
    renderError(root, '편지를 불러오지 못했습니다.', err.message, id);
    return;
  }

  if (!found) {
    renderError(root, '편지를 찾을 수 없습니다.', '링크를 다시 확인해 주세요. 발행 직후라면 1분 뒤에 다시 시도해 주세요.', id);
    return;
  }

  const meta = found.file;
  const settings = getSettings();

  // 저장된 비밀번호가 있으면 곧바로 열어 본다.
  const remembered = recallReaderPassword(id) || settings.defaultPassword;
  if (remembered) {
    try {
      const body = await decryptBody(meta, remembered);
      showLetter(root, meta, body, id);
      return;
    } catch { forgetReaderPassword(id); }
  }

  showLock(root, meta, id);
}

// ── 상태 1: 잠김 ────────────────────────────────────────────────────
function showLock(root, meta, id) {
  const period = periodLabel(meta.id || id);
  root.innerHTML = `
    <div class="page page--reader">
      <div class="lock">
        <div class="lock__mark" aria-hidden="true">✉︎</div>
        <p class="lock__period">${esc(period)}</p>
        <h1 class="lock__title">선교편지</h1>
        <p class="lock__desc">비밀번호를 입력하면 편지를 읽을 수 있습니다.</p>
        <form class="lock__form" id="lock-form">
          <input type="password" id="pw" placeholder="비밀번호" autocomplete="off"
                 autocapitalize="none" spellcheck="false" enterkeyhint="go" aria-label="비밀번호">
          <button type="submit" class="btn btn--primary btn--lg">편지 열기</button>
        </form>
        ${meta.hint ? `<p class="lock__hint">힌트: ${esc(meta.hint)}</p>` : ''}
        <label class="inline-check lock__remember">
          <input type="checkbox" id="remember" checked> 이 기기에서 기억하기
        </label>
        <p class="lock__error" id="lock-error" role="alert"></p>
        <a class="lock__archive" href="#/archive">지난 편지 모두 보기</a>
        <p class="reader-foot"><a href="#/settings">선교사님이신가요? 편지 쓰러 가기</a></p>
      </div>
    </div>`;

  const form = $('#lock-form', root);
  const input = $('#pw', root);
  const error = $('#lock-error', root);
  input.focus();

  // 모바일 키보드의 '이동/확인' 키로도 열리도록 한다.
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit'));
    }
  });

  form.onsubmit = async e => {
    e.preventDefault();
    error.textContent = '';
    const password = input.value;
    if (!password) return;

    const button = form.querySelector('button');
    button.disabled = true;
    button.textContent = '여는 중…';
    try {
      const body = await decryptBody(meta, password);
      if ($('#remember', root).checked) rememberReaderPassword(id, password);
      showLetter(root, meta, body, id);
    } catch (err) {
      error.textContent = err.code === 'WRONG_PASSWORD'
        ? '비밀번호가 맞지 않습니다.'
        : err.message;
      input.select();
    } finally {
      button.disabled = false;
      button.textContent = '편지 열기';
    }
  };
}

// ── 상태 2: 열림 ────────────────────────────────────────────────────
function showLetter(root, meta, body, id) {
  root.innerHTML = `
    <div class="page page--reader">
      ${letterHTML(body, meta)}
      <div class="reader-actions no-print">
        <button class="btn btn--ghost" id="print-btn">PDF로 저장 / 인쇄</button>
        <span class="reader-actions__status" id="print-status"></span>
      </div>
      <nav class="letter-nav no-print" id="letter-nav" hidden></nav>
    </div>`;

  const article = $('.letter', root);
  loadLetterImages(article);
  bindPrayers(article);
  paintNeighbors(root, id);

  $('#print-btn', root).onclick = async e => {
    const button = e.currentTarget;
    button.disabled = true;
    try {
      await printLetter(article, message => { $('#print-status', root).textContent = message; });
    } finally {
      button.disabled = false;
    }
  };
}

/** 지난 편지 / 다음 편지 이동 — 후원자가 예전 소식도 이어서 읽을 수 있도록 */
async function paintNeighbors(root, id) {
  const { older, newer, total } = await findNeighbors(id);
  const nav = $('#letter-nav', root);
  if (!nav || total <= 1) return;

  nav.innerHTML = `
    <div class="letter-nav__side">
      ${older ? `<a class="letter-nav__link" href="#/letter/${esc(older.id)}">
        <span class="letter-nav__dir">← 지난 편지</span>
        <span class="letter-nav__period">${esc(periodLabel(older.id))}</span>
      </a>` : ''}
    </div>
    <a class="letter-nav__all" href="#/archive">편지 ${total}통 모두 보기</a>
    <div class="letter-nav__side letter-nav__side--end">
      ${newer ? `<a class="letter-nav__link" href="#/letter/${esc(newer.id)}">
        <span class="letter-nav__dir">다음 편지 →</span>
        <span class="letter-nav__period">${esc(periodLabel(newer.id))}</span>
      </a>` : ''}
    </div>`;
  nav.hidden = false;
}

// ── 상태 3: 오류 ────────────────────────────────────────────────────
function renderError(root, title, detail, id) {
  root.innerHTML = `
    <div class="page page--reader">
      <div class="empty">
        <h1 class="empty__title">${esc(title)}</h1>
        <p class="empty__desc">${esc(detail)}</p>
        <button class="btn btn--ghost" id="retry">다시 시도</button>
      </div>
    </div>`;
  $('#retry', root).onclick = () => renderLetter(root, id);
}
