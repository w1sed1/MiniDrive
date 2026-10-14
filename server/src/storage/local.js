import fs from 'node:fs/promises';
import path from 'node:path';

/** Зберігання вмісту файлів у локальній папці сервера. */
export function createLocalStorage(dir) {
  const resolve = (key) => {
    if (!/^[a-zA-Z0-9-]+$/.test(key)) throw new Error(`Недопустимий ключ сховища: ${key}`);
    return path.join(dir, key);
  };
  return {
    kind: 'local',
    async put(key, buffer) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(resolve(key), buffer);
      return key;
    },
    async get(storageKey) {
      return fs.readFile(resolve(storageKey));
    },
    async remove(storageKey) {
      await fs.rm(resolve(storageKey), { force: true });
    },
  };
}
