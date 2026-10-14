const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
// Символи, заборонені у назвах файлів на Windows / macOS / Linux, а також керівні символи.
// eslint-disable-next-line no-control-regex
const BAD_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/;

export const MAX_FILENAME_LENGTH = 255;

export function validateUsername(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Вкажіть логін';
  if (!USERNAME_RE.test(v)) return 'Логін: 3–32 символи, латиниця, цифри, «_», «.», «-»';
  return null;
}

export function validatePassword(value) {
  const v = String(value ?? '');
  if (v.length < 6) return 'Пароль має містити щонайменше 6 символів';
  if (v.length > 128) return 'Пароль задовгий';
  return null;
}

export function validateFileName(value) {
  const v = String(value ?? '');
  if (!v.trim()) return 'Назва файлу не може бути порожньою';
  if (v !== v.trim()) return 'Назва не може починатися або закінчуватися пробілом';
  if (v === '.' || v === '..') return 'Недопустима назва файлу';
  if (v.length > MAX_FILENAME_LENGTH) return `Назва довша за ${MAX_FILENAME_LENGTH} символів`;
  if (BAD_FILENAME_CHARS.test(v)) return 'Назва містить заборонені символи \\ / : * ? " < > |';
  return null;
}
