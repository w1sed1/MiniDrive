import { useState } from 'react';
import { ACTION_LABELS, SYNC_ACTIONS, formatDateTime } from '@minidrive/shared';
import { SERVER_ID, api } from '../lib/api.js';
import { plural } from '../lib/prefs.js';
import { ensurePermission, isSyncSupported, pickFolder, runWebSync } from '../sync/webSync.js';
import Icon from './Icon.jsx';
import { useToast } from './Toasts.jsx';

const OPS = { [SYNC_ACTIONS.UPLOAD]: '↑', [SYNC_ACTIONS.UPDATE_REMOTE]: '↑', [SYNC_ACTIONS.DOWNLOAD]: '↓', [SYNC_ACTIONS.DELETE_LOCAL]: '✕', [SYNC_ACTIONS.DELETE_REMOTE]: '✕' };

export default function SyncPanel({ user, onSynced }) {
  const toast = useToast();
  const [dir, setDir] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [log, setLog] = useState([]);
  const [lastSync, setLastSync] = useState(null);

  if (!isSyncSupported()) {
    return (
      <section className="side-card">
        <h3>
          <Icon name="sync" size={16} /> Синхронізація папки
        </h3>
        <p className="muted small">Ваш браузер не підтримує доступ до локальних папок. Відкрийте MiniDrive у Chrome або Edge, або скористайтеся десктоп-клієнтом.</p>
      </section>
    );
  }

  async function choose() {
    try {
      const handle = await pickFolder();
      setDir(handle);
      setLog([]);
      setLastSync(null);
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message, 'error');
    }
  }

  async function sync() {
    if (!(await ensurePermission(dir))) return toast('Немає дозволу на запис у папку', 'error');
    setRunning(true);
    setLog([]);
    setProgress(null);
    try {
      const result = await runWebSync({
        api,
        dir,
        server: SERVER_ID,
        username: user.username,
        onProgress: (p) => {
          setProgress(p);
          setLog((l) => [...l, p.item]);
        },
      });
      setLastSync(result.syncedAt);
      const ok = result.log.length - result.failed;
      toast(result.log.length ? `Синхронізовано: ${ok} ${plural(ok, 'зміна', 'зміни', 'змін')}${result.failed ? `, помилок: ${result.failed}` : ''}` : 'Синхронізовано: змін немає', result.failed ? 'error' : 'success');
      onSynced();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="side-card">
      <h3>
        <Icon name="sync" size={16} /> Синхронізація папки
      </h3>
      <button className="folder-pick" onClick={choose} disabled={running} title="Вибрати локальну папку">
        <Icon name="folder" size={16} />
        <span>{dir ? dir.name : 'Вибрати папку…'}</span>
      </button>
      <button className="btn btn--primary btn--block" onClick={sync} disabled={!dir || running}>
        <Icon name="sync" size={16} />
        {running ? 'Синхронізація…' : 'Синхронізувати'}
      </button>
      {running && progress && (
        <div className="progress">
          <div style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
        </div>
      )}
      <p className="muted small">{lastSync ? `Остання: ${formatDateTime(lastSync)}` : 'Двостороння: нові та змінені файли переносяться в обидва боки.'}</p>
      {log.length > 0 && (
        <ul className="sync-log">
          {log.map((item, i) => (
            <li key={i} className={item.ok ? '' : 'is-error'} title={item.error ?? item.reason}>
              <span className="sync-log__op">{OPS[item.action]}</span>
              <span className="sync-log__name">{item.name}</span>
              <span className="muted">{item.ok ? ACTION_LABELS[item.action] : 'помилка'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
