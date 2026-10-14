import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SYNC_STATE_FILE, isSyncableName } from '@minidrive/shared';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Файли верхнього рівня локальної папки з хешами (приховані та службові пропускаються). */
export async function scanFolder(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isSyncableName(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const [buffer, stat] = await Promise.all([fs.readFile(fullPath), fs.stat(fullPath)]);
    files.push({ name: entry.name.normalize('NFC'), path: fullPath, size: stat.size, mtime: stat.mtimeMs, hash: sha256(buffer) });
  }
  return files;
}

export async function readSyncState(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, SYNC_STATE_FILE), 'utf8'));
  } catch {
    return null;
  }
}

export async function writeSyncState(dir, doc) {
  await fs.writeFile(path.join(dir, SYNC_STATE_FILE), JSON.stringify(doc, null, 2));
}

/** Запис через тимчасовий файл, щоб не лишити напівзаписаний файл; mtime = час зміни на сервері. */
export async function writeFileAtomic(target, data, mtimeIso) {
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.part`);
  await fs.writeFile(tmp, data);
  if (mtimeIso) {
    const t = new Date(mtimeIso);
    await fs.utimes(tmp, t, t);
  }
  await fs.rename(tmp, target);
}
