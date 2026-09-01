// 편지 본문 렌더링 — 보기 화면과 작성 미리보기, 인쇄가 모두 같은 결과를 쓰도록 한 곳에 둔다.
// 디자인: Sacred Correspondence — Hero(첫 사진) → 에디토리얼 교차 배치 → 기도제목 → 후원 안내.

import { esc, paragraphs, periodLabel } from './util.js';
import { loadDriveImage, driveViewUrl, SHARE_HELP } from './drive.js';

const PRAYED_KEY = (id, i) => `missionletter.prayed.${id}.${i}`;

function figureHTML(block, extraClass = '') {
  return `
    <figure class="letter__figure ${extraClass}">
      <a href="${esc(driveViewUrl(block.driveId))}" target="_blank" rel="noopener noreferrer">
        <img class="letter__photo" data-drive-id="${esc(block.driveId)}"
             alt="${esc(block.caption || '선교 사진')}" referrerpolicy="no-referrer">
      </a>
      <div class="letter__photo-fallback" hidden>${SHARE_HELP}</div>
      ${block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ''}
    </figure>`;
}

/** 머리말 — 첫 블록이 사진이면 그 사진 위에 얹는다(Hero). */
function heroHTML(block, body, period) {
  return `
    <header class="letter__hero">
      <a class="letter__hero-link" href="${esc(driveViewUrl(block.driveId))}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true">
        <img class="letter__hero-photo" data-drive-id="${esc(block.driveId)}"
             alt="" referrerpolicy="no-referrer">
      </a>
      <div class="letter__photo-fallback" hidden>${SHARE_HELP}</div>
      <div class="letter__hero-veil" aria-hidden="true"></div>
      <div class="letter__hero-text">
        ${period ? `<p class="letter__period">${esc(period)}</p>` : ''}
        <h1 class="letter__title">${esc(body.title || '선교편지')}</h1>
        ${body.authorName ? `<p class="letter__author">${esc(body.authorName)}</p>` : ''}
      </div>
    </header>`;
}

function plainHeadHTML(body, period) {
  return `
    <header class="letter__head">
      ${period ? `<p class="letter__period">${esc(period)}</p>` : ''}
      <h1 class="letter__title">${esc(body.title || '선교편지')}</h1>
      ${body.authorName ? `<p class="letter__author">${esc(body.authorName)}</p>` : ''}
    </header>`;
}

function prayersHTML(prayers, id) {
  const items = (prayers || []).filter(p => String(p?.title || p?.text || '').trim());
  if (!items.length) return '';
  return `
    <section class="prayers">
      <h2 class="prayers__title">기도 부탁드립니다</h2>
      <ol class="prayers__list">
        ${items.map((p, i) => `
          <li class="prayers__item">
            ${p.title ? `<h3 class="prayers__name">${esc(p.title)}</h3>` : ''}
            ${p.text ? `<div class="prayers__text">${paragraphs(p.text)}</div>` : ''}
            <button type="button" class="prayers__mark no-print"
                    data-prayed="${esc(String(i))}" data-letter="${esc(id || '')}">기도했습니다</button>
          </li>`).join('')}
      </ol>
    </section>`;
}

function supportHTML(support) {
  const s = support || {};
  const rows = [
    s.bank    ? ['은행',   s.bank]    : null,
    s.account ? ['계좌번호', s.account] : null,
    s.holder  ? ['예금주', s.holder]  : null
  ].filter(Boolean);
  if (!rows.length && !String(s.note || '').trim()) return '';

  return `
    <section class="support">
      <h2 class="support__title">사역에 동참하기</h2>
      ${s.note ? `<div class="support__note">${paragraphs(s.note)}</div>` : ''}
      ${rows.length ? `
        <dl class="support__account">
          ${rows.map(([label, value]) => `
            <div class="support__row">
              <dt>${esc(label)}</dt>
              <dd>${esc(value)}</dd>
            </div>`).join('')}
        </dl>` : ''}
    </section>`;
}

