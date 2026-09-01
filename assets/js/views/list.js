// 편지 목록 — PRD v2 §7.1
import { $, $$, esc, toast, dialog, periodLabel, formatDate, copyText } from '../util.js';
import { getSettings, isConfigured } from '../store.js';
import { loadIndex, loadLetterFile, removeLetter } from '../letters.js';
import { decryptBody } from '../crypto.js';
import { shareLink } from '../github.js';
import { navigate } from '../router.js';

export async function renderList(root) {
  if (!isConfigured()) { renderSetupPrompt(root); return; }

  root.innerHTML = `
    <div class="page">
      <div class="page__head">
        <h1 class="page__title">편지 목록</h1>
        <button class="btn btn--primary" id="new-btn">새 편지 쓰기</button>
      </div>
      <div id="list-body">
        <div class="skeleton"><div class="skeleton__line"></div><div class="skeleton__line"></div><div class="skeleton__line"></div></div>
      </div>
    </div>`;
  $('#new-btn', root).onclick = () => navigate('/write');

  let index;
  try {
    ({ index } = await loadIndex());
  } catch (err) {
    $('#list-body', root).innerHTML = `
      <div class="empty">
        <h2 class="empty__title">목록을 불러오지 못했습니다</h2>
        <p class="empty__desc">${esc(err.message)}</p>
        <button class="btn btn--ghost" id="retry">다시 시도</button>
      </div>`;
    $('#retry', root).onclick = () => renderList(root);
    return;
  }

  const letters = index.letters || [];
  if (!letters.length) {
    $('#list-body', root).innerHTML = `
      <div class="empty">
        <h2 class="empty__title">아직 작성한 편지가 없습니다</h2>
        <p class="empty__desc">첫 편지를 써 보세요.</p>
        <button class="btn btn--primary" id="empty-new">새 편지 쓰기</button>
      </div>`;
    $('#empty-new', root).onclick = () => navigate('/write');
    return;
  }

  $('#list-body', root).innerHTML = `<ul class="letters">${letters.map(rowHTML).join('')}</ul>`;
  bindRows(root);
  revealTitles(root, letters);
}

function rowHTML(item) {
  return `
    <li class="letters__item" data-id="${esc(item.id)}">
      <div class="letters__main">
        <p class="letters__period">${esc(periodLabel(item.id))}</p>
        <h2 class="letters__title" data-role="title">불러오는 중…</h2>
        <p class="letters__meta">
          발행 ${esc(formatDate(item.publishedAt))}${
            item.updatedAt && item.updatedAt.slice(0, 10) !== item.publishedAt
              ? ` · 수정 ${esc(formatDate(item.updatedAt))}` : ''}
        </p>
      </div>
      <div class="letters__actions">
        <button class="btn btn--sm btn--ghost" data-act="view">보기</button>
        <button class="btn btn--sm btn--ghost" data-act="edit">수정</button>
        <button class="btn btn--sm btn--ghost" data-act="link">링크 복사</button>
        <button class="btn btn--sm btn--danger" data-act="delete">삭제</button>
      </div>
    </li>`;
}

function bindRows(root) {
  $$('.letters__item', root).forEach(row => {
    const id = row.dataset.id;
    row.querySelector('[data-act=view]').onclick  = () => navigate(`/letter/${id}`);
    row.querySelector('[data-act=edit]').onclick  = () => navigate(`/write/${id}`);
    row.querySelector('[data-act=link]').onclick  = async () => {
      const settings = getSettings();
      await copyText(`${shareLink(id)}${settings.defaultPassword ? `\n비밀번호: ${settings.defaultPassword}` : ''}`);
      toast('링크를 복사했습니다.', 'good');
    };
    row.querySelector('[data-act=delete]').onclick = () => confirmDelete(root, id);
  });
}

/**
 * 목록 제목 표시 — PRD §7.1
 * index.json 에는 제목이 없다(공개 파일이라 일부러 넣지 않음).
 * 기본 비밀번호로 각 편지를 복호화해 제목을 보여주고, 실패하면 자물쇠로 표시한다.
 */
async function revealTitles(root, letters) {
  const password = getSettings().defaultPassword;
  // 편지마다 salt 가 달라 키를 재사용할 수 없다. 편지가 쌓여도 목록이 빨리 채워지도록 동시에 푼다.
  await Promise.all(letters.map(async item => {
    const cell = root.querySelector(`.letters__item[data-id="${CSS.escape(item.id)}"] [data-role=title]`);
    if (!cell) return;
    if (!password) {
      cell.textContent = '🔒 (설정에 기본 비밀번호를 넣으면 제목이 보입니다)';
      cell.classList.add('is-locked');
      return;
    }
    try {
      const found = await loadLetterFile(item.id, { preferApi: true });
      const body = await decryptBody(found.file, password);
      cell.textContent = body.title || '(제목 없음)';
    } catch {
      cell.textContent = '🔒 (다른 비밀번호)';
      cell.classList.add('is-locked');
    }
  }));
}

async function confirmDelete(root, id) {
  const ok = await dialog({
    title: '편지를 삭제할까요?',
    confirmLabel: '삭제',
    content: `
      <p class="dialog__lead"><strong>${esc(periodLabel(id))}</strong> 편지를 저장소에서 지웁니다.</p>
      <div class="callout callout--warn">
        되돌릴 수 없습니다. 이미 공유한 링크는 더 이상 열리지 않습니다.
      </div>`
  });
  if (!ok) return;
  try {
    await removeLetter(id);
    toast('편지를 삭제했습니다.', 'good');
    renderList(root);
  } catch (err) {
    toast(err.message, 'bad');
  }
}

function renderSetupPrompt(root) {
  const settings = getSettings();
  const missing = [];
  if (!settings.repoOwner || !settings.repoName) missing.push('GitHub 저장소');

  root.innerHTML = `
    <div class="page page--narrow">
      <div class="empty">
        <div class="empty__mark" aria-hidden="true">✉︎</div>
        <h1 class="empty__title">먼저 설정을 마쳐 주세요</h1>
        <p class="empty__desc">
          편지를 발행하려면 ${esc(missing.join(' · '))} 정보가 필요합니다.<br>
          설정은 한 번만 하면 됩니다.
        </p>
        <button class="btn btn--primary btn--lg" id="go-settings">설정하러 가기</button>
      </div>
    </div>`;
  $('#go-settings', root).onclick = () => navigate('/settings');
}
