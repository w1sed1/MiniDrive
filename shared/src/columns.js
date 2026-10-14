/** Стовпці таблиці файлів. Стовпець «Назва» завжди видимий, решту можна приховати. */
export const COLUMNS = [
  { key: 'name', label: 'Назва', required: true },
  { key: 'size', label: 'Розмір' },
  { key: 'createdAt', label: 'Створено' },
  { key: 'updatedAt', label: 'Змінено' },
  { key: 'uploadedBy', label: 'Завантажив' },
  { key: 'editedBy', label: 'Редагував' },
  { key: 'owner', label: 'Власник' },
];

export const DEFAULT_VISIBLE_COLUMNS = COLUMNS.map((c) => c.key);

/** Нормалізує набір видимих стовпців: прибирає невідомі ключі, завжди лишає «Назва». */
export function normalizeVisibleColumns(keys) {
  const known = new Set(COLUMNS.map((c) => c.key));
  const set = new Set((keys ?? DEFAULT_VISIBLE_COLUMNS).filter((k) => known.has(k)));
  set.add('name');
  return COLUMNS.map((c) => c.key).filter((k) => set.has(k));
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} Б`;
  const units = ['КБ', 'МБ', 'ГБ'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

const base = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
const fullFormat = new Intl.DateTimeFormat('uk-UA', { ...base, second: '2-digit' });
const shortFormat = new Intl.DateTimeFormat('uk-UA', base);

/** Дата і час: повний формат із секундами (перегляд) або короткий (таблиця). */
export function formatDateTime(iso, { short = false } = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : (short ? shortFormat : fullFormat).format(d);
}

/** Текст комірки для стовпця. */
export function cellText(file, key) {
  switch (key) {
    case 'size':
      return formatSize(file.size);
    case 'createdAt':
    case 'updatedAt':
      return formatDateTime(file[key], { short: true });
    case 'editedBy':
      return file.editedBy ?? '—';
    default:
      return file[key] ?? '—';
  }
}
