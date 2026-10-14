import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { createStorage } from './storage/index.js';
import { createApp } from './app.js';

const config = loadConfig();
const repo = await openDatabase({ url: config.databaseUrl, authToken: config.databaseAuthToken });
const app = createApp({ repo, storage: createStorage(config), config });

app.listen(config.port, () => {
  console.log(`MiniDrive API: http://localhost:${config.port}  (сховище: ${config.storage})`);
});
