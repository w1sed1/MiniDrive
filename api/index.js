// Точка входу serverless-функції Vercel: той самий Express-застосунок, що й локальний сервер.
// vercel.json переписує всі запити /api/* сюди; req.url лишається оригінальним (/api/files, …).
import { createApp } from '../server/src/app.js';
import { loadConfig } from '../server/src/config.js';
import { openDatabase } from '../server/src/db.js';
import { createStorage } from '../server/src/storage/index.js';

let appPromise = null;

async function getApp() {
  const config = loadConfig();
  const repo = await openDatabase({ url: config.databaseUrl, authToken: config.databaseAuthToken });
  return createApp({ repo, storage: createStorage(config), config });
}

export default async function handler(req, res) {
  appPromise ??= getApp().catch((e) => {
    appPromise = null; // наступний запит спробує ще раз
    throw e;
  });
  try {
    const app = await appPromise;
    return app(req, res);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: `Сервер не налаштовано: ${e.message}`, code: 'CONFIG' }));
  }
}
