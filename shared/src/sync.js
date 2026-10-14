import { validateFileName } from './validation.js';

/** Службовий файл у локальній папці зі станом останньої синхронізації. */
export const SYNC_STATE_FILE = '.minidrive-sync.json';

export const SYNC_ACTIONS = Object.freeze({
  NONE: 'none',
  UPLOAD: 'upload', // новий локальний файл → створити на сервері
  UPDATE_REMOTE: 'update-remote', // локальна версія новіша → замінити вміст на сервері
  DOWNLOAD: 'download', // серверна версія новіша / новий файл на сервері → записати локально
  DELETE_LOCAL: 'delete-local', // файл видалили на сервері → видалити локально
  DELETE_REMOTE: 'delete-remote', // файл видалили локально → видалити на сервері
});

const A = SYNC_ACTIONS;

/** Ключ зіставлення: без урахування регістру та форми Unicode (macOS зберігає NFD). */
export function syncKey(name) {
  return String(name).normalize('NFC').toLowerCase();
}

/** Чи бере файл участь у синхронізації: без прихованих, службових і недопустимих назв. */
export function isSyncableName(name) {
  return !name.startsWith('.') && validateFileName(name) === null;
}

function toMap(items) {
  const map = new Map();
  for (const item of items) map.set(syncKey(item.name), item);
  return map;
}

/**
 * Будує план двосторонньої синхронізації.
 *
 * @param {object} p
 * @param {{name:string, hash:string, mtime:number}[]} p.local   файли локальної папки
 * @param {{id:string, name:string, hash:string, updatedAt:string}[]} p.remote  власні файли на сервері
 * @param {Record<string,{name:string, hash:string}>|null} p.base  стан після минулої синхронізації
 * @returns {{key:string, name:string, action:string, reason:string, local?:object, remote?:object}[]}
 *
 * Правила: якщо змінилася лише одна сторона — її версія переноситься на іншу; якщо обидві —
 * перемагає новіша за часом зміни. Видалення переноситься лише тоді, коли файл був
 * синхронізований раніше (є в base) і з того часу не змінювався. Без base нічого не видаляється.
 */
export function planSync({ local, remote, base }) {
  const L = toMap(local);
  const R = toMap(remote);
  const B = base ?? {};
  const keys = [...new Set([...L.keys(), ...R.keys(), ...Object.keys(B)])].sort();
  const plan = [];

  for (const key of keys) {
    const l = L.get(key);
    const r = R.get(key);
    const b = B[key];

    if (l && r) {
      if (l.hash === r.hash) {
        plan.push({ key, name: r.name, action: A.NONE, reason: 'same', local: l, remote: r });
        continue;
      }
      const localChanged = !b || l.hash !== b.hash;
      const remoteChanged = !b || r.hash !== b.hash;
      if (localChanged && !remoteChanged) {
        plan.push({ key, name: r.name, action: A.UPDATE_REMOTE, reason: 'local-changed', local: l, remote: r });
      } else if (!localChanged && remoteChanged) {
        plan.push({ key, name: r.name, action: A.DOWNLOAD, reason: 'remote-changed', local: l, remote: r });
      } else {
        const localNewer = l.mtime > Date.parse(r.updatedAt);
        plan.push({
          key,
          name: r.name,
          action: localNewer ? A.UPDATE_REMOTE : A.DOWNLOAD,
          reason: localNewer ? 'conflict-local-newer' : 'conflict-remote-newer',
          local: l,
          remote: r,
        });
      }
    } else if (l) {
      if (b && l.hash === b.hash) {
        plan.push({ key, name: l.name, action: A.DELETE_LOCAL, reason: 'deleted-remotely', local: l });
      } else {
        plan.push({ key, name: l.name, action: A.UPLOAD, reason: b ? 'changed-after-remote-delete' : 'new-local', local: l });
      }
    } else if (r) {
      if (b && r.hash === b.hash) {
        plan.push({ key, name: r.name, action: A.DELETE_REMOTE, reason: 'deleted-locally', remote: r });
      } else {
        plan.push({ key, name: r.name, action: A.DOWNLOAD, reason: b ? 'changed-after-local-delete' : 'new-remote', remote: r });
      }
    }
    // Немає ні локально, ні на сервері — запис просто зникає з base.
  }
  return plan;
}

/** Стан для наступної синхронізації. Для невдалих дій лишається попередній запис. */
export function nextBase(plan, prevBase, failedKeys = new Set()) {
  const next = {};
  for (const item of plan) {
    if (failedKeys.has(item.key)) {
      if (prevBase?.[item.key]) next[item.key] = prevBase[item.key];
      continue;
    }
    switch (item.action) {
      case A.NONE:
      case A.UPLOAD:
      case A.UPDATE_REMOTE:
        next[item.key] = { name: item.name, hash: item.local.hash };
        break;
      case A.DOWNLOAD:
        next[item.key] = { name: item.name, hash: item.remote.hash };
        break;
      default:
        break; // видалені файли в base не потрапляють
    }
  }
  return next;
}

/** Повертає base із документа стану, лише якщо він належить тому ж серверу й користувачу. */
export function readBaseState(doc, { server, username }) {
  if (!doc || doc.version !== 1 || doc.server !== server || doc.username !== username) return null;
  return doc.files && typeof doc.files === 'object' ? doc.files : null;
}

export function makeStateDocument({ server, username, files }) {
  return { version: 1, server, username, syncedAt: new Date().toISOString(), files };
}

export function summarizePlan(plan) {
  const counts = Object.fromEntries(Object.values(A).map((a) => [a, 0]));
  for (const item of plan) counts[item.action] += 1;
  return counts;
}

export const ACTION_LABELS = {
  [A.NONE]: 'без змін',
  [A.UPLOAD]: 'вивантажено на сервер',
  [A.UPDATE_REMOTE]: 'оновлено на сервері',
  [A.DOWNLOAD]: 'завантажено з сервера',
  [A.DELETE_LOCAL]: 'видалено локально',
  [A.DELETE_REMOTE]: 'видалено на сервері',
};
