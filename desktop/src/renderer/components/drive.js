import {
  ACTION_LABELS,
  COLUMNS,
  FILTER_OPTIONS,
  FILTER_VARIANT,
  SYNC_ACTIONS,
  applyView,
  cellText,
  formatDateTime,
  validateFileName,
} from '@minidrive/shared';
import { fileIconName, h, icon, plural, promptModal, toast } from './ui.js';
import { createPreview } from './preview.js';
import { openShareDialog } from './share-dialog.js';

const SYNC_ICONS = {
  [SYNC_ACTIONS.UPLOAD]: '↑',
  [SYNC_ACTIONS.UPDATE_REMOTE]: '↑',
  [SYNC_ACTIONS.DOWNLOAD]: '↓',
  [SYNC_ACTIONS.DELETE_LOCAL]: '✕',
  [SYNC_ACTIONS.DELETE_REMOTE]: '✕',
};

/** Основне вікно: бічна панель (акаунт, синхронізація), панель інструментів, таблиця, перегляд, рядок стану. */
export function renderDrive(root, session, { onLogout }) {
  const state = {
    files: [],
    loading: true,
    selected: new Set(),
    focusId: null,
    sort: session.sort,
    filter: session.filter,
    visibleColumns: session.visibleColumns,
    syncFolder: session.syncFolder,
    lastSync: session.lastSync,
    autoSync: session.autoSync,
    syncRunning: false,
    syncProgress: null,
    syncLog: [],
  };

  const visibleFiles = () => applyView(state.files, { sort: state.sort, filter: state.filter });
  const focused = () => state.files.find((f) => f.id === state.focusId) ?? null;
  const selectedFiles = () => state.files.filter((f) => state.selected.has(f.id));

  const preview = createPreview({
    onSaved: async (file) => {
      await refresh();
      preview.show(state.files.find((f) => f.id === file.id) ?? null);
    },
  });

  // ------------------------------------------------------------------ дії
  async function refresh({ quiet = false } = {}) {
    try {
      state.files = await window.drive.listFiles();
      const ids = new Set(state.files.map((f) => f.id));
      state.selected = new Set([...state.selected].filter((id) => ids.has(id)));
      if (state.focusId && !ids.has(state.focusId)) {
        state.focusId = null;
        preview.show(null);
      }
    } catch (e) {
      if (!quiet) toast(e.message, 'error');
    } finally {
      state.loading = false;
      render();
    }
  }

  function reportUploads(results) {
    const ok = results.filter((r) => r.status === 'uploaded' || r.status === 'replaced').length;
    if (ok) toast(`Завантажено на диск: ${ok}`, 'success');
    for (const r of results.filter((x) => x.status === 'error' || x.status === 'skipped')) {
      toast(`${r.name}: ${r.reason}`, r.status === 'error' ? 'error' : 'info');
    }
  }

  async function uploadViaDialog() {
    try {
      reportUploads(await window.drive.uploadDialog());
      await refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function uploadDropped(fileList) {
    const paths = [...fileList].map((f) => window.drive.pathForFile(f)).filter(Boolean);
    // Файл, який ми самі щойно перетягнули з таблиці, не завантажуємо назад.
    const external = paths.filter((p) => !p.includes('minidrive-drag'));
    if (!external.length) return;
    try {
      reportUploads(await window.drive.uploadPaths(external));
      await refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function downloadSelected() {
    const file = focused();
    if (!file) return;
    try {
      const res = await window.drive.download(file.id);
      if (res) toast(`Збережено: ${res.path}`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function replaceSelected() {
    const file = focused();
    if (!file) return;
    try {
      if (await window.drive.replaceDialog(file.id)) {
        toast(`Оновлено «${file.name}»`, 'success');
        await refresh();
        preview.show(focused());
      }
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function renameSelected() {
    const file = focused();
    if (!file?.isOwner) return;
    const name = await promptModal({ title: 'Перейменувати файл', label: 'Нова назва', value: file.name, okLabel: 'Перейменувати', validate: validateFileName, selectStem: true });
    if (name === null || name === file.name) return;
    try {
      await window.drive.rename(file.id, name);
      toast(`Перейменовано на «${name}»`, 'success');
      await refresh();
      preview.show(focused());
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function deleteSelected() {
    const files = selectedFiles();
    if (!files.length) return;
    const foreign = files.filter((f) => !f.isOwner);
    if (foreign.length) {
      toast('Видаляти можна лише власні файли', 'error');
      return;
    }
    try {
      const { deleted } = await window.drive.remove(files.map((f) => f.id));
      if (deleted) {
        toast(`Видалено: ${deleted}`, 'success');
        await refresh();
      }
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function shareSelected() {
    const file = focused();
    if (file?.isOwner) openShareDialog(file, () => refresh({ quiet: true }));
  }

  async function updateSettings(patch) {
    Object.assign(state, patch);
    render();
    await window.drive.updateSettings(patch).catch(() => {});
  }

  function selectRow(file, e) {
    if (e.metaKey || e.ctrlKey) {
      if (state.selected.has(file.id)) state.selected.delete(file.id);
      else state.selected.add(file.id);
    } else if (e.shiftKey && state.focusId) {
      const list = visibleFiles();
      const [a, b] = [list.findIndex((f) => f.id === state.focusId), list.findIndex((f) => f.id === file.id)].sort((x, y) => x - y);
      state.selected = new Set(list.slice(a, b + 1).map((f) => f.id));
    } else {
      state.selected = new Set([file.id]);
    }
    if (state.focusId !== file.id) {
      state.focusId = file.id;
      preview.show(file);
    }
    render();
  }

  function moveSelection(delta) {
    const list = visibleFiles();
    if (!list.length) return;
    const i = list.findIndex((f) => f.id === state.focusId);
    const next = list[Math.max(0, Math.min(list.length - 1, i === -1 ? 0 : i + delta))];
    selectRow(next, {});
    tableBody.querySelector(`[data-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  // ------------------------------------------------------------------ синхронізація
  async function chooseFolder() {
    const s = await window.drive.chooseSyncFolder();
    state.syncFolder = s.syncFolder;
    state.lastSync = s.lastSync;
    render();
  }

  async function syncNow() {
    try {
      await window.drive.sync();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const unsubscribers = [
    window.drive.on('sync:status', ({ running }) => {
      state.syncRunning = running;
      if (running) {
        state.syncProgress = null;
        state.syncLog = [];
      }
      render();
    }),
    window.drive.on('sync:progress', (p) => {
      state.syncProgress = p;
      state.syncLog = [...state.syncLog, p.item];
      render();
    }),
    window.drive.on('sync:done', async (result) => {
      state.lastSync = result.syncedAt;
      const ok = result.log.length - result.failed;
      const text = result.log.length
        ? `Синхронізовано: ${ok} ${plural(ok, 'зміна', 'зміни', 'змін')}${result.failed ? `, помилок: ${result.failed}` : ''}`
        : 'Синхронізовано: змін немає';
      toast(text, result.failed ? 'error' : 'success');
      await refresh({ quiet: true });
    }),
    window.drive.on('sync:error', (msg) => toast(`Автосинхронізація: ${msg}`, 'error')),
    window.drive.on('toast', ({ type, text }) => toast(text, type)),
  ];

  // ------------------------------------------------------------------ розмітка
  const sidebar = h('aside', { class: 'sidebar' });
  const toolbar = h('div', { class: 'toolbar' });
  const tableHead = h('thead');
  const tableBody = h('tbody');
  const emptyBox = h('div', { class: 'empty', hidden: true });
  const dropOverlay = h('div', { class: 'drop-overlay', hidden: true }, h('div', {}, icon('upload', 36), h('p', {}, 'Відпустіть, щоб завантажити на диск')));
  const tableWrap = h('div', { class: 'table-wrap', tabindex: 0 }, h('table', { class: 'files' }, tableHead, tableBody), emptyBox, dropOverlay);
  const statusbar = h('footer', { class: 'statusbar' });

  root.replaceChildren(
    h(
      'div',
      { class: 'layout' },
      h('header', { class: 'titlebar' }, h('div', { class: 'logo logo--sm' }, icon('cloud', 16)), h('span', { class: 'titlebar__name' }, 'MiniDrive'), h('span', { class: 'titlebar__sep' }, '/'), h('span', {}, 'Мій диск')),
      sidebar,
      h('main', { class: 'workspace' }, toolbar, tableWrap),
      preview.el,
      statusbar,
    ),
  );

  // Drag-n-drop файлів з Finder/Провідника у вікно → завантаження на диск.
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  tableWrap.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth += 1;
    dropOverlay.hidden = false;
  });
  tableWrap.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  tableWrap.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropOverlay.hidden = true;
  });
  tableWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    if (e.dataTransfer.files.length) uploadDropped(e.dataTransfer.files);
  });

  tableWrap.addEventListener('keydown', (e) => {
    if (e.target !== tableWrap) return;
    if (e.key === 'ArrowDown') moveSelection(1);
    else if (e.key === 'ArrowUp') moveSelection(-1);
    else if (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) deleteSelected();
    else if (e.key === 'F2') renameSelected();
    else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
      state.selected = new Set(visibleFiles().map((f) => f.id));
      render();
    } else return;
    e.preventDefault();
  });

  // ------------------------------------------------------------------ рендер
  function renderSidebar() {
    const progress = state.syncProgress;
    sidebar.replaceChildren(
      h(
        'section',
        { class: 'card account' },
        h('span', { class: 'avatar' }, session.user.username[0].toUpperCase()),
        h('div', { class: 'account__info' }, h('strong', {}, session.user.username), h('span', { class: 'muted', title: session.serverUrl }, session.serverUrl.replace(/^https?:\/\//, ''))),
        h('button', { class: 'btn btn--icon', title: 'Вийти', onclick: onLogout }, icon('logout')),
      ),
      h(
        'section',
        { class: 'card sync' },
        h('h2', {}, icon('sync', 15), 'Синхронізація'),
        h('div', { class: 'sync__folder', title: state.syncFolder ?? '' }, icon('folder', 15), h('span', {}, state.syncFolder ? state.syncFolder.split(/[\\/]/).pop() : 'Папку не вибрано')),
        h(
          'div',
          { class: 'sync__buttons' },
          h('button', { class: 'btn btn--sm', onclick: chooseFolder, disabled: state.syncRunning }, state.syncFolder ? 'Змінити папку…' : 'Вибрати папку…'),
          state.syncFolder ? h('button', { class: 'btn btn--sm btn--ghost', onclick: () => window.drive.openSyncFolder() }, 'Відкрити') : null,
        ),
        h(
          'button',
          { class: 'btn btn--primary btn--block', onclick: syncNow, disabled: !state.syncFolder || state.syncRunning },
          icon('sync', 15),
          state.syncRunning ? 'Синхронізація…' : 'Синхронізувати зараз',
        ),
        state.syncRunning && progress ? h('div', { class: 'progress' }, h('div', { class: 'progress__bar', style: `width:${Math.round((progress.done / progress.total) * 100)}%` })) : null,
        h(
          'label',
          { class: 'switch' },
          h('input', { type: 'checkbox', checked: state.autoSync, onchange: (e) => updateSettings({ autoSync: e.target.checked }) }),
          h('span', {}, 'Автоматично кожні 30 с'),
        ),
        h('div', { class: 'muted sync__last' }, `Остання: ${state.lastSync ? formatDateTime(state.lastSync) : 'ще не було'}`),
        state.syncLog.length
          ? h(
              'ul',
              { class: 'sync__log' },
              state.syncLog.map((item) =>
                h('li', { class: item.ok ? '' : 'sync__log--error', title: item.error ?? item.reason }, h('span', { class: 'sync__op' }, SYNC_ICONS[item.action] ?? '•'), h('span', { class: 'sync__name' }, item.name), h('span', { class: 'muted' }, item.ok ? ACTION_LABELS[item.action] : 'помилка')),
              ),
            )
          : null,
      ),
      h('section', { class: 'card help' }, h('h2', {}, 'Підказки'), h('ul', {}, h('li', {}, 'Перетягніть файли у вікно, щоб завантажити'), h('li', {}, 'Перетягніть рядок на робочий стіл, щоб зберегти'), h('li', {}, '⌘/Ctrl + клік — виділити кілька'), h('li', {}, 'F2 — перейменувати, Delete — видалити'))),
    );
  }

  function toolButton(name, label, onClick, { primary = false, disabled = false, title } = {}) {
    return h('button', { class: `btn ${primary ? 'btn--primary' : ''}`, onclick: onClick, disabled, title: title ?? label }, icon(name), h('span', {}, label));
  }

  let columnsOpen = false;
  function renderToolbar() {
    const file = focused();
    const sel = selectedFiles();
    const columnsMenu = columnsOpen
      ? h(
          'div',
          { class: 'menu', onmousedown: (e) => e.stopPropagation() },
          h('div', { class: 'menu__title' }, 'Видимі стовпці'),
          COLUMNS.map((c) =>
            h(
              'label',
              { class: `menu__item ${c.required ? 'menu__item--disabled' : ''}` },
              h('input', {
                type: 'checkbox',
                checked: state.visibleColumns.includes(c.key),
                disabled: c.required,
                onchange: (e) => {
                  const set = new Set(state.visibleColumns);
                  if (e.target.checked) set.add(c.key);
                  else set.delete(c.key);
                  updateSettings({ visibleColumns: COLUMNS.map((x) => x.key).filter((k) => set.has(k)) });
                },
              }),
              c.label,
              c.required ? h('span', { class: 'muted' }, ' (завжди)') : null,
            ),
          ),
          h('div', { class: 'menu__actions' }, h('button', { class: 'btn btn--sm btn--ghost', onclick: () => updateSettings({ visibleColumns: COLUMNS.map((c) => c.key) }) }, 'Показати всі'), h('button', { class: 'btn btn--sm btn--ghost', onclick: () => updateSettings({ visibleColumns: ['name'] }) }, 'Лише назва')),
        )
      : null;

    toolbar.replaceChildren(
      h(
        'div',
        { class: 'toolbar__group' },
        toolButton('upload', 'Завантажити', uploadViaDialog, { primary: true, title: 'Завантажити файли на диск' }),
        toolButton('download', 'Вивантажити', downloadSelected, { disabled: !file, title: 'Вивантажити файл на комп’ютер' }),
        toolButton('replace', 'Нова версія', replaceSelected, { disabled: !file, title: 'Замінити вміст файлу іншим файлом' }),
        toolButton('rename', 'Перейменувати', renameSelected, { disabled: !file?.isOwner }),
        toolButton('share', 'Доступ', shareSelected, { disabled: !file?.isOwner }),
        toolButton('trash', 'Видалити', deleteSelected, { disabled: !sel.length || sel.some((f) => !f.isOwner) }),
      ),
      h(
        'div',
        { class: 'toolbar__group' },
        h(
          'div',
          { class: 'segmented', role: 'group', 'aria-label': 'Сортування за назвою' },
          h('button', { class: state.sort === 'asc' ? 'is-active' : '', title: 'За назвою: за зростанням', onclick: () => updateSettings({ sort: 'asc' }) }, icon('sortAsc'), 'А→Я'),
          h('button', { class: state.sort === 'desc' ? 'is-active' : '', title: 'За назвою: за спаданням', onclick: () => updateSettings({ sort: 'desc' }) }, icon('sortDesc'), 'Я→А'),
        ),
        h(
          'select',
          { class: 'select', title: 'Фільтр за типом', onchange: (e) => updateSettings({ filter: e.target.value }) },
          FILTER_OPTIONS.map((o) => h('option', { value: o.value, selected: state.filter === o.value }, o.label)),
        ),
        h(
          'div',
          { class: 'dropdown' },
          h(
            'button',
            {
              class: `btn ${columnsOpen ? 'is-active' : ''}`,
              onmousedown: (e) => e.stopPropagation(),
              onclick: () => {
                columnsOpen = !columnsOpen;
                renderToolbar();
              },
            },
            icon('columns'),
            h('span', {}, 'Стовпці'),
          ),
          columnsMenu,
        ),
        h('button', { class: 'btn btn--icon', title: 'Оновити список', onclick: () => refresh() }, icon('refresh')),
      ),
    );
  }
  const closeColumnsMenu = () => {
    if (columnsOpen) {
      columnsOpen = false;
      renderToolbar();
    }
  };
  document.addEventListener('mousedown', closeColumnsMenu);

  function renderTable() {
    const cols = COLUMNS.filter((c) => state.visibleColumns.includes(c.key));
    tableHead.replaceChildren(
      h(
        'tr',
        {},
        cols.map((c) =>
          c.key === 'name'
            ? h(
                'th',
                { class: 'th-sort', title: 'Сортувати за назвою', onclick: () => updateSettings({ sort: state.sort === 'asc' ? 'desc' : 'asc' }) },
                'Назва ',
                h('span', { class: 'sort-arrow' }, state.sort === 'asc' ? '▲' : '▼'),
              )
            : h('th', { class: `col-${c.key}` }, c.label),
        ),
      ),
    );

    const list = visibleFiles();
    tableBody.replaceChildren(
      ...list.map((f) =>
        h(
          'tr',
          {
            class: `${state.selected.has(f.id) ? 'is-selected' : ''} ${state.focusId === f.id ? 'is-focused' : ''}`,
            dataset: { id: f.id },
            draggable: 'true',
            onclick: (e) => selectRow(f, e),
            ondblclick: () => downloadSelected(),
            onmousedown: () => window.drive.prefetchForDrag(f.id).catch(() => {}),
            ondragstart: (e) => {
              e.preventDefault();
              window.drive.startDrag(f.id);
            },
          },
          cols.map((c) =>
            c.key === 'name'
              ? h(
                  'td',
                  { class: 'cell-name' },
                  h('span', { class: `file-icon file-icon--${fileIconName(f.ext)}` }, icon(fileIconName(f.ext))),
                  h('span', { class: 'cell-name__text', title: f.name }, f.name),
                  !f.isOwner ? h('span', { class: 'tag', title: `Власник: ${f.owner}` }, 'спільний') : null,
                  f.isOwner && f.shareCount ? h('span', { class: 'tag tag--muted', title: `Доступ мають ${f.shareCount} корист.` }, icon('users', 12), f.shareCount) : null,
                )
              : h('td', { class: `col-${c.key} ${c.key === 'editedBy' && !f.editedBy ? 'muted' : ''}` }, cellText(f, c.key)),
          ),
        ),
      ),
    );

    emptyBox.hidden = state.loading || list.length > 0;
    if (!list.length && !state.loading) {
      emptyBox.replaceChildren(
        icon(state.files.length ? 'file' : 'upload', 40),
        h('p', {}, state.files.length ? 'Немає файлів .txt або .jpg' : 'Диск порожній'),
        h('p', { class: 'muted' }, state.files.length ? 'Змініть фільтр, щоб побачити всі файли' : 'Перетягніть файли сюди або натисніть «Завантажити»'),
      );
    }
  }

  function renderStatus() {
    const shown = visibleFiles().length;
    const parts = [
      h('span', {}, `Файлів: ${state.files.length}`),
      state.filter === FILTER_VARIANT ? h('span', {}, `Показано: ${shown} (фільтр .txt, .jpg)`) : null,
      h('span', {}, `Сортування: назва ${state.sort === 'asc' ? 'А→Я' : 'Я→А'}`),
      state.selected.size ? h('span', {}, `Виділено: ${state.selected.size}`) : null,
      h('span', { class: 'statusbar__right' }, h('span', { class: 'dot' }), session.serverUrl),
    ];
    statusbar.replaceChildren(...parts.filter(Boolean));
  }

  function render() {
    renderSidebar();
    renderToolbar();
    renderTable();
    renderStatus();
  }

  render();
  preview.show(null);
  refresh();
  const poll = setInterval(() => refresh({ quiet: true }), 20_000);

  return () => {
    clearInterval(poll);
    document.removeEventListener('mousedown', closeColumnsMenu);
    unsubscribers.forEach((u) => u());
  };
}
