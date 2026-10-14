import { useEffect, useRef, useState } from 'react';
import { VARIANT, formatDateTime, formatSize, previewKind } from '@minidrive/shared';
import { absoluteContentUrl, api } from '../lib/api.js';
import Icon, { fileIconName } from './Icon.jsx';
import { useToast } from './Toasts.jsx';

const PREVIEW_TYPES = [...VARIANT.previewText, ...VARIANT.previewImage].join(' і ');

/** Бічна панель: атрибути, вміст (.js як текст, .png як зображення) і дії з файлом. */
export default function PreviewDrawer({ file, onClose, onChanged, onRename, onShare, onDelete }) {
  const toast = useToast();
  const kind = previewKind(file.name);
  const [text, setText] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [size, setSize] = useState(null);
  const replaceInput = useRef(null);

  useEffect(() => {
    setEditing(false);
    setText(null);
    setError(null);
    setSize(null);
    if (kind !== 'text') return undefined;
    let cancelled = false;
    api
      .downloadFile(file.id)
      .then((bytes) => !cancelled && setText(new TextDecoder('utf-8').decode(bytes)))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [file.id, file.hash, kind]);

  async function save() {
    try {
      await api.replaceContent(file.id, file.name, new Blob([draft], { type: 'text/plain' }));
      setText(draft);
      setEditing(false);
      toast(`Збережено нову версію «${file.name}»`, 'success');
      onChanged();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function replace(e) {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    try {
      await api.replaceContent(file.id, file.name, picked);
      toast(`Оновлено «${file.name}»`, 'success');
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const lines = text?.split('\n') ?? [];

  return (
    <aside className="drawer" aria-label={`Файл ${file.name}`}>
      <header className="drawer__head">
        <span className={`file-badge file-badge--${fileIconName(file.ext)}`}>
          <Icon name={fileIconName(file.ext)} size={22} />
        </span>
        <div className="drawer__title">
          <h2 title={file.name}>{file.name}</h2>
          <span className="muted">{file.isOwner ? 'Мій файл' : `Спільний · власник ${file.owner}`}</span>
        </div>
        <button className="icon-btn" onClick={onClose} title="Закрити">
          <Icon name="close" />
        </button>
      </header>

      <div className="drawer__actions">
        <a className="btn btn--primary" href={absoluteContentUrl(file, { download: true })} download={file.name}>
          <Icon name="download" size={16} /> Вивантажити
        </a>
        <button className="btn" onClick={() => replaceInput.current.click()} title="Замінити вміст іншим файлом">
          <Icon name="replace" size={16} /> Нова версія
        </button>
        <input ref={replaceInput} type="file" hidden onChange={replace} />
        {file.isOwner && (
          <>
            <button className="icon-btn icon-btn--bordered" onClick={onRename} title="Перейменувати">
              <Icon name="rename" size={16} />
            </button>
            <button className="icon-btn icon-btn--bordered" onClick={onShare} title="Доступ">
              <Icon name="share" size={16} />
            </button>
            <button className="icon-btn icon-btn--bordered icon-btn--danger" onClick={onDelete} title="Видалити">
              <Icon name="trash" size={16} />
            </button>
          </>
        )}
      </div>

      <dl className="attrs">
        <dt>Розмір</dt>
        <dd>{formatSize(file.size)}</dd>
        <dt>Тип</dt>
        <dd>{file.ext || 'без розширення'}</dd>
        <dt>Створено</dt>
        <dd>{formatDateTime(file.createdAt)}</dd>
        <dt>Змінено</dt>
        <dd>{formatDateTime(file.updatedAt)}</dd>
        <dt>Завантажив</dt>
        <dd>{file.uploadedBy}</dd>
        <dt>Редагував</dt>
        <dd>{file.editedBy ?? '—'}</dd>
        <dt>Власник</dt>
        <dd>{file.owner}</dd>
        {file.isOwner && (
          <>
            <dt>Доступ</dt>
            <dd>{file.shareCount ? `${file.shareCount} корист.` : 'лише я'}</dd>
          </>
        )}
      </dl>

      <section className="drawer__content">
        {!kind && <p className="note">Перегляд вмісту доступний для файлів {PREVIEW_TYPES} (варіант 5).</p>}
        {kind === 'image' && (
          <>
            <div className="content-bar muted">{size ? `${size.w} × ${size.h} px` : 'Зображення'}</div>
            <div className="image-frame">
              <img src={absoluteContentUrl(file)} alt={file.name} onLoad={(e) => setSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })} />
            </div>
          </>
        )}
        {kind === 'text' && error && <p className="note note--error">{error}</p>}
        {kind === 'text' && !error && text === null && <p className="muted">Завантаження вмісту…</p>}
        {kind === 'text' && text !== null && !editing && (
          <>
            <div className="content-bar">
              <span className="muted">{lines.length} рядків · UTF-8</span>
              <button
                className="btn btn--sm"
                onClick={() => {
                  setDraft(text);
                  setEditing(true);
                }}
              >
                <Icon name="edit" size={14} /> Редагувати
              </button>
            </div>
            <pre className="code">
              {lines.map((line, i) => (
                <code key={i}>{line || ' '}</code>
              ))}
            </pre>
          </>
        )}
        {kind === 'text' && editing && (
          <>
            <div className="content-bar">
              <span className="muted">Редагування</span>
              <span className="row-gap">
                <button className="btn btn--sm" onClick={() => setEditing(false)}>
                  Скасувати
                </button>
                <button className="btn btn--sm btn--primary" onClick={save}>
                  <Icon name="check" size={14} /> Зберегти
                </button>
              </span>
            </div>
            <textarea className="code-editor" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} autoFocus />
          </>
        )}
      </section>
    </aside>
  );
}
