// 구글 드라이브 사진 링크 처리 — PRD v2 §6.2
// 사용자가 복사한 공유 링크는 <img src> 로 직접 쓸 수 없다.
// 파일 ID 를 뽑아 이미지 직링크로 조립하고, 실패 시 2순위 URL 로 폴백한다.

const ID = '[a-zA-Z0-9_-]';

const PATTERNS = [
  new RegExp(`/file/d/(${ID}{10,})`),      // .../file/d/{ID}/view?usp=sharing
  new RegExp(`[?&]id=(${ID}{10,})`),       // .../open?id={ID}, .../uc?id={ID}
  new RegExp(`/d/(${ID}{10,})`),           // docs.google.com/.../d/{ID}/...
  new RegExp(`^(${ID}{20,})$`)             // ID 만 붙여넣은 경우
];

/** 붙여넣은 문자열에서 드라이브 파일 ID 를 추출한다. 못 찾으면 null. */
export function extractDriveId(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (m) return m[1];
  }
  return null;
}

/** 표시용 URL 후보 — 1순위 실패 시 2순위로 폴백한다. */
export function driveImageUrls(id, width = 1600) {
  return [
    `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`,
    `https://lh3.googleusercontent.com/d/${id}=w${width}`
  ];
}

/** 원본 크기 보기용 (탭하면 확대) */
export function driveViewUrl(id) {
  return `https://drive.google.com/file/d/${id}/view`;
}

/**
 * img 요소에 사진을 싣는다. 1순위가 실패하면 자동으로 2순위를 시도한다.
 * @returns {Promise<{ok: boolean, url?: string}>}
 */
export function loadDriveImage(imgEl, id, width = 1600) {
  const candidates = driveImageUrls(id, width);
  return new Promise(resolve => {
    let index = 0;
    const attempt = () => {
      if (index >= candidates.length) {
        imgEl.dataset.driveFailed = 'true';
        resolve({ ok: false });
        return;
      }
      const url = candidates[index++];
      imgEl.onload = () => {
        delete imgEl.dataset.driveFailed;
        imgEl.onload = imgEl.onerror = null;
        resolve({ ok: true, url });
      };
      imgEl.onerror = attempt;
      imgEl.src = url;
    };
    attempt();
  });
}

/** 링크 붙여넣기 즉시 검증 — PRD §6.2 3단계 */
export function verifyDriveImage(id, width = 800) {
  const probe = new Image();
  probe.referrerPolicy = 'no-referrer';
  return loadDriveImage(probe, id, width);
}

export const SHARE_HELP =
  '사진을 불러오지 못했습니다. 구글 드라이브에서 해당 사진의 ' +
  '<strong>공유 → ‘링크가 있는 모든 사용자’</strong> 로 설정한 뒤 링크를 다시 붙여넣어 주세요.';

/** 발행 직전 확인 문구 — 작성자는 로그인 상태라 문제를 알아채지 못한다 (PRD §6.2 경고) */
export const SHARE_CONFIRM =
  '드라이브 사진의 공유 설정을 ‘링크가 있는 모든 사용자’ 로 바꾸었습니다.';

export const PHOTO_LIMIT_HINT = 15;
