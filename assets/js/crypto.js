// 본문 암호화 — PRD v2 §6.4
// PBKDF2-SHA256(210,000회) 로 비밀번호에서 키를 파생하고 AES-GCM 으로 본문을 암호화한다.
// 외부 라이브러리 없이 브라우저 내장 WebCrypto 만 사용한다. (HTTPS 필요)

export const KDF_ITERATIONS = 210000;

const decoder = new TextDecoder();

function assertCryptoAvailable() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('이 브라우저에서는 암호화를 사용할 수 없습니다. HTTPS 주소로 접속했는지 확인해 주세요.');
  }
}

export function bytesToBase64(bytes) {
  let binary = '';
  const view = new Uint8Array(bytes);
  const CHUNK = 0x8000;
  for (let i = 0; i < view.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, view.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(String(b64).replace(/\s+/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function utf8ToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function base64ToUtf8(b64) {
  return decoder.decode(base64ToBytes(b64));
}

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 편지 본문 객체를 암호화한다.
 * @returns {{crypto: object, ciphertext: string}} 편지 파일에 그대로 넣을 수 있는 형태
 */
export async function encryptBody(body, password) {
  assertCryptoAvailable();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt, KDF_ITERATIONS);
  const data = new TextEncoder().encode(JSON.stringify(body));
  const buf  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  return {
    crypto: {
      alg: 'AES-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: KDF_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv)
    },
    ciphertext: bytesToBase64(buf)
  };
}

/**
 * 편지 파일에서 본문을 복호화한다.
 * 비밀번호가 틀리면 WrongPassword 오류를 던진다.
 */
export async function decryptBody(letterFile, password) {
  assertCryptoAvailable();
  const meta = letterFile?.crypto;
  if (!meta || !letterFile.ciphertext) {
    throw new Error('편지 파일 형식이 올바르지 않습니다.');
  }
  const key = await deriveKey(password, base64ToBytes(meta.salt), meta.iterations || KDF_ITERATIONS);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(meta.iv) },
      key,
      base64ToBytes(letterFile.ciphertext)
    );
    return JSON.parse(decoder.decode(plain));
  } catch {
    const err = new Error('비밀번호가 맞지 않습니다.');
    err.code = 'WRONG_PASSWORD';
    throw err;
  }
}

/** 비밀번호 강도 검사 — PRD §6.4: 8자 이상 강제, 약한 비밀번호 경고 */
export function checkPassword(password) {
  const value = String(password ?? '');
  if (value.length < 8) {
    return { ok: false, message: '비밀번호는 8자 이상이어야 합니다.' };
  }
  if (/^\d+$/.test(value)) {
    return { ok: true, warn: true, message: '숫자로만 되어 있어 추측당하기 쉽습니다. 글자를 섞어 주세요.' };
  }
  if (/^(.)\1+$/.test(value)) {
    return { ok: true, warn: true, message: '같은 글자의 반복은 추측당하기 쉽습니다.' };
  }
  const weak = ['password', '12345678', 'qwertyui', 'missionary', '11111111'];
  if (weak.includes(value.toLowerCase())) {
    return { ok: true, warn: true, message: '흔히 쓰이는 비밀번호입니다. 다른 것을 권합니다.' };
  }
  return { ok: true, warn: false };
}
