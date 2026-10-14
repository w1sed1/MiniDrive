// Міст між рендерером і main-процесом. Рендерер бачить лише window.drive.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (channel, ...args) =>
  ipcRenderer.invoke(channel, ...args).then((res) => {
    if (!res.ok) {
      const err = new Error(res.error);
      err.code = res.code;
      throw err;
    }
    return res.data;
  });

const on = (channel, cb) => {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('drive', {
  getSession: () => call('session:get'),
  login: (form) => call('auth:login', form),
  register: (form) => call('auth:register', form),
  logout: () => call('auth:logout'),
  updateSettings: (patch) => call('settings:update', patch),

  listFiles: () => call('files:list'),
  uploadDialog: () => call('files:upload-dialog'),
  uploadPaths: (paths) => call('files:upload-paths', paths),
  pathForFile: (file) => webUtils.getPathForFile(file),
  download: (id) => call('files:download', id),
  preview: (id) => call('files:preview', id),
  saveText: (id, text) => call('files:save-text', id, text),
  replaceDialog: (id) => call('files:replace-dialog', id),
  rename: (id, name) => call('files:rename', id, name),
  remove: (ids) => call('files:delete', ids),

  listShares: (id) => call('shares:list', id),
  share: (id, username) => call('shares:add', id, username),
  unshare: (id, userId) => call('shares:remove', id, userId),

  chooseSyncFolder: () => call('sync:choose-folder'),
  openSyncFolder: () => call('sync:open-folder'),
  sync: () => call('sync:run'),

  prefetchForDrag: (id) => call('drag:prefetch', id),
  startDrag: (id) => ipcRenderer.send('drag:start', id),

  on,
});
