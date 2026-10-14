import {
  SYNC_ACTIONS as A,
  SYNC_STATE_FILE,
  isSyncableName,
  makeStateDocument,
  nextBase,
  planSync,
  readBaseState,
  sha256Hex,
  summarizePlan,
} from '@minidrive/shared';

/** Синхронізація у браузері через File System Access API (Chrome, Edge, Opera). */
export const isSyncSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export function pickFolder() {
  return window.showDirectoryPicker({ id: 'minidrive-sync', mode: 'readwrite' });
}

export async function ensurePermission(dir) {
  const opts = { mode: 'readwrite' };
  if ((await dir.queryPermission(opts)) === 'granted') return true;
  return (await dir.requestPermission(opts)) === 'granted';
}

async function scanFolder(dir) {
  const files = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file' || !isSyncableName(name)) continue;
    const file = await handle.getFile();
    files.push({ name: name.normalize('NFC'), handle, size: file.size, mtime: file.lastModified, hash: await sha256Hex(await file.arrayBuffer()) });
  }
  return files;
}

async function readState(dir) {
  try {
    const handle = await dir.getFileHandle(SYNC_STATE_FILE);
    return JSON.parse(await (await handle.getFile()).text());
  } catch {
    return null;
  }
}

async function writeFile(handle, data) {
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

/** Той самий алгоритм, що й у десктоп-клієнті (planSync зі спільного пакета), але з дескрипторами браузера. */
export async function runWebSync({ api, dir, server, username, onProgress = () => {} }) {
  const [local, remoteAll, stateDoc] = await Promise.all([scanFolder(dir), api.listFiles(), readState(dir)]);
  const remote = remoteAll.filter((f) => f.isOwner);
  const base = readBaseState(stateDoc, { server, username });
  const plan = planSync({ local, remote, base });
  const work = plan.filter((p) => p.action !== A.NONE);

  const failed = new Set();
  const log = [];
  for (const item of work) {
    try {
      switch (item.action) {
        case A.UPLOAD:
          await api.uploadFile(item.local.name, await item.local.handle.getFile());
          break;
        case A.UPDATE_REMOTE:
          await api.replaceContent(item.remote.id, item.remote.name, await item.local.handle.getFile());
          break;
        case A.DOWNLOAD: {
          const data = await api.downloadFile(item.remote.id);
          const handle = item.local?.handle ?? (await dir.getFileHandle(item.remote.name, { create: true }));
          await writeFile(handle, data);
          break;
        }
        case A.DELETE_LOCAL:
          await dir.removeEntry(item.local.handle.name);
          break;
        case A.DELETE_REMOTE:
          await api.deleteFile(item.remote.id);
          break;
        default:
          break;
      }
      log.push({ name: item.name, action: item.action, reason: item.reason, ok: true });
    } catch (e) {
      failed.add(item.key);
      log.push({ name: item.name, action: item.action, reason: item.reason, ok: false, error: e.message });
    }
    onProgress({ done: log.length, total: work.length, item: log.at(-1) });
  }

  const doc = makeStateDocument({ server, username, files: nextBase(plan, base, failed) });
  await writeFile(await dir.getFileHandle(SYNC_STATE_FILE, { create: true }), JSON.stringify(doc, null, 2));
  return { summary: summarizePlan(plan), log, failed: failed.size, syncedAt: doc.syncedAt };
}
