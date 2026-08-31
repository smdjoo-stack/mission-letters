// 공용 유틸리티

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** HTML 이스케이프 — 사용자 입력을 innerHTML에 넣기 전 반드시 통과시킨다. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 문단 텍스트를 <p>로 — 줄바꿈 보존 */
export function paragraphs(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .filter(chunk => chunk.trim())
    .map(chunk => `<p>${esc(chunk).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

let toastTimer = null;
export function toast(message, kind = 'info') {
  let box = $('#toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    document.body.appendChild(box);
  }
  box.className = `toast toast--${kind} is-on`;
  box.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('is-on'), 4000);
}

/** 확인 대화상자. content 는 HTML 문자열. resolve(true|false) */
export function dialog({ title, content, confirmLabel = '확인', cancelLabel = '취소', onMount }) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'dialog-back';
    back.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h2 class="dialog__title">${esc(title)}</h2>
        <div class="dialog__body">${content}</div>
        <div class="dialog__actions">
          <button class="btn btn--ghost" data-act="cancel">${esc(cancelLabel)}</button>
          <button class="btn btn--primary" data-act="ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(back);

    const scrollY = window.scrollY;
    document.body.style.top = `-${scrollY}px`;
    document.body.classList.add('is-locked');

    const close = result => {
      back.remove();
      document.body.classList.remove('is-locked');
      document.body.style.top = '';
      window.scrollTo(0, scrollY);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = e => { if (e.key === 'Escape') close(false); };

    back.querySelector('[data-act=cancel]').onclick = () => close(false);
    back.querySelector('[data-act=ok]').onclick = () => {
      if (onMount?.validate && !onMount.validate(back)) return;
      close(true);
    };
    back.onclick = e => { if (e.target === back) close(false); };
    document.addEventListener('keydown', onKey);
    onMount?.mount?.(back);
    back.querySelector('.dialog').scrollTop = 0;
  });
}

/** '2026-09' → '2026년 9월' */
export function periodLabel(id) {
  const m = /^(\d{4})-(\d{2})$/.exec(id || '');
  if (!m) return id || '';
  return `${m[1]}년 ${Number(m[2])}월`;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

export function todayISODate() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function currentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 사이트 루트 기준 절대 URL (GitHub Pages 하위 경로 대응) */
export function siteUrl(path = '') {
  return new URL(path, document.baseURI).href;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
