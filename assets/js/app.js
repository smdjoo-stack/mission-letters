// 진입점 — 라우팅과 화면 전환 (PRD v2 §2.2, §4)
import { route, setNotFound, start, navigate, currentPath } from './router.js';
import { $, esc } from './util.js';
import { isConfigured, getSettings } from './store.js';
import { renderSettings } from './views/settings.js';
import { renderList } from './views/list.js';
import { renderWrite } from './views/write.js';
import { renderLetter } from './views/letter.js';
import { renderArchive, latestLetterId } from './views/archive.js';

const root = $('#app');

function enterAuthorMode() {
  document.body.classList.remove('mode-reader');
  document.body.classList.add('mode-author');
  paintNav();
}

function paintNav() {
  const nav = $('#nav');
  const path = currentPath();
  const settings = getSettings();
  const items = isConfigured()
    ? [['/list', '편지 목록'], ['/write', '새 편지'], ['/settings', '설정']]
    : [['/settings', '설정']];

  nav.hidden = false;
  nav.innerHTML = `
    <div class="nav__inner">
      <a class="nav__brand" href="#/list">선교편지</a>
      <div class="nav__links">
        ${items.map(([href, label]) =>
          `<a class="nav__link${path.startsWith(href) ? ' is-on' : ''}" href="#${href}">${esc(label)}</a>`
        ).join('')}
      </div>
      ${settings.missionaryName ? `<span class="nav__who">${esc(settings.missionaryName)}</span>` : ''}
    </div>`;
}

route('/', async () => {
  if (isConfigured()) { navigate('/list', { replace: true }); return; }

  // 후원자가 주소만 알고 들어온 경우 — 최신 편지를 바로 연다.
  document.body.classList.remove('mode-author');
  $('#nav').hidden = true;
  root.innerHTML = `<div class="page page--reader"><div class="skeleton">
      <div class="skeleton__line skeleton__line--sm"></div>
      <div class="skeleton__line skeleton__line--lg"></div>
      <div class="skeleton__line"></div>
    </div></div>`;

  const latest = await latestLetterId();
  if (latest) navigate(`/letter/${latest}`, { replace: true });
  else { enterAuthorMode(); renderLanding(); }
});

route('/list', () => { enterAuthorMode(); renderList(root); });
route('/settings', () => { enterAuthorMode(); renderSettings(root); });
route('/write', () => { enterAuthorMode(); renderWrite(root, null); });
route('/write/:id', ({ id }) => { enterAuthorMode(); renderWrite(root, id); });

// 열람 모드 — 후원자가 받는 링크. 작성자용 내비게이션을 숨긴다.
route('/letter/:id', ({ id }) => {
  document.body.classList.remove('mode-author');
  $('#nav').hidden = true;
  renderLetter(root, id);
});

// 지난 편지 보관함 — 후원자가 예전 소식도 찾아볼 수 있는 곳
route('/archive', () => {
  document.body.classList.remove('mode-author');
  $('#nav').hidden = true;
  renderArchive(root);
});

setNotFound(() => {
  enterAuthorMode();
  root.innerHTML = `
    <div class="page page--narrow">
      <div class="empty">
        <h1 class="empty__title">페이지를 찾을 수 없습니다</h1>
        <p class="empty__desc">링크를 다시 확인해 주세요.</p>
        <a class="btn btn--ghost" href="#/">처음으로</a>
      </div>
    </div>`;
});

function renderLanding() {
  root.innerHTML = `
    <div class="page page--narrow">
      <div class="empty">
        <div class="empty__mark" aria-hidden="true">✉︎</div>
        <h1 class="empty__title">선교편지</h1>
        <p class="empty__desc">
          아직 발행된 편지가 없습니다.<br>
          선교사님은 설정을 마치면 편지를 쓸 수 있습니다.
        </p>
        <button class="btn btn--primary btn--lg" id="go-settings">선교사 설정</button>
      </div>
    </div>`;
  $('#go-settings', root).onclick = () => navigate('/settings');
}

window.addEventListener('hashchange', () => {
  if (!$('#nav').hidden) paintNav();
});

start();
