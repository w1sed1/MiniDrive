import fs from 'node:fs/promises';
import path from 'node:path';
import { SYNC_ACTIONS as A, makeStateDocument, nextBase, planSync, readBaseState, summarizePlan } from '@minidrive/shared';
import { readSyncState, scanFolder, writeFileAtomic, writeSyncState } from './local-folder.js';

/**
 * Двостороння синхронізація локальної папки з власними файлами користувача на сервері.
 * removeLocal — як видаляти локальні файли (у застосунку: у Кошик через shell.trashItem).
 */
export async function runSync({ api, dir, server, username, removeLocal = (p) => fs.rm(p), onProgress = () => {} }) {
  const [local, remoteAll, stateDoc] = await Promise.all([scanFolder(dir), api.listFiles(), readSyncState(dir)]);
  const remote = remoteAll.filter((f) => f.isOwner);
  const base = readBaseState(stateDoc, { server, username });
  const plan = planSync({ local, remote, base });
  const work = plan.filter((p) => p.action !== A.NONE);

  const failed = new Set();
  const log = [];
  let done = 0;
  for (const item of work) {
    try {
      switch (item.action) {
        case A.UPLOAD:
          await api.uploadFile(item.local.name, await fs.readFile(item.local.path));
          break;
        case A.UPDATE_REMOTE:
          await api.replaceContent(item.remote.id, item.remote.name, await fs.readFile(item.local.path));
          break;
        case A.DOWNLOAD: {
          const data = await api.downloadFile(item.remote.id);
          await writeFileAtomic(item.local?.path ?? path.join(dir, item.remote.name), data, item.remote.updatedAt);
          break;
        }
        case A.DELETE_LOCAL:
          await removeLocal(item.local.path);
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
    done += 1;
    onProgress({ done, total: work.length, item: log.at(-1) });
  }

  const files = nextBase(plan, base, failed);
  const doc = makeStateDocument({ server, username, files });
  await writeSyncState(dir, doc);
  return { summary: summarizePlan(plan), log, failed: failed.size, syncedAt: doc.syncedAt };
}
