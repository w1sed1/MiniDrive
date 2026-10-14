import { COLUMNS, cellText } from '@minidrive/shared';
import { absoluteContentUrl } from '../lib/api.js';
import Icon, { fileIconName } from './Icon.jsx';

/** Таблиця файлів. Клік по рядку відкриває перегляд; рядок можна перетягнути на робочий стіл (Chrome). */
export default function FileTable({ files, visibleColumns, sort, onToggleSort, selected, onToggleSelect, onToggleAll, activeId, onOpen }) {
  const cols = COLUMNS.filter((c) => visibleColumns.includes(c.key));
  const allChecked = files.length > 0 && files.every((f) => selected.has(f.id));

  function onDragStart(e, file) {
    const url = absoluteContentUrl(file, { download: true });
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('DownloadURL', `${file.mime}:${file.name}:${url}`);
    e.dataTransfer.setData('text/uri-list', url);
    e.dataTransfer.setData('application/x-minidrive', file.id);
  }

  return (
    <table className="files">
      <thead>
        <tr>
          <th className="col-check">
            <input type="checkbox" aria-label="Виділити всі" checked={allChecked} onChange={onToggleAll} />
          </th>
          {cols.map((c) =>
            c.key === 'name' ? (
              <th key="name" className="col-name">
                <button className="th-sort" onClick={onToggleSort} title="Сортувати за назвою">
                  Назва <Icon name={sort === 'asc' ? 'sortAsc' : 'sortDesc'} size={15} />
                </button>
              </th>
            ) : (
              <th key={c.key} className={`col-${c.key}`}>
                {c.label}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {files.map((f) => (
          <tr key={f.id} className={`${selected.has(f.id) ? 'is-selected' : ''} ${activeId === f.id ? 'is-active' : ''}`} onClick={() => onOpen(f)} draggable onDragStart={(e) => onDragStart(e, f)}>
            <td className="col-check" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" aria-label={`Виділити ${f.name}`} checked={selected.has(f.id)} onChange={() => onToggleSelect(f.id)} />
            </td>
            {cols.map((c) =>
              c.key === 'name' ? (
                <td key="name" className="col-name">
                  <span className="name-cell">
                    <span className={`file-icon file-icon--${fileIconName(f.ext)}`}>
                      <Icon name={fileIconName(f.ext)} size={18} />
                    </span>
                    <span className="name-cell__text" title={f.name}>
                      {f.name}
                    </span>
                    {!f.isOwner && <span className="chip chip--shared">спільний</span>}
                    {f.isOwner && f.shareCount > 0 && (
                      <span className="chip" title={`Доступ мають ${f.shareCount} корист.`}>
                        <Icon name="share" size={12} /> {f.shareCount}
                      </span>
                    )}
                  </span>
                </td>
              ) : (
                <td key={c.key} className={`col-${c.key} ${c.key === 'editedBy' && !f.editedBy ? 'muted' : ''}`}>
                  {cellText(f, c.key)}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
