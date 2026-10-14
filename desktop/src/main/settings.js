import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_VISIBLE_COLUMNS, FILTER_ALL } from '@minidrive/shared';

export const DEFAULT_SETTINGS = {
  serverUrl: 'http://localhost:3001',
  token: null,
  user: null,
  sort: 'asc',
  filter: FILTER_ALL,
  visibleColumns: DEFAULT_VISIBLE_COLUMNS,
  // Папка синхронізації окремо для кожного акаунта: { 'http://сервер|логін': { folder, lastSync } }
  sync: {},
  autoSync: false,
};

/** Налаштування та сесія клієнта у userData/settings.json. */
export function createSettingsStore(dir) {
  const file = path.join(dir, 'settings.json');
  let data = { ...DEFAULT_SETTINGS };
  try {
    data = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    // перший запуск
  }
  return {
    get: () => data,
    update(patch) {
      data = { ...data, ...patch };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      return data;
    },
  };
}