/** 편지 한 통을 HTML 로. 사진은 자리만 잡고 loadLetterImages() 에서 실제로 싣는다. */
export function letterHTML(body, meta = {}) {
  const period = body.period || periodLabel(meta.id);
  const all = body.blocks || [];

  // Hero — 첫 블록이 사진이면 머리 이미지로 세우고, 본문에서는 뺀다.
  const hero = all[0]?.type === 'image' && all[0].driveId ? all[0] : null;
  const rest = hero ? all.slice(1) : all;

  // 남은 사진은 좌·우로 번갈아 놓아 사역의 서사를 만든다(넓은 화면에서만).
  let photoIndex = 0;
  const blocks = rest.map(block => {
    if (block.type === 'image' && block.driveId) {
      const side = photoIndex++ % 2 === 0 ? 'letter__figure--left' : 'letter__figure--right';
      return figureHTML(block, side);
    }
    if (block.type === 'text' && String(block.value || '').trim()) {
      return `<div class="letter__text">${paragraphs(block.value)}</div>`;
    }
    return '';
  }).join('');

  return `
    <article class="letter${hero ? ' letter--hero' : ''}">
      ${hero ? heroHTML(hero, body, period) : plainHeadHTML(body, period)}
      <div class="letter__sheet">
        ${body.greeting ? `<p class="letter__greeting">${esc(body.greeting)}</p>` : ''}
        <div class="letter__body">${blocks}</div>
        ${body.closing ? `<div class="letter__closing">${paragraphs(body.closing)}</div>` : ''}
        ${prayersHTML(body.prayers, meta.id)}
        ${supportHTML(body.support)}
      </div>
    </article>`;
}

/**
 * '기도했습니다' — 서버가 없으므로 이 기기에서만 표시를 남긴다.
 * 선교사에게 전달되지 않는다는 점을 문구로 분명히 한다.
 */
export function bindPrayers(root) {
  root.querySelectorAll('[data-prayed]').forEach(button => {
    const key = PRAYED_KEY(button.dataset.letter, button.dataset.prayed);
    const paint = on => {
      button.classList.toggle('is-on', on);
      button.textContent = on ? '기도했습니다 ✓' : '기도했습니다';
      button.title = on ? '이 기기에만 남는 표시입니다. 다시 누르면 지워집니다.' : '이 기기에만 표시가 남습니다.';
    };
    let on = false;
    try { on = localStorage.getItem(key) === '1'; } catch { /* 저장 못 해도 화면은 돈다 */ }
    paint(on);
    button.onclick = () => {
      on = !on;
      try { on ? localStorage.setItem(key, '1') : localStorage.removeItem(key); } catch { /* noop */ }
      paint(on);
    };
  });
}

/**
 * 렌더된 편지 안의 드라이브 사진을 모두 싣는다.
 * @returns {Promise<{total:number, failed:number}>} 인쇄 전 대기용으로도 쓴다.
 */
export async function loadLetterImages(root) {
  const images = Array.from(root.querySelectorAll('img[data-drive-id]'));
  const results = await Promise.all(images.map(async img => {
    const result = await loadDriveImage(img, img.dataset.driveId);
    if (!result.ok) {
      const holder = img.closest('.letter__figure, .letter__hero');
      holder?.classList.add('is-failed');
      const fallback = holder?.querySelector('.letter__photo-fallback');
      if (fallback) fallback.hidden = false;
    }
    return result.ok;
  }));
  return { total: images.length, failed: results.filter(ok => !ok).length };
}

/**
 * A4 인쇄 — PRD §6.3
 * 사진 로딩이 끝나기 전에 print() 를 부르면 사진 없는 PDF 가 만들어진다. 반드시 기다린다.
 */
export async function printLetter(root, onStatus) {
  onStatus?.('사진을 불러오는 중입니다…');
  const { failed, total } = await loadLetterImages(root);
  // 디코딩까지 끝나야 인쇄에 반영된다.
  await Promise.all(
    Array.from(root.querySelectorAll('img[data-drive-id]'))
      .filter(img => img.src && !img.dataset.driveFailed)
      .map(img => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()))
  );
  onStatus?.(failed ? `사진 ${total}장 중 ${failed}장을 불러오지 못했습니다.` : '');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.print();
}
