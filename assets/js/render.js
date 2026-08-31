// 편지 본문 렌더링 — 보기 화면과 작성 미리보기, 인쇄가 모두 같은 결과를 쓰도록 한 곳에 둔다.

import { esc, paragraphs, periodLabel } from './util.js';
import { loadDriveImage, driveViewUrl, SHARE_HELP } from './drive.js';

/** 편지 한 통을 HTML 로. 사진은 자리만 잡고 loadLetterImages() 에서 실제로 싣는다. */
export function letterHTML(body, meta = {}) {
  const period = body.period || periodLabel(meta.id);
  const blocks = (body.blocks || []).map(block => {
    if (block.type === 'image' && block.driveId) {
      return `
        <figure class="letter__figure">
          <a href="${esc(driveViewUrl(block.driveId))}" target="_blank" rel="noopener noreferrer">
            <img class="letter__photo" data-drive-id="${esc(block.driveId)}"
                 alt="${esc(block.caption || '선교 사진')}" referrerpolicy="no-referrer">
          </a>
          <div class="letter__photo-fallback" hidden>${SHARE_HELP}</div>
          ${block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ''}
        </figure>`;
    }
    if (block.type === 'text' && String(block.value || '').trim()) {
      return `<div class="letter__text">${paragraphs(block.value)}</div>`;
    }
    return '';
  }).join('');

  return `
    <article class="letter">
      <header class="letter__head">
        ${period ? `<p class="letter__period">${esc(period)}</p>` : ''}
        <h1 class="letter__title">${esc(body.title || '선교편지')}</h1>
        ${body.authorName ? `<p class="letter__author">${esc(body.authorName)}</p>` : ''}
      </header>
      ${body.greeting ? `<p class="letter__greeting">${esc(body.greeting)}</p>` : ''}
      <div class="letter__body">${blocks}</div>
      ${body.closing ? `<div class="letter__closing">${paragraphs(body.closing)}</div>` : ''}
    </article>`;
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
      const figure = img.closest('.letter__figure');
      figure?.classList.add('is-failed');
      const fallback = figure?.querySelector('.letter__photo-fallback');
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
