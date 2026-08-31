// 해시 라우팅 — PRD v2 §4
// GitHub Pages 에서 새로고침 시 404 가 나지 않도록 해시를 쓴다.

const routes = [];
let notFound = null;

export function route(pattern, handler) {
  // '/write/:id' → /^\/write\/([^/]+)$/
  const names = [];
  const regex = new RegExp('^' + pattern.replace(/:([\w]+)/g, (_, name) => {
    names.push(name);
    return '([^/]+)';
  }).replace(/\//g, '\\/') + '$');
  routes.push({ regex, names, handler });
}

export function setNotFound(handler) { notFound = handler; }

export function currentPath() {
  const hash = location.hash.replace(/^#/, '');
  return hash || '/';
}

export function navigate(path, { replace = false } = {}) {
  const target = '#' + path;
  if (replace) location.replace(target);
  else location.hash = path;
}

export function start() {
  const run = () => {
    const path = currentPath();
    for (const { regex, names, handler } of routes) {
      const match = regex.exec(path);
      if (match) {
        const params = {};
        names.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
        window.scrollTo(0, 0);
        handler(params);
        return;
      }
    }
    notFound?.(path);
  };
  window.addEventListener('hashchange', run);
  run();
}
