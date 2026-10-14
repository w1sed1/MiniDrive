import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow, app, dialog, ipcMain, nativeImage, shell } from 'electron';
import { ApiError, createApiClient, normalizeVisibleColumns, previewKind, validateFileName } from '@minidrive/shared';
import { createSettingsStore } from './settings.js';
import { runSync } from './sync-engine.js';

const here = import.meta.dirname;
const ICON = path.join(here, '../../assets/icon.png');
const MAX_TEXT_PREVIEW = 1024 * 1024;

/**
 * Main-процес: вікно, сесія, REST-клієнт, системні діалоги, синхронізація і drag-out.
 * Рендерер не має доступу до мережі чи диска — лише до window.drive (див. preload.cjs).
 */
export function startApp({ onWindowReady, windowOptions = {} } = {}) {
  if (process.env.MINIDRIVE_USER_DATA) app.setPath('userData', process.env.MINIDRIVE_USER_DATA);

  let win = null;
  let settings = null;
  let api = null;
  let lastFiles = new Map(); // id → файл з останнього списку (для drag-out та перевірки версій)
  const dragCache = new Map(); // id → { hash, path }
  let syncRunning = false;
  let autoSyncTimer = null;

  const send = (channel, payload) => win?.webContents.send(channel, payload);

  function makeApi() {
    api = createApiClient({ baseUrl: settings.get().serverUrl, getToken: () => settings.get().token });
  }

  const accountKey = () => `${settings.get().serverUrl}|${settings.get().user?.username ?? ''}`;
  const accountSync = () => settings.get().sync?.[accountKey()] ?? { folder: null, lastSync: null };
  const updateAccountSync = (patch) =>
    settings.update({ sync: { ...settings.get().sync, [accountKey()]: { ...accountSync(), ...patch } } });

  function publicState() {
    const s = settings.get();
    return {
      serverUrl: s.serverUrl,
      user: s.token ? s.user : null,
      sort: s.sort,
      filter: s.filter,
      visibleColumns: normalizeVisibleColumns(s.visibleColumns),
      syncFolder: s.token ? accountSync().folder : null,
      lastSync: s.token ? accountSync().lastSync : null,
      autoSync: s.autoSync,
    };
  }

  /** Обгортка IPC: помилки API повертаються як { error } замість винятку. */
  function handle(channel, fn) {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return { ok: true, data: await fn(...args) };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401 && settings.get().token) {
          settings.update({ token: null });
          send('session:expired');
        }
        return { ok: false, error: e.message, code: e.code ?? null };
      }
    });
  }

  // ------------------------------------------------------------ сесія
  async function authenticate(kind, { serverUrl, username, password }) {
    settings.update({ serverUrl: serverUrl.trim().replace(/\/+$/, '') });
    makeApi();
    const res = kind === 'login' ? await api.login(username, password) : await api.register(username, password);
    settings.update({ token: res.token, user: res.user });
    scheduleAutoSync();
    return publicState();
  }

  handle('session:get', async () => publicState());
  handle('auth:login', (form) => authenticate('login', form));
  handle('auth:register', (form) => authenticate('register', form));
  handle('auth:logout', async () => {
    settings.update({ token: null, user: null });
    scheduleAutoSync();
    return publicState();
  });
  handle('settings:update', async (patch) => {
    const allowed = {};
    for (const key of ['sort', 'filter', 'visibleColumns', 'autoSync']) if (key in patch) allowed[key] = patch[key];
    if (allowed.visibleColumns) allowed.visibleColumns = normalizeVisibleColumns(allowed.visibleColumns);
    settings.update(allowed);
    if ('autoSync' in allowed) scheduleAutoSync();
    return publicState();
  });

  // ------------------------------------------------------------ файли
  handle('files:list', async () => {
    const files = await api.listFiles();
    lastFiles = new Map(files.map((f) => [f.id, f]));
    return files;
  });

  /** Завантаження з диска за шляхами (діалог або drag-n-drop). Конфлікт назв — системний діалог. */
  async function uploadPaths(paths) {
    const results = [];
    let applyToAll = null;
    for (const p of paths) {
      const name = path.basename(p).normalize('NFC');
      try {
        const stat = await fs.stat(p);
        if (!stat.isFile()) {
          results.push({ name, status: 'skipped', reason: 'Папки не завантажуються — лише файли' });
          continue;
        }
        const invalid = validateFileName(name);
        if (invalid) throw new Error(invalid);
        const data = await fs.readFile(p);
        try {
          await api.uploadFile(name, data);
          results.push({ name, status: 'uploaded' });
        } catch (e) {
          if (e.code !== 'FILE_EXISTS') throw e;
          let choice = applyToAll;
          if (!choice) {
            const { response, checkboxChecked } = await dialog.showMessageBox(win, {
              type: 'question',
              buttons: ['Замінити', 'Пропустити', 'Скасувати'],
              defaultId: 0,
              cancelId: 2,
              message: `Файл «${name}» уже є на диску`,
              detail: 'Замінити його новою версією? Попередній вміст буде втрачено.',
              checkboxLabel: paths.length > 1 ? 'Застосувати до решти файлів' : undefined,
            });
            choice = ['replace', 'skip', 'cancel'][response];
            if (checkboxChecked) applyToAll = choice;
          }
          if (choice === 'cancel') break;
          if (choice === 'skip') {
            results.push({ name, status: 'skipped', reason: 'Файл уже існує' });
            continue;
          }
          await api.uploadFile(name, data, { overwrite: true });
          results.push({ name, status: 'replaced' });
        }
      } catch (e) {
        results.push({ name, status: 'error', reason: e.message });
      }
    }
    return results;
  }

  handle('files:upload-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Завантажити файли на диск',
      properties: ['openFile', 'multiSelections'],
    });
    return canceled ? [] : uploadPaths(filePaths);
  });
  handle('files:upload-paths', (paths) => uploadPaths(paths));

  handle('files:download', async (id) => {
    const file = lastFiles.get(id);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Вивантажити файл на комп’ютер',
      defaultPath: path.join(app.getPath('downloads'), file?.name ?? 'file'),
    });
    if (canceled || !filePath) return null;
    await fs.writeFile(filePath, await api.downloadFile(id));
    return { path: filePath };
  });

  handle('files:preview', async (id) => {
    const file = lastFiles.get(id);
    const kind = file ? previewKind(file.name) : null;
    if (!kind) return { kind: null };
    const bytes = await api.downloadFile(id);
    if (kind === 'text') {
      if (bytes.length > MAX_TEXT_PREVIEW) return { kind: 'text', text: null, tooLarge: true };
      return { kind: 'text', text: new TextDecoder('utf-8').decode(bytes) };
    }
    return { kind: 'image', dataUrl: `data:${file.mime};base64,${Buffer.from(bytes).toString('base64')}` };
  });

  handle('files:save-text', async (id, text) => {
    const file = lastFiles.get(id);
    return api.replaceContent(id, file.name, Buffer.from(text, 'utf8'));
  });

  handle('files:replace-dialog', async (id) => {
    const file = lastFiles.get(id);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: `Нова версія для «${file?.name}»`,
      properties: ['openFile'],
    });
    if (canceled) return null;
    return api.replaceContent(id, file.name, await fs.readFile(filePaths[0]));
  });

  handle('files:rename', (id, name) => api.renameFile(id, name));

  handle('files:delete', async (ids) => {
    const names = ids.map((id) => lastFiles.get(id)?.name ?? id);
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Видалити', 'Скасувати'],
      defaultId: 1,
      cancelId: 1,
      message: names.length === 1 ? `Видалити «${names[0]}»?` : `Видалити ${names.length} файли(ів)?`,
      detail: 'Файл буде видалено з сервера без можливості відновлення.',
    });
    if (response !== 0) return { deleted: 0 };
    for (const id of ids) await api.deleteFile(id);
    return { deleted: ids.length };
  });

  handle('shares:list', (id) => api.listShares(id));
  handle('shares:add', (id, username) => api.shareFile(id, username));
  handle('shares:remove', (id, userId) => api.unshareFile(id, userId));

  // ------------------------------------------------------------ синхронізація
  handle('sync:choose-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Папка для синхронізації',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!canceled) updateAccountSync({ folder: filePaths[0], lastSync: null });
    return publicState();
  });

  handle('sync:open-folder', async () => {
    const dir = accountSync().folder;
    if (dir) await shell.openPath(dir);
    return null;
  });

  async function doSync() {
    const s = settings.get();
    const { folder } = accountSync();
    if (!folder) throw new Error('Спочатку виберіть локальну папку');
    if (syncRunning) throw new Error('Синхронізація вже виконується');
    syncRunning = true;
    send('sync:status', { running: true });
    try {
      const result = await runSync({
        api,
        dir: folder,
        server: s.serverUrl,
        username: s.user.username,
        removeLocal: (p) => shell.trashItem(p),
        onProgress: (p) => send('sync:progress', p),
      });
      updateAccountSync({ lastSync: result.syncedAt });
      send('sync:done', result);
      return result;
    } finally {
      syncRunning = false;
      send('sync:status', { running: false });
    }
  }

  handle('sync:run', () => doSync());

  function scheduleAutoSync() {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
    const s = settings.get();
    if (s.autoSync && s.token) {
      autoSyncTimer = setInterval(() => {
        if (accountSync().folder && !syncRunning) doSync().catch((e) => send('sync:error', e.message));
      }, 30_000);
    }
  }

  // ------------------------------------------------------------ drag-out (перетягування з вікна у Finder/Провідник)
  async function ensureLocalCopy(id) {
    const file = lastFiles.get(id);
    if (!file) throw new Error('Файл не знайдено, оновіть список');
    const cached = dragCache.get(id);
    if (cached && cached.hash === file.hash) return cached.path;
    const dir = path.join(app.getPath('temp'), 'minidrive-drag', id);
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, file.name);
    await fs.writeFile(target, await api.downloadFile(id));
    dragCache.set(id, { hash: file.hash, path: target });
    return target;
  }

  handle('drag:prefetch', async (id) => {
    await ensureLocalCopy(id);
    return null;
  });

  ipcMain.on('drag:start', async (event, id) => {
    try {
      const filePath = await ensureLocalCopy(id);
      let icon = await app.getFileIcon(filePath, { size: 'normal' }).catch(() => null);
      if (!icon || icon.isEmpty()) icon = nativeImage.createFromPath(ICON).resize({ width: 48 });
      event.sender.startDrag({ file: filePath, icon });
    } catch (e) {
      send('toast', { type: 'error', text: `Не вдалося перетягнути: ${e.message}` });
    }
  });

  // ------------------------------------------------------------ вікно
  function createWindow() {
    const { webPreferences: extraPrefs, ...extraOptions } = windowOptions;
    win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1000,
      minHeight: 560,
      title: 'MiniDrive',
      icon: ICON,
      backgroundColor: '#f6f7f9',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      webPreferences: {
        preload: path.join(here, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        ...extraPrefs,
      },
      ...extraOptions,
    });
    // Посилання та випадково кинуті файли не повинні відкриватися всередині вікна.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.loadFile(path.join(here, '../../dist-renderer/index.html'));
    win.webContents.once('did-finish-load', () => onWindowReady?.(win));
    win.on('closed', () => {
      win = null;
    });
  }

  app.whenReady().then(() => {
    settings = createSettingsStore(app.getPath('userData'));
    makeApi();
    scheduleAutoSync();
    if (process.platform === 'darwin') app.dock?.setIcon(ICON);
    createWindow();
    app.on('activate', () => {
      if (!win) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
