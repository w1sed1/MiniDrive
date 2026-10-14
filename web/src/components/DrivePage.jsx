import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  COLUMNS,
  DEFAULT_VISIBLE_COLUMNS,
  FILTER_ALL,
  FILTER_OPTIONS,
  FILTER_VARIANT,
  applyView,
  formatSize,
  normalizeVisibleColumns,
  validateFileName,
} from '@minidrive/shared';
import { api } from '../lib/api.js';
import { plural, usePref } from '../lib/prefs.js';
import FileTable from './FileTable.jsx';
import Icon from './Icon.jsx';
import { ChoiceModal, PromptModal } from './Modal.jsx';
import PreviewDrawer from './PreviewDrawer.jsx';
import ShareModal from './ShareModal.jsx';
import SyncPanel from './SyncPanel.jsx';
import { useToast } from './Toasts.jsx';

export default function DrivePage({ user, onLogout }) {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = usePref('sort', 'asc');
  const [filter, setFilter] = usePref('filter', FILTER_ALL);
  const [storedColumns, setStoredColumns] = usePref('columns', DEFAULT_VISIBLE_COLUMNS);
  const visibleColumns = normalizeVisibleColumns(storedColumns);
  const [selected, setSelected] = useState(() => new Set());
  const [activeId, setActiveId] = useState(null);
  const [dialog, setDialog] = useState(null); // { type: 'rename' | 'share' | 'choice', ... }
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const uploadInput = useRef(null);
  const dragDepth = useRef(0);

  const view = useMemo(() => applyView(files, { sort, filter }), [files, sort, filter]);
  const active = files.find((f) => f.id === activeId) ?? null;
  const selectedFiles = files.filter((f) => selected.has(f.id));
  const totalSize = files.filter((f) => f.isOwner).reduce((sum, f) => sum + f.size, 0);

  const refresh = useCallback(
    async ({ quiet = false } = {}) => {
      try {
        const list = await api.listFiles();
        setFiles(list);
        const ids = new Set(list.map((f) => f.id));
        setSelected((s) => new Set([...s].filter((id) => ids.has(id))));
        setActiveId((id) => (id && ids.has(id) ? id : null));
      } catch (e) {
        if (e.status === 401) onLogout();
        else if (!quiet) toast(e.message, 'error');
      } finally {
        setLoading(false);
      }
    },
    [onLogout, toast],
  );

  useEffect(() => {
    refresh();
    // Періодичне оновлення: бачимо зміни з десктоп-клієнта та від інших користувачів.
    const timer = setInterval(() => refresh({ quiet: true }), 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  /** Діалог вибору як Promise: resolve({ value, all }). */
  const askChoice = (props) => new Promise((resolve) => setDialog({ type: 'choice', props, resolve }));

  async function uploadFiles(list) {
    const items = [...list];
    if (!items.length) return;
    let applyAll = null;
    let done = 0;
    for (const file of items) {
      const name = file.name.normalize('NFC');
      const invalid = validateFileName(name);
      if (invalid) {
        toast(`${name}: ${invalid}`, 'error');
        continue;
      }
      try {
        await api.uploadFile(name, file);
        done += 1;
      } catch (e) {
        if (e.code !== 'FILE_EXISTS') {
          toast(`${name}: ${e.message}`, 'error');
          continue;
        }
        let choice = applyAll;
        if (!choice) {
          const res = await askChoice({
            title: 'Файл уже існує',
            message: `На диску вже є «${name}». Замінити його новою версією?`,
            checkboxLabel: items.length > 1 ? 'Застосувати до решти файлів' : null,
            buttons: [
              { label: 'Скасувати', value: 'cancel' },
              { label: 'Пропустити', value: 'skip' },
              { label: 'Замінити', value: 'replace', primary: true },
            ],
          });
          choice = res.value ?? 'cancel';
          if (res.all) applyAll = choice;
        }
        if (choice === 'cancel') break;
        if (choice === 'replace') {
          await api.uploadFile(name, file, { overwrite: true });
          done += 1;
        }
      }
    }
    if (done) toast(`Завантажено на диск: ${done} ${plural(done, 'файл', 'файли', 'файлів')}`, 'success');
    refresh({ quiet: true });
  }

  async function deleteFiles(list) {
    if (!list.length) return;
    if (list.some((f) => !f.isOwner)) return toast('Видаляти можна лише власні файли', 'error');
    const res = await askChoice({
      title: list.length === 1 ? 'Видалити файл?' : `Видалити ${list.length} ${plural(list.length, 'файл', 'файли', 'файлів')}?`,
      message: list.length === 1 ? `«${list[0].name}» буде видалено з сервера без можливості відновлення.` : 'Вибрані файли буде видалено з сервера без можливості відновлення.',
      buttons: [
        { label: 'Скасувати', value: 'cancel' },
        { label: 'Видалити', value: 'delete', danger: true },
      ],
    });
    if (res.value !== 'delete') return;
    try {
      for (const f of list) await api.deleteFile(f.id);
      toast(`Видалено: ${list.length}`, 'success');
      setSelected(new Set());
    } catch (e) {
      toast(e.message, 'error');
    }
    refresh({ quiet: true });
  }

  function downloadSelected() {
    // Кожен файл — окреме посилання з токеном (браузер може попросити дозвіл на кілька завантажень).
    for (const f of selectedFiles) {
      const a = document.createElement('a');
      a.href = new URL(api.contentUrl(f, { download: true }), window.location.href).href;
      a.download = f.name;
      document.body.append(a);
      a.click();
      a.remove();
    }
  }

  // ------------------------------------------------ drag-n-drop із файлової системи
  const isExternalFiles = (e) => {
    const types = [...(e.dataTransfer?.types ?? [])];
    return types.includes('Files') && !types.includes('application/x-minidrive');
  };
  const dropHandlers = {
    onDragEnter: (e) => {
      if (!isExternalFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e) => {
      if (isExternalFiles(e)) e.preventDefault();
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDrop: (e) => {
      if (!isExternalFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      uploadFiles(e.dataTransfer.files);
    },
  };

  const toggleSelect = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filterLabel = FILTER_OPTIONS.find((o) => o.value === filter)?.label;

  return (
    <div className={`app ${active ? 'app--drawer' : ''}`}>
      <header className="topbar">
        <button className="icon-btn nav-toggle" onClick={() => setNavOpen(!navOpen)} title="Меню">
          <Icon name="menu" />
        </button>
        <div className="brand">
          <span className="brand__logo">
            <Icon name="cloud" size={18} />
          </span>
          MiniDrive
        </div>
        <div className="topbar__spacer" />
        <div className="user-chip">
          <span className="avatar">{user.username[0].toUpperCase()}</span>
          <span className="user-chip__name">{user.username}</span>
          <button className="icon-btn" onClick={onLogout} title="Вийти">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </header>

      <nav className={`sidebar ${navOpen ? 'is-open' : ''}`}>
        <button className="btn btn--primary btn--lg btn--block upload-cta" onClick={() => uploadInput.current.click()}>
          <Icon name="upload" /> Завантажити файли
        </button>
        <input ref={uploadInput} type="file" multiple hidden onChange={(e) => uploadFiles(e.target.files).finally(() => (e.target.value = ''))} />
        <a className="nav-item is-active" href="#">
          <Icon name="drive" /> Мій диск
        </a>
        <div className="storage">
          <span className="muted small">Мої файли</span>
          <strong>
            {files.filter((f) => f.isOwner).length} {plural(files.filter((f) => f.isOwner).length, 'файл', 'файли', 'файлів')} · {formatSize(totalSize)}
          </strong>
          <span className="muted small">Спільних зі мною: {files.filter((f) => !f.isOwner).length}</span>
        </div>
        <SyncPanel user={user} onSynced={() => refresh({ quiet: true })} />
      </nav>

      <main className="main" {...dropHandlers}>
        <div className="main__head">
          <h1>Мій диск</h1>
          <div className="view-controls">
            <div className="segmented" role="group" aria-label="Сортування за назвою">
              <button className={sort === 'asc' ? 'is-active' : ''} onClick={() => setSort('asc')} title="За назвою: за зростанням">
                <Icon name="sortAsc" size={16} /> А→Я
              </button>
              <button className={sort === 'desc' ? 'is-active' : ''} onClick={() => setSort('desc')} title="За назвою: за спаданням">
                <Icon name="sortDesc" size={16} /> Я→А
              </button>
            </div>
            <label className="select-wrap" title="Фільтр за типом">
              <Icon name="filter" size={16} />
              <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Фільтр за типом">
                {FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="dropdown">
              <button className={`btn ${columnsOpen ? 'is-active' : ''}`} onClick={() => setColumnsOpen(!columnsOpen)}>
                <Icon name="columns" size={16} /> Стовпці
              </button>
              {columnsOpen && (
                <>
                  <div className="dropdown__backdrop" onClick={() => setColumnsOpen(false)} />
                  <div className="menu">
                    <div className="menu__title">Видимі стовпці</div>
                    {COLUMNS.map((c) => (
                      <label key={c.key} className={`menu__item ${c.required ? 'is-disabled' : ''}`}>
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(c.key)}
                          disabled={c.required}
                          onChange={(e) => {
                            const set = new Set(visibleColumns);
                            if (e.target.checked) set.add(c.key);
                            else set.delete(c.key);
                            setStoredColumns(COLUMNS.map((x) => x.key).filter((k) => set.has(k)));
                          }}
                        />
                        {c.label}
                        {c.required && <span className="muted"> (завжди)</span>}
                      </label>
                    ))}
                    <div className="menu__actions">
                      <button className="link" onClick={() => setStoredColumns(DEFAULT_VISIBLE_COLUMNS)}>
                        Показати всі
                      </button>
                      <button className="link" onClick={() => setStoredColumns(['name'])}>
                        Лише назва
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <button className="icon-btn icon-btn--bordered" onClick={() => refresh()} title="Оновити">
              <Icon name="refresh" size={16} />
            </button>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="selection-bar">
            <span>
              Вибрано: <strong>{selected.size}</strong>
            </span>
            <button className="btn btn--sm" onClick={downloadSelected}>
              <Icon name="download" size={15} /> Вивантажити
            </button>
            <button className="btn btn--sm btn--danger-outline" onClick={() => deleteFiles(selectedFiles)} disabled={selectedFiles.some((f) => !f.isOwner)}>
              <Icon name="trash" size={15} /> Видалити
            </button>
            <button className="link" onClick={() => setSelected(new Set())}>
              Скасувати вибір
            </button>
          </div>
        )}

        <div className="table-card">
          <FileTable
            files={view}
            visibleColumns={visibleColumns}
            sort={sort}
            onToggleSort={() => setSort(sort === 'asc' ? 'desc' : 'asc')}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleAll={() => setSelected(view.every((f) => selected.has(f.id)) ? new Set() : new Set(view.map((f) => f.id)))}
            activeId={activeId}
            onOpen={(f) => setActiveId(f.id)}
          />
          {!loading && view.length === 0 && (
            <div className="empty">
              <Icon name={files.length ? 'filter' : 'upload'} size={40} />
              <p>{files.length ? 'Немає файлів .txt або .jpg' : 'Диск порожній'}</p>
              <p className="muted">{files.length ? 'Змініть фільтр, щоб побачити всі файли' : 'Перетягніть файли сюди або натисніть «Завантажити файли»'}</p>
            </div>
          )}
        </div>
        <p className="table-meta muted small">
          {filter === FILTER_VARIANT ? `Показано ${view.length} з ${files.length} · фільтр: ${filterLabel.toLowerCase()}` : `Усього файлів: ${files.length}`} · сортування за назвою {sort === 'asc' ? 'А→Я' : 'Я→А'} · перетягніть рядок на робочий стіл, щоб зберегти файл
        </p>

        {dragging && (
          <div className="dropzone">
            <div>
              <Icon name="upload" size={40} />
              <p>Відпустіть, щоб завантажити на диск</p>
            </div>
          </div>
        )}
      </main>

      {active && (
        <PreviewDrawer
          key={active.id}
          file={active}
          onClose={() => setActiveId(null)}
          onChanged={() => refresh({ quiet: true })}
          onRename={() => setDialog({ type: 'rename', file: active })}
          onShare={() => setDialog({ type: 'share', file: active })}
          onDelete={() => deleteFiles([active])}
        />
      )}

      {dialog?.type === 'rename' && (
        <PromptModal
          title="Перейменувати файл"
          label="Нова назва"
          initial={dialog.file.name}
          okLabel="Перейменувати"
          selectStem
          validate={validateFileName}
          onSubmit={async (name) => {
            if (name === dialog.file.name) return;
            await api.renameFile(dialog.file.id, name);
            toast(`Перейменовано на «${name}»`, 'success');
            refresh({ quiet: true });
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'share' && <ShareModal file={dialog.file} onClose={() => setDialog(null)} onChanged={() => refresh({ quiet: true })} />}
      {dialog?.type === 'choice' && (
        <ChoiceModal
          {...dialog.props}
          onChoose={(value, all) => {
            setDialog(null);
            dialog.resolve({ value, all });
          }}
        />
      )}
    </div>
  );
}
