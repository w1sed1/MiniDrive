import { VARIANT, FILTER_ALL, FILTER_VARIANT } from './variant.js';

/** Розширення файлу в нижньому регістрі з крапкою (".js") або "" якщо його немає. */
export function getExtension(name) {
  const base = String(name ?? '');
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot).toLowerCase();
}

/** Як показувати вміст файлу при кліку: 'text' | 'image' | null (згідно варіанту). */
export function previewKind(name) {
  const ext = getExtension(name);
  if (VARIANT.previewText.includes(ext)) return 'text';
  if (VARIANT.previewImage.includes(ext)) return 'image';
  return null;
}

const collator = new Intl.Collator('uk', { numeric: true, sensitivity: 'base' });

/**
 * Індивідуальна операція варіанту: сортування за назвою.
 * Повертає новий масив, вхідний не змінює. Порівняння без урахування регістру,
 * числа в назвах порівнюються як числа ("file2" < "file10"), при рівності — за id (стабільно).
 */
export function sortByName(files, direction = 'asc') {
  if (direction !== 'asc' && direction !== 'desc') {
    throw new Error(`Невідомий напрям сортування: ${direction}`);
  }
  const sign = direction === 'asc' ? 1 : -1;
  return [...files].sort((a, b) => {
    const byName = collator.compare(a.name, b.name);
    if (byName !== 0) return sign * byName;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

/** Індивідуальна операція варіанту: фільтр «усі файли» або лише .txt / .jpg. */
export function filterByType(files, mode = FILTER_ALL) {
  if (mode === FILTER_ALL) return [...files];
  if (mode === FILTER_VARIANT) {
    return files.filter((f) => VARIANT.filterExtensions.includes(getExtension(f.name)));
  }
  throw new Error(`Невідомий режим фільтра: ${mode}`);
}

/** Фільтр, потім сортування — те, що бачить користувач у таблиці. */
export function applyView(files, { sort = 'asc', filter = FILTER_ALL } = {}) {
  return sortByName(filterByType(files, filter), sort);
}
