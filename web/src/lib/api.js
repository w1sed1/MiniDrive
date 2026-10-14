import { createApiClient } from '@minidrive/shared';

const TOKEN_KEY = 'minidrive.session';

/** Адреса API: у розробці — VITE_API_URL, на Vercel — той самий origin. */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
/** Ідентифікатор сервера для стану синхронізації (збігається з адресою сервера в десктоп-клієнті). */
export const SERVER_ID = API_BASE || window.location.origin;

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY)) ?? null;
  } catch {
    return null;
  }
}

let session = readSession();

export const api = createApiClient({ baseUrl: API_BASE, getToken: () => session?.token ?? null });

export const getSession = () => session;

export function saveSession(next) {
  session = next;
  try {
    if (next) localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // приватний режим — сесія житиме до перезавантаження сторінки
  }
}

/** Абсолютна адреса вмісту файлу (для <img>, посилань і перетягування на робочий стіл). */
export function absoluteContentUrl(file, opts) {
  return new URL(api.contentUrl(file, opts), window.location.href).href;
}
