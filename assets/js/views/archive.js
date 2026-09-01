// 지난 편지 (후원자용 보관함) — 최신 편지가 맨 위, 지난 편지도 열 수 있다.
import { $, $$, esc, periodLabel, formatDate } from '../util.js';
import { loadIndex, loadLetterFile } from '../letters.js';
import { decryptBody } from '../crypto.js';
import { recallReaderPassword } from '../store.js';
import { navigate } from '../router.js';

export async function renderArchive(root) {
  document.body.classList.add('mode-reader');

  root.innerHTML = `
    <div class="page page--reader">
      <header class="archive__head">
        <h1 class="archive__title">지난 선교편지</h1>
        <p class="archive__lead">최신 편지가 맨 위에 있습니다.</p>
      </header>
      <div id="archive-body">
        <div class="skeleton"><div class="skeleton__line"></div><div class="skeleton__line"></div><div class="skeleton__line"></div></div>
      </div>
    </div>`;

  let letters = [];
  try {
    const { index } = await loadIndex();
    letters = index.letters || [];
  } catch (err) {
    $('#archive-body', root).innerHTML = `
      <div class="empty">
        <h2 class="empty__title">목록을 불러오지 못했습니다</h2>
        <p class="empty__desc">${esc(err.message)}</p>
      </div>`;
    return;
  }

  if (!letters.length) {
    $('#archive-body', root).innerHTML = `
      <div class="empty">
        <h2 class="empty__title">아직 편지가 없습니다</h2>
        <p class="empty__desc">첫 편지가 발행되면 이곳에 쌓입니다.</p>
        <a class="btn btn--primary btn--lg" href="#/settings">편지 쓰러 가기</a>
      </div>`;
    return;
  }

  // index.json 은 최신순으로 저장되지만, 혹시 어긋나도 여기서 한 번 더 맞춘다.
  const sorted = [...letters].sort((a, b) =>
    String(b.publishedAt).localeCompare(String(a.publishedAt)) || String(b.id).localeCompare(String(a.id)));

  $('#archive-body', root).innerHTML = `
    <ul class="archive">
      ${sorted.map((item, i) => `
        <li class="archive__item${i === 0 ? ' is-latest' : ''}" data-id="${esc(item.id)}">
          <button class="archive__link" type="button">
            <span class="archive__period">
              ${esc(periodLabel(item.id))}${i === 0 ? '<em class="archive__badge">최신</em>' : ''}
            </span>
            <span class="archive__name" data-role="title">🔒 비밀번호를 입력하면 제목이 보입니다</span>
            <span class="archive__date">${esc(formatDate(item.publishedAt))}</span>
          </button>
        </li>`).join('')}
    </ul>`;

  $$('.archive__item', root).forEach(row => {
    row.querySelector('.archive__link').onclick = () => navigate(`/letter/${row.dataset.id}`);
  });

  $('#archive-body', root).insertAdjacentHTML('beforeend',
    '<p class="reader-foot"><a href="#/settings">선교사님이신가요? 편지 쓰러 가기</a></p>');

  revealTitles(root, sorted);
}

/**
 * 한 번 통한 비밀번호가 기억되어 있으면 제목을 풀어서 보여준다.
 * 편지마다 salt 가 달라 키를 재사용할 수 없으므로 동시에 푼다.
 */
async function revealTitles(root, letters) {
  await Promise.all(letters.map(async item => {
    const cell = root.querySelector(`.archive__item[data-id="${CSS.escape(item.id)}"] [data-role=title]`);
    if (!cell) return;
    const password = recallReaderPassword(item.id);
    if (!password) return;
    try {
      const found = await loadLetterFile(item.id, { preferApi: false });
      const body = await decryptBody(found.file, password);
      cell.textContent = body.title || '(제목 없음)';
      cell.classList.add('is-open');
    } catch { /* 다른 비밀번호면 자물쇠 그대로 둔다 */ }
  }));
}

/** 편지 보기 화면에서 쓸 이웃 편지 찾기 — 지난 편지 / 다음 편지 */
export async function findNeighbors(id) {
  try {
    const { index } = await loadIndex();
    const letters = [...(index.letters || [])].sort((a, b) =>
      String(b.publishedAt).localeCompare(String(a.publishedAt)) || String(b.id).localeCompare(String(a.id)));
    const i = letters.findIndex(item => item.id === id);
    if (i < 0) return { older: null, newer: null, total: letters.length };
    return {
      older: letters[i + 1] || null,   // 목록은 최신순 — 뒤로 갈수록 지난 편지
      newer: letters[i - 1] || null,
      total: letters.length
    };
  } catch {
    return { older: null, newer: null, total: 0 };
  }
}

/** 후원자가 처음 들어왔을 때 보여줄 최신 편지 */
export async function latestLetterId() {
  try {
    const { index } = await loadIndex();
    const letters = [...(index.letters || [])].sort((a, b) =>
      String(b.publishedAt).localeCompare(String(a.publishedAt)) || String(b.id).localeCompare(String(a.id)));
    return letters[0]?.id || null;
  } catch {
    return null;
  }
}
