// Демо-дані: користувачі olena / taras (пароль secret1) і набір файлів.
// Працює через справжній REST API (сервер піднімається тимчасово в цьому ж процесі).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiClient } from '@minidrive/shared';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { createStorage } from '../src/storage/index.js';
import { createApp } from '../src/app.js';

const samples = path.join(path.dirname(fileURLToPath(import.meta.url)), 'samples');
const PASSWORD = 'secret1';

const config = loadConfig();
// --reset: почати з чистої локальної бази (лише для локального сховища).
if (process.argv.includes('--reset') && config.storage === 'local' && config.databaseUrl.startsWith('file:')) {
  fs.rmSync(path.dirname(config.filesDir), { recursive: true, force: true });
}
const repo = await openDatabase({ url: config.databaseUrl, authToken: config.databaseAuthToken });
const server = createApp({ repo, storage: createStorage(config), config }).listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function session(username) {
  let token = null;
  const api = createApiClient({ baseUrl, getToken: () => token });
  const res = await api.register(username, PASSWORD).catch(() => api.login(username, PASSWORD));
  token = res.token;
  return api;
}

const read = (name) => fs.readFileSync(path.join(samples, name));
const upload = (api, name) => api.uploadFile(name, read(name), { overwrite: true });

try {
  const olena = await session('olena');
  const taras = await session('taras');

  const olenaFiles = ['app.js', 'utils.js', 'logo.png', 'chart.png', 'photo.jpg', 'notes.txt', 'file2.txt', 'file10.txt', 'Звіт.txt', 'README.md', 'settings.json'];
  const uploaded = {};
  for (const name of olenaFiles) uploaded[name] = await upload(olena, name);

  // Тарас завантажує план і ділиться з Оленою; Олена його редагує → «Завантажив: taras, Редагував: olena».
  const plan = await upload(taras, 'план.txt');
  await taras.shareFile(plan.id, 'olena');
  await olena.replaceContent(plan.id, 'план.txt', Buffer.concat([read('план.txt'), Buffer.from('3. Додати скріни у звіт (Олена)\n')]));

  // Олена ділиться logo.png з Тарасом, і той його оновлює.
  await olena.shareFile(uploaded['logo.png'].id, 'taras');
  await taras.replaceContent(uploaded['logo.png'].id, 'logo.png', read('logo.png'));
  await olena.replaceContent(uploaded['notes.txt'].id, 'notes.txt', Buffer.concat([read('notes.txt'), Buffer.from('- порівняльний аналіз\n')]));

  // Розносимо дати в минуле, щоб у таблиці були різні значення.
  const files = await repo.all('SELECT id, name, edited_by FROM files ORDER BY name');
  const DAY = 24 * 3600 * 1000;
  let i = 0;
  for (const f of files) {
    const created = Date.now() - (14 - i) * DAY - i * 3_600_000;
    const updated = f.edited_by ? created + (i % 4 + 1) * DAY : created;
    await repo.run('UPDATE files SET created_at = ?, updated_at = ? WHERE id = ?', [
      new Date(created).toISOString(),
      new Date(Math.min(updated, Date.now())).toISOString(),
      f.id,
    ]);
    i += 1;
  }
  console.log(`Готово: ${files.length} файлів. Користувачі olena / taras, пароль ${PASSWORD}`);
} finally {
  server.close();
}
